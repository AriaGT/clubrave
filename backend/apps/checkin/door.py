"""Acceso del personal de seguridad al escáner.

Reglas que aplican SOLO a sesiones con scope "door" (el organizador no las
tiene):

- Solo eventos publicados de su organización y, si su membresía está
  restringida, solo los eventos asignados.
- Solo dentro de la ventana del escáner: desde
  `CHECKIN_WINDOW_HOURS_BEFORE_START` horas antes del inicio hasta
  `CHECKIN_WINDOW_HOURS_AFTER_END` horas después del fin
  (`Event.effective_ends_at`). Fuera de ella el check-in responde
  `SCANNER_CLOSED` (409) con `opens_at`/`closes_at` en `details`.

También expone `GET /api/org/door/events/` (+ detalle): la lista de eventos
habilitados para escanear, con la ventana calculada, que usa la pantalla de
escáner tanto del organizador como del personal de seguridad.
"""

from datetime import timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers

from apps.accounts.permissions import CanScan, is_door_session
from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.models import AuditLog
from apps.events.models import Event
from apps.orders.models import Ticket

_MONTHS = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
]


def scan_window(event: Event):
    """(abre, cierra) del escáner para el personal de seguridad."""
    opens_at = event.starts_at - timedelta(hours=settings.CHECKIN_WINDOW_HOURS_BEFORE_START)
    closes_at = event.effective_ends_at + timedelta(hours=settings.CHECKIN_WINDOW_HOURS_AFTER_END)
    return opens_at, closes_at


def _human(value, tz_name: str) -> str:
    try:
        tz = ZoneInfo(tz_name)
    except Exception:  # noqa: BLE001 — zona mal configurada: cae a la del proyecto
        tz = ZoneInfo(settings.TIME_ZONE)
    local = value.astimezone(tz)
    return f"el {local.day} de {_MONTHS[local.month - 1]} a las {local:%H:%M}"


def _event_for_door(request, event_id) -> Event:
    try:
        UUID(str(event_id))
    except (TypeError, ValueError):
        raise DomainError("VALIDATION_ERROR", "Falta el evento o no es válido.") from None
    membership = request.door_membership
    event = (
        Event.objects.select_related("organization")
        .filter(id=event_id, organization_id=request.auth["organization_id"])
        .first()
    )
    if event is None or event.status != Event.Status.PUBLISHED or not membership.can_scan_event(event):
        raise DomainError("FORBIDDEN", "No tienes acceso al escáner de este evento.")
    return event


def ensure_door_can_scan(request, event_id) -> None:
    """Llamar antes de cualquier check-in o consulta. No hace nada para el
    organizador; para seguridad valida evento asignado y ventana horaria."""
    if not is_door_session(request):
        return
    event = _event_for_door(request, event_id)
    opens_at, closes_at = scan_window(event)
    now = timezone.now()
    if opens_at <= now <= closes_at:
        return
    tz_name = event.organization.timezone
    if now < opens_at:
        message = f"El escáner se habilita {_human(opens_at, tz_name)}."
    else:
        message = f"El escáner de este evento cerró {_human(closes_at, tz_name)}."
    raise DomainError(
        "SCANNER_CLOSED",
        message,
        details={
            "opens_at": opens_at.isoformat(),
            "closes_at": closes_at.isoformat(),
            "event_title": event.title,
        },
    )


def record_door_check_in(request, ticket: Ticket, *, via: str) -> None:
    """Bitácora de quién escaneó cuando es un empleado de seguridad. El
    organizador ya queda en `Ticket.checked_in_by`; para el empleado se deja
    además una fotografía (email) que sobrevive si luego se le elimina."""
    if not is_door_session(request):
        return
    event = ticket.order.event
    record(
        actor=request.user,
        organization=event.organization,
        action=AuditLog.Action.TICKET_CHECKED_IN,
        target=ticket,
        event=event,
        order_code=ticket.order.code,
        via=via,
    )


class DoorEventSerializer(serializers.ModelSerializer):
    scanner_opens_at = serializers.SerializerMethodField()
    scanner_closes_at = serializers.SerializerMethodField()
    scanner_is_open = serializers.SerializerMethodField()
    checked_in_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = [
            "id",
            "title",
            "status",
            "starts_at",
            "ends_at",
            "venue_name",
            "city",
            "scanner_opens_at",
            "scanner_closes_at",
            "scanner_is_open",
            "checked_in_count",
        ]
        read_only_fields = fields

    def get_scanner_opens_at(self, obj) -> str:
        return scan_window(obj)[0].isoformat()

    def get_scanner_closes_at(self, obj) -> str:
        return scan_window(obj)[1].isoformat()

    def get_scanner_is_open(self, obj) -> bool:
        """Para el organizador siempre True (no tiene restricción horaria)."""
        request = self.context.get("request")
        if request is None or not is_door_session(request):
            return True
        opens_at, closes_at = scan_window(obj)
        return opens_at <= timezone.now() <= closes_at


class _DoorEventQuerysetMixin:
    serializer_class = DoorEventSerializer
    permission_classes = [CanScan]

    def get_queryset(self):
        qs = Event.objects.filter(
            organization_id=self.request.auth["organization_id"], status=Event.Status.PUBLISHED
        ).annotate(
            checked_in_count=Count(
                "orders__tickets", filter=Q(orders__tickets__status=Ticket.Status.CHECKED_IN)
            )
        )
        if is_door_session(self.request):
            membership = self.request.door_membership
            if not membership.all_events:
                qs = qs.filter(security_memberships=membership)
        return qs.order_by("starts_at")


class DoorEventListView(_DoorEventQuerysetMixin, generics.ListAPIView):
    """Eventos habilitados para escanear. Al personal de seguridad solo se
    le muestran los que aún no terminaron (los pasados no le sirven)."""

    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        if is_door_session(self.request):
            # Cota amplia en SQL; el corte exacto (fin efectivo + margen) se
            # hace en Python porque `ends_at` puede ser nulo.
            qs = qs.filter(starts_at__gte=timezone.now() - timedelta(days=2))
            now = timezone.now()
            return [e for e in qs if scan_window(e)[1] >= now]
        return qs

    @extend_schema(responses=DoorEventSerializer(many=True))
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class DoorEventDetailView(_DoorEventQuerysetMixin, generics.RetrieveAPIView):
    def get_object(self):
        return get_object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
