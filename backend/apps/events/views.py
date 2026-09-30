from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view, inline_serializer
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.permissions import IsOrganizer
from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.models import AuditLog
from apps.common.serializers import AuditLogSerializer
from apps.orders.models import Order
from apps.orders.serializers import EventStatsSerializer
from apps.orders.services.cancellation import cancel_event as cancel_event_service
from apps.orders.services.cancellation import preview_event_cancellation

from .models import Event, EventImage, TicketType
from .serializers import (
    AnnounceResultSerializer,
    AnnounceSerializer,
    CancelEventSerializer,
    CancelPreviewSerializer,
    ChangeImpactSerializer,
    DeleteEventSerializer,
    EventImageSerializer,
    EventOrganizerSerializer,
    EventPublicDetailSerializer,
    EventPublicListSerializer,
    PauseSalesSerializer,
    ReorderImagesSerializer,
    TicketTypeSerializer,
    UnpublishSerializer,
)
from .services.announce import announce


class EventPublicFilter(filters.FilterSet):
    city = filters.CharFilter(field_name="city", lookup_expr="iexact")
    q = filters.CharFilter(method="filter_q")
    from_date = filters.IsoDateTimeFilter(field_name="starts_at", lookup_expr="gte")
    to_date = filters.IsoDateTimeFilter(field_name="starts_at", lookup_expr="lte")

    class Meta:
        model = Event
        fields = ["city"]

    def filter_q(self, queryset, name, value):
        return queryset.filter(title__icontains=value)


class EventPublicViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public"
    lookup_field = "slug"
    filterset_class = EventPublicFilter

    def get_queryset(self):
        qs = Event.objects.filter(status=Event.Status.PUBLISHED, starts_at__gte=timezone.now())
        return qs.prefetch_related("images", "ticket_types")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return EventPublicDetailSerializer
        return EventPublicListSerializer


class OrganizerScopedMixin:
    """Regla A6: la organización se deriva del JWT, nunca del cuerpo/query."""

    permission_classes = [IsOrganizer]

    def get_organization_id(self):
        return self.request.auth["organization_id"]


def _changed_editable_fields(instance, validated_data: dict) -> dict:
    """Devuelve {campo: {"old": ..., "new": ...}} de los campos editables que
    realmente cambiaron, en forma serializable para la bitácora."""
    editable = (
        "title", "description", "starts_at", "ends_at", "venue_name",
        "address", "city", "maps_url", "min_age",
    )
    changed = {}
    for field in editable:
        if field not in validated_data:
            continue
        old = getattr(instance, field)
        new = validated_data[field]
        if old != new:
            changed[field] = {
                "old": _fmt_value(old),
                "new": _fmt_value(new),
            }
    return changed


