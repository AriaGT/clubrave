import csv

from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import IsCustomer, IsOrganizer
from apps.common.errors import DomainError
from apps.events.models import Event
from apps.payments.gateways import PaymentUnavailable, get_gateway
from apps.payments.models import PaymentEvent

from .models import Order, Ticket
from .serializers import (
    CheckoutCreateResponseSerializer,
    CheckoutCreateSerializer,
    OrderDetailSerializer,
    OrderPublicStatusSerializer,
    OrderRefundSerializer,
    OrderSerializer,
    OrderVoidSerializer,
    TicketSerializer,
)
from .services.checkout import BuyerData, CartLine, create_order
from .services.expiry import release_expired_orders
from .services.tickets_email import resend_tickets_email
from .services.void import mark_refunded, void_order, void_ticket


class CheckoutCreateView(APIView):
    """Crea la orden `PENDING` con inventario retenido y abre la sesión de
    pago. El `total` viaja del servidor al navegador, nunca al revés."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkout"

    @extend_schema(request=CheckoutCreateSerializer, responses=CheckoutCreateResponseSerializer)
    def post(self, request):
        serializer = CheckoutCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        event = get_object_or_404(Event, id=data["event_id"])
        release_expired_orders()  # autolimpieza oportunista (§5.5)

        customer = request.user if request.user.is_authenticated else None
        order = create_order(
            event=event,
            items=[CartLine(**item) for item in data["items"]],
            buyer=BuyerData(**data["buyer"]),
            customer=customer,
            terms_accepted=data["terms_accepted"],
        )

        gateway = get_gateway()
        try:
            session = gateway.create_session(order)
        except PaymentUnavailable as exc:
            raise DomainError("PAYMENT_UNAVAILABLE", str(exc)) from exc

        order.gateway = session.gateway
        order.save(update_fields=["gateway"])
        PaymentEvent.objects.create(order=order, kind=PaymentEvent.Kind.SESSION_CREATED)

        return Response(
            {
                "order": OrderSerializer(order).data,
                "payment": {
                    "gateway": session.gateway,
                    "form_token": session.form_token,
                    "public_key": session.public_key,
                    "js_url": session.js_url,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class OrderStatusView(generics.RetrieveAPIView):
    """Estado de la orden para el *polling* post-pago (§7.2). Público y sin
    tickets: ver `OrderPublicStatusSerializer`."""

    serializer_class = OrderPublicStatusSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "code"
    queryset = Order.objects.all()


class MyOrdersListView(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsCustomer]

    def get_queryset(self):
        return Order.objects.filter(customer=self.request.user).prefetch_related("items")


class MyOrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsCustomer]
    lookup_field = "code"

    def get_queryset(self):
        return Order.objects.filter(customer=self.request.user).prefetch_related("items")


class MyOrderTicketsPdfView(APIView):
    """PDF con todas las entradas de la compra, para verlas sin conexión
    o sin datos móviles (§11.4)."""

    permission_classes = [IsCustomer]

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    def get(self, request, code):
        from .services.tickets_pdf import build_tickets_pdf

        order = get_object_or_404(Order.objects.filter(customer=request.user), code=code)
        if order.status != Order.Status.PAID:
            raise DomainError("VALIDATION_ERROR", "Esta orden no tiene entradas emitidas.")

        pdf_bytes = build_tickets_pdf(order)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="entradas-{order.code}.pdf"'
        return response


@extend_schema_view(
    get=extend_schema(
        parameters=[
            OpenApiParameter(
                "status", str, required=False, description="active, used, expired o void."
            )
        ]
    )
)
class MyTicketsView(generics.ListAPIView):
    serializer_class = TicketSerializer
    permission_classes = [IsCustomer]

    def get_queryset(self):
        status_filter = self.request.query_params.get("status")
        base = (
            Ticket.objects.filter(order__customer=self.request.user)
            .select_related("ticket_type", "order", "order__event", "order__event__organization")
            .order_by("-created_at")
        )

        # D2/H16: la pestaña «Anuladas» reúne las entradas VOID y todas las de
        # órdenes canceladas o reembolsadas, con su motivo y el contacto de la
        # organización.
        if status_filter == "void":
            return base.filter(
                Q(status=Ticket.Status.VOID)
                | Q(order__status__in=[Order.Status.CANCELLED, Order.Status.REFUNDED])
            )

        qs = base.filter(order__status=Order.Status.PAID)
        if status_filter == "active":
            return [t for t in qs if t.status == Ticket.Status.VALID and not t.is_expired]
        if status_filter == "used":
            return qs.filter(status=Ticket.Status.CHECKED_IN)
        if status_filter == "expired":
            return [t for t in qs if t.status == Ticket.Status.VALID and t.is_expired]
        return qs


@extend_schema_view(
    get=extend_schema(
        parameters=[
            OpenApiParameter(
                "status",
                str,
                required=False,
                description="PENDING, PAID, FAILED, EXPIRED, CANCELLED o REFUNDED.",
            ),
            OpenApiParameter(
                "q",
                str,
                required=False,
                description="Coincidencia parcial sobre código, email o nombre del comprador (H11).",
            ),
        ]
    )
)
class OrganizerEventOrdersView(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsOrganizer]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "status",
                str,
                required=False,
                description=(
                    "Uno o varios estados separados por coma: PENDING, PAID, "
                    "FAILED, EXPIRED, CANCELLED, REFUNDED."
                ),
            ),
            OpenApiParameter(
                "q",
                str,
                required=False,
                description="Coincidencia parcial sobre código, email o nombre del comprador (H11).",
            ),
        ]
    )
    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)

    def get_queryset(self):
        qs = Order.objects.filter(
            event_id=self.kwargs["event_pk"], event__organization_id=self.request.auth["organization_id"]
        ).prefetch_related("items")

        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(code__icontains=q) | Q(buyer_email__icontains=q) | Q(buyer_name__icontains=q)
            )

        statuses = [
            s.strip()
            for s in (self.request.query_params.get("status") or "").split(",")
            if s.strip()
        ]
        if statuses:
            qs = qs.filter(status__in=statuses)
        return qs


class OrganizerOrderDetailView(generics.RetrieveAPIView):
    """H07 — una venta con todo: comprador, líneas, pasarela, emails y
    entradas emitidas. Se llega por `code` dentro de un evento."""

    serializer_class = OrderDetailSerializer
    permission_classes = [IsOrganizer]
    lookup_field = "code"

    def get_queryset(self):
        return (
            Order.objects.filter(
                event_id=self.kwargs["event_pk"],
                event__organization_id=self.request.auth["organization_id"],
            )
            .prefetch_related("items", "tickets__ticket_type", "event__organization")
        )


class OrderVoidView(APIView):
    """H08 — anular una venta (`PAID` o `PENDING` → `CANCELLED`)."""

    permission_classes = [IsOrganizer]

    @extend_schema(request=OrderVoidSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, code):
        order = get_object_or_404(
            Order.objects.filter(event__organization_id=request.auth["organization_id"]).prefetch_related(
                "items", "tickets", "event__organization"
            ),
            code=code,
        )
        serializer = OrderVoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        impact = void_order(order=order, actor=request.user, **serializer.validated_data)
        return Response(impact, status=status.HTTP_200_OK)


class OrderMarkRefundedView(APIView):
    """H09 — registrar en la plataforma que el dinero ya se devolvió afuera."""

    permission_classes = [IsOrganizer]

    @extend_schema(request=OrderRefundSerializer, responses=OrderDetailSerializer)
    def post(self, request, code):
        order = get_object_or_404(
            Order.objects.filter(event__organization_id=request.auth["organization_id"]).prefetch_related(
                "items", "tickets__ticket_type", "event__organization"
            ),
            code=code,
        )
        serializer = OrderRefundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mark_refunded(order=order, actor=request.user, **serializer.validated_data)
        order.refresh_from_db()  # el servicio muta una instancia bloqueada, no la del view
        return Response(OrderDetailSerializer(order).data, status=status.HTTP_200_OK)


class OrderResendTicketsView(APIView):
    """H10 — reenviar el email de entradas al buyer_email de la orden."""

    permission_classes = [IsOrganizer]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request, code):
        order = get_object_or_404(
            Order.objects.select_related("event__organization").filter(
                event__organization_id=request.auth["organization_id"]
            ),
            code=code,
        )
        result = resend_tickets_email(order=order, actor=request.user)
        return Response(result, status=status.HTTP_200_OK)


class TicketVoidView(APIView):
    """H12 — anular una entrada suelta (`VALID` → `VOID`), la orden no cambia."""

    permission_classes = [IsOrganizer]

    @extend_schema(request=OrderVoidSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, code):
        ticket = get_object_or_404(
            Ticket.objects.select_related("order__event__organization").filter(
                order__event__organization_id=request.auth["organization_id"]
            ),
            code=code,
        )
        serializer = OrderVoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        impact = void_ticket(ticket=ticket, actor=request.user, **serializer.validated_data)
        return Response(impact, status=status.HTTP_200_OK)


class OrganizerEventOrdersCsvView(APIView):
    permission_classes = [IsOrganizer]

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    def get(self, request, event_pk):
        orders = Order.objects.filter(
            event_id=event_pk, event__organization_id=request.auth["organization_id"]
        ).order_by("created_at")

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="ordenes-{event_pk}.csv"'
        writer = csv.writer(response)
        writer.writerow(
            [
                "codigo", "estado", "email", "nombre", "total", "moneda",
                "referencia_pasarela", "creado", "motivo_anulacion", "anulada_en",
                "referencia_reembolso",
            ]
        )
        for order in orders:
            writer.writerow(
                [
                    order.code, order.status, order.buyer_email, order.buyer_name, order.total,
                    order.currency, order.gateway_reference, order.created_at.isoformat(),
                    order.void_reason,
                    order.voided_at.isoformat() if order.voided_at else "",
                    order.refund_reference,
                ]
            )
        return response


class OrganizerEventAttendeesView(generics.ListAPIView):
    serializer_class = TicketSerializer
    permission_classes = [IsOrganizer]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "q", str, required=False, description="Busca por nombre, código o comprador."
            )
        ]
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        queryset = (
            Ticket.objects.filter(
                order__event_id=self.kwargs["event_pk"],
                order__event__organization_id=self.request.auth["organization_id"],
                order__status=Order.Status.PAID,
            )
            .select_related("ticket_type", "order", "order__event")
            .order_by("-created_at")
        )
        q = self.request.query_params.get("q", "").strip()
        if q:
            queryset = queryset.filter(
                Q(holder_name__icontains=q)
                | Q(code__icontains=q)
                | Q(order__code__icontains=q)
                | Q(order__buyer_name__icontains=q)
                | Q(order__buyer_email__icontains=q)
            )
        return queryset
