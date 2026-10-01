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
from apps.payments.gateways import PaymentUnavailable, get_gateway, payments_disabled
from apps.payments.models import PaymentEvent

from .models import GuestCode, Order, Ticket
from .serializers import (
    CheckoutCreateResponseSerializer,
    CheckoutCreateSerializer,
    GuestCodeBatchSerializer,
    GuestCodeGenerateSerializer,
    GuestCodeRedeemSerializer,
    GuestCodeSerializer,
    GuestCodeValidateResponseSerializer,
    GuestCodeValidateSerializer,
    GuestCodeVoidSerializer,
    OrderDetailSerializer,
    OrderPublicStatusSerializer,
    OrderRefundSerializer,
    OrderSerializer,
    OrderVoidSerializer,
    TicketSerializer,
)
from .services.checkout import BuyerData, CartLine, create_order
from .services.expiry import release_expired_orders
from .services.guest_codes import (
    generate_guest_codes,
    redeem_guest_code,
    validate_guest_code,
    void_guest_code,
)
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

        if payments_disabled():  # antes de retener inventario
            raise DomainError("PAYMENT_DISABLED")

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
        order.gateway_order_id = session.provider_order_id
        order.save(update_fields=["gateway", "gateway_order_id"])
        PaymentEvent.objects.create(
            order=order,
            kind=PaymentEvent.Kind.SESSION_CREATED,
            external_id=session.provider_order_id or None,
        )

        return Response(
            {
                "order": OrderSerializer(order).data,
                "payment": {
                    "gateway": session.gateway,
                    "form_token": session.form_token,
                    "public_key": session.public_key,
                    "js_url": session.js_url,
                    "checkout_url": session.checkout_url,
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
                "referencia_reembolso", "invitado",
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
                    "si" if order.is_guest else "no",
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


# ── Códigos de invitado ──────────────────────────────────────────────────────


class GuestCodeIPThrottle(ScopedRateThrottle):
    """Throttle por IP aunque haya sesión: el límite es contra el sondeo de
    códigos desde un mismo origen, no por cuenta (crear cuentas es barato)."""

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


@extend_schema_view(
    get=extend_schema(
        parameters=[
            OpenApiParameter(
                "status", str, required=False, description="AVAILABLE, REDEEMED o VOIDED."
            ),
            OpenApiParameter("ticket_type", str, required=False),
        ],
        responses=GuestCodeSerializer(many=True),
    ),
    post=extend_schema(request=GuestCodeGenerateSerializer, responses=GuestCodeBatchSerializer),
)
class OrganizerGuestCodesView(generics.ListAPIView):
    """Lista (sin paginar, para poder copiar/compartir todos) y genera en lote
    los códigos de invitado de un evento."""

    serializer_class = GuestCodeSerializer
    permission_classes = [IsOrganizer]
    pagination_class = None

    def get_queryset(self):
        qs = GuestCode.objects.filter(
            event_id=self.kwargs["event_pk"],
            event__organization_id=self.request.auth["organization_id"],
        ).select_related("ticket_type", "order")
        status_filter = (self.request.query_params.get("status") or "").strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        ticket_type = (self.request.query_params.get("ticket_type") or "").strip()
        if ticket_type:
            qs = qs.filter(ticket_type_id=ticket_type)
        return qs

    def post(self, request, event_pk):
        event = get_object_or_404(
            Event, pk=event_pk, organization_id=request.auth["organization_id"]
        )
        serializer = GuestCodeGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codes = generate_guest_codes(
            event=event,
            ticket_type_id=serializer.validated_data["ticket_type_id"],
            quantity=serializer.validated_data["quantity"],
            label=serializer.validated_data["label"],
            actor=request.user,
        )
        return Response(
            {
                "batch_id": str(codes[0].batch_id),
                "codes": GuestCodeSerializer(codes, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )


class OrganizerGuestCodeVoidView(APIView):
    """Anula un código de invitado que todavía no se usó y libera su cupo."""

    permission_classes = [IsOrganizer]

    @extend_schema(request=GuestCodeVoidSerializer, responses=GuestCodeSerializer)
    def post(self, request, pk):
        guest_code = get_object_or_404(
            GuestCode.objects.filter(event__organization_id=request.auth["organization_id"]), pk=pk
        )
        serializer = GuestCodeVoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        guest_code = void_guest_code(
            guest_code=guest_code, actor=request.user, reason=serializer.validated_data["reason"]
        )
        return Response(GuestCodeSerializer(guest_code).data)


def _guest_code_summary(guest_code: GuestCode) -> dict:
    event = guest_code.event
    ticket_type = guest_code.ticket_type
    return {
        "code": guest_code.code,
        "event": {
            "id": str(event.id),
            "slug": event.slug,
            "title": event.title,
            "min_age": event.min_age,
        },
        "ticket_type": {
            "id": str(ticket_type.id),
            "name": ticket_type.name,
            "description": ticket_type.description,
        },
    }


class GuestCodeValidateView(APIView):
    """Público: ¿este código sirve para este evento y qué entrada/zona da?
    No redime nada. Limitado por IP contra la enumeración de códigos."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [GuestCodeIPThrottle]
    throttle_scope = "guest_code"

    @extend_schema(request=GuestCodeValidateSerializer, responses=GuestCodeValidateResponseSerializer)
    def post(self, request):
        serializer = GuestCodeValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        guest_code = validate_guest_code(
            raw_code=serializer.validated_data["code"],
            event_id=serializer.validated_data["event_id"],
        )
        return Response(_guest_code_summary(guest_code))


class GuestCodeRedeemView(APIView):
    """Redime el código y emite la entrada de cortesía (sin pasarela).

    Exige sesión de comprador (el mismo OTP del checkout): la entrada queda en
    su cuenta y el email de entradas va a su dirección verificada."""

    permission_classes = [IsCustomer]
    throttle_classes = [GuestCodeIPThrottle]
    throttle_scope = "guest_code"

    @extend_schema(request=GuestCodeRedeemSerializer, responses=OrderSerializer)
    def post(self, request):
        serializer = GuestCodeRedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        buyer = BuyerData(**{**data["buyer"], "email": request.user.email})
        result = redeem_guest_code(
            raw_code=data["code"],
            event_id=data["event_id"],
            buyer=buyer,
            customer=request.user,
            terms_accepted=data["terms_accepted"],
        )
        order = Order.objects.prefetch_related("items", "tickets__ticket_type").get(pk=result.order.pk)
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)