def _fmt_value(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("status", str, required=False, description="DRAFT, PUBLISHED o CANCELLED.")
        ]
    )
)
class OrganizerEventViewSet(OrganizerScopedMixin, viewsets.ModelViewSet):
    serializer_class = EventOrganizerSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        return Event.objects.filter(organization_id=self.get_organization_id()).prefetch_related(
            "images", "ticket_types"
        )

    def perform_create(self, serializer):
        serializer.save(organization_id=self.get_organization_id())

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.status == Event.Status.CANCELLED:
            raise DomainError(
                "EVENT_CANCELLED",
                "Este evento fue cancelado: no se puede modificar la información.",
            )
        changed = _changed_editable_fields(instance, serializer.validated_data)
        serializer.save()
        if changed:
            record(
                actor=self.request.user,
                organization=instance.organization,
                action=AuditLog.Action.EVENT_UPDATED,
                target=instance,
                metadata={"fields": changed},
            )

    def destroy(self, request, *args, **kwargs):
        """H15 — nivel 3: borrar exige motivo y escribir el título. Nunca se
        borra un evento con ventas ni uno cancelado (terminal por diseño)."""
        event = self.get_object()
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no se puede borrar.")
        if event.ticket_types.filter(quantity_sold__gt=0).exists():
            raise DomainError("VALIDATION_ERROR", "No puedes borrar un evento con ventas.")

        serializer = DeleteEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["confirm_title"].strip() != event.title:
            raise DomainError(
                "VALIDATION_ERROR",
                "Escribe el título del evento tal cual para confirmar.",
                details={"confirm_title": event.title},
            )

        with transaction.atomic():
            record(
                actor=request.user,
                organization=event.organization,
                action=AuditLog.Action.EVENT_DELETED,
                target=event,
                reason=serializer.validated_data["reason"],
            )
            event.delete()
        return Response(status=204)

    @extend_schema(request=None, responses=EventOrganizerSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        event = self.get_object()
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no se puede publicar.")
        errors = event.publish_requirements_errors()
        if errors:
            raise DomainError("VALIDATION_ERROR", " ".join(errors), details={"errors": errors})
        event.status = Event.Status.PUBLISHED
        event.published_at = timezone.now()
        event.save(update_fields=["status", "published_at", "updated_at"])
        record(
            actor=request.user,
            organization=event.organization,
            action=AuditLog.Action.EVENT_PUBLISHED,
            target=event,
        )
        return Response(self.get_serializer(event).data)

    @extend_schema(request=UnpublishSerializer, responses=EventOrganizerSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        event = self.get_object()
        serializer = UnpublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no se puede despublicar.")
        if Order.objects.filter(event=event, status=Order.Status.PAID).exists():
            raise DomainError(
                "EVENT_HAS_SALES",
                "Este evento ya tiene ventas. Usa Pausar venta si quieres frenar las compras, o "
                "Cancelar evento si no se va a realizar.",
            )
        event.status = Event.Status.DRAFT
        event.save(update_fields=["status", "updated_at"])
        record(
            actor=request.user,
            organization=event.organization,
            action=AuditLog.Action.EVENT_UNPUBLISHED,
            target=event,
            reason=serializer.validated_data["reason"],
        )
        return Response(self.get_serializer(event).data)

    @extend_schema(request=PauseSalesSerializer, responses=EventOrganizerSerializer)
    @action(detail=True, methods=["post"], url_path="pause-sales")
    def pause_sales(self, request, pk=None):
        event = self.get_object()
        serializer = PauseSalesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        paused = serializer.validated_data["paused"]
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no admite venta.")
        if event.status != Event.Status.PUBLISHED:
            raise DomainError("VALIDATION_ERROR", "Solo un evento publicado admite pausar la venta.")

        if paused and not event.sales_paused_at:
            event.sales_paused_at = timezone.now()
            event.save(update_fields=["sales_paused_at", "updated_at"])
            record(
                actor=request.user,
                organization=event.organization,
                action=AuditLog.Action.EVENT_SALES_PAUSED,
                target=event,
            )
        elif not paused and event.sales_paused_at:
            event.sales_paused_at = None
            event.save(update_fields=["sales_paused_at", "updated_at"])
            record(
                actor=request.user,
                organization=event.organization,
                action=AuditLog.Action.EVENT_SALES_RESUMED,
                target=event,
            )
        return Response(self.get_serializer(event).data)

    @extend_schema(request=AnnounceSerializer, responses=AnnounceResultSerializer)
    @action(detail=True, methods=["post"])
    def announce(self, request, pk=None):
        event = self.get_object()
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no admite comunicados.")
        serializer = AnnounceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = announce(event=event, actor=request.user, **serializer.validated_data)
        return Response(result)

    @extend_schema(request=None, responses=ChangeImpactSerializer)
    @action(detail=True, methods=["get"], url_path="change-impact")
    def change_impact(self, request, pk=None):
        event = self.get_object()
        paid = Order.objects.filter(event=event, status=Order.Status.PAID)
        return Response(
            {
                "paid_orders": paid.count(),
                "distinct_buyers": paid.values("buyer_email").distinct().count(),
            }
        )

    @extend_schema(request=None, responses=CancelPreviewSerializer)
    @action(detail=True, methods=["get"], url_path="cancel-preview")
    def cancel_preview(self, request, pk=None):
        event = self.get_object()
        return Response(preview_event_cancellation(event=event))

    @extend_schema(request=CancelEventSerializer, responses=CancelPreviewSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        event = self.get_object()
        serializer = CancelEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        impact = cancel_event_service(
            event=event,
            actor=request.user,
            reason_code=serializer.validated_data["reason_code"],
            reason=serializer.validated_data["reason"],
            confirm_title=serializer.validated_data["confirm_title"],
        )
        return Response(impact)

    @extend_schema(
        request=None,
        responses=inline_serializer(
            name="PaginatedEventAudit",
            fields={
                "count": serializers.IntegerField(),
                "next": serializers.URLField(allow_null=True, required=False, default=None),
                "previous": serializers.URLField(allow_null=True, required=False, default=None),
                "results": AuditLogSerializer(many=True),
            },
        ),
    )
    @action(detail=True, methods=["get"])
    def audit(self, request, pk=None):
        event = self.get_object()
        qs = event.audit_logs.select_related("actor").all()
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(AuditLogSerializer(page, many=True).data)

    @extend_schema(request=None, responses=EventStatsSerializer)
    @action(detail=True, methods=["get"])
    def stats(self, request, pk=None):
        from apps.orders.services.stats import event_stats

        event = self.get_object()
        return Response(event_stats(event=event))


class OrganizerEventImageViewSet(OrganizerScopedMixin, viewsets.ModelViewSet):
    serializer_class = EventImageSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        return EventImage.objects.filter(
            event_id=self.kwargs["event_pk"], event__organization_id=self.get_organization_id()
        )

    def _get_event(self):
        return get_object_or_404(
            Event, pk=self.kwargs["event_pk"], organization_id=self.get_organization_id()
        )

    def perform_create(self, serializer):
        event = self._get_event()
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no admite cambios de imágenes.")
        # La selección es por tipo: la primera imagen de cada tipo queda elegida.
        kind = serializer.validated_data.get("kind", EventImage.Kind.FLYER)
        same_kind = event.images.filter(kind=kind)
        is_cover = serializer.validated_data.get("is_cover", False) or not same_kind.exists()
        if is_cover:
            same_kind.filter(is_cover=True).update(is_cover=False)
        serializer.save(event=event, kind=kind, is_cover=is_cover)

    def perform_update(self, serializer):
        event = self._get_event()
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no admite cambios de imágenes.")
        if serializer.validated_data.get("is_cover"):
            event.images.filter(kind=serializer.instance.kind, is_cover=True).update(is_cover=False)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        image = self.get_object()
        event = self._get_event()
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no admite cambios de imágenes.")

        # D5 — un evento publicado nunca se queda sin flyer (zonas y mapa son opcionales).
        same_kind = event.images.filter(kind=image.kind)
        if (
            event.status == Event.Status.PUBLISHED
            and image.kind == EventImage.Kind.FLYER
            and same_kind.count() <= 1
        ):
            raise DomainError(
                "LAST_IMAGE",
                "Un evento publicado necesita al menos un flyer. Sube el nuevo antes de borrar este.",
            )

        was_cover = image.is_cover
        image.delete()
        if was_cover:
            remaining = same_kind.first()
            if remaining:
                remaining.is_cover = True
                remaining.save(update_fields=["is_cover"])
        record(
            actor=request.user,
            organization=event.organization,
            action=AuditLog.Action.IMAGE_DELETED,
            target=image,
            event=event,
        )
        return Response(status=204)

    @extend_schema(request=ReorderImagesSerializer, responses=EventImageSerializer(many=True))
    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request, event_pk=None):
        event = self._get_event()
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no admite cambios de imágenes.")
        serializer = ReorderImagesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order_ids = [str(uid) for uid in serializer.validated_data["order"]]
        existing_ids = {str(i) for i in event.images.values_list("id", flat=True)}
        if set(order_ids) != existing_ids or len(order_ids) != len(existing_ids):
            raise DomainError(
                "VALIDATION_ERROR",
                "El orden debe incluir exactamente las imágenes del evento, sin repetir.",
            )

        with transaction.atomic():
            for position, image_id in enumerate(order_ids):
                EventImage.objects.filter(id=image_id, event=event).update(position=position)
        return Response(
            EventImageSerializer(event.images.all(), many=True, context={"request": request}).data
        )


class OrganizerTicketTypeViewSet(OrganizerScopedMixin, viewsets.ModelViewSet):
    serializer_class = TicketTypeSerializer
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        qs = TicketType.objects.filter(event__organization_id=self.get_organization_id())
        if "event_pk" in self.kwargs:
            qs = qs.filter(event_id=self.kwargs["event_pk"])
        return qs

    def perform_create(self, serializer):
        event = get_object_or_404(
            Event, pk=self.kwargs["event_pk"], organization_id=self.get_organization_id()
        )
        if event.status == Event.Status.CANCELLED:
            raise DomainError("EVENT_CANCELLED", "Un evento cancelado no admite cambios de entradas.")
        serializer.save(event=event)

    def destroy(self, request, *args, **kwargs):
        ticket_type = self.get_object()
        if ticket_type.quantity_sold > 0:
            raise DomainError("VALIDATION_ERROR", "No puedes borrar un tipo de entrada con ventas.")
        if ticket_type.guest_codes.exists():
            raise DomainError(
                "VALIDATION_ERROR",
                "No puedes borrar un tipo de entrada con códigos de invitado. Desactívalo en su lugar.",
            )
        return super().destroy(request, *args, **kwargs)