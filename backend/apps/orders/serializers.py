from rest_framework import serializers

from .models import Order, OrderItem, Ticket
from .services.checkout import BuyerData, CartLine
from .services.codes import sign_ticket_code
from .services.tickets_email import resends_today
from .services.void import VOID_REASON_CODES


class RevenueStatsSerializer(serializers.Serializer):
    gross = serializers.DecimalField(max_digits=10, decimal_places=2)
    currency = serializers.CharField()
    orders_paid = serializers.IntegerField()


class TicketCountStatsSerializer(serializers.Serializer):
    sold = serializers.IntegerField()
    capacity = serializers.IntegerField()
    checked_in = serializers.IntegerField()


class TicketTypeStatsSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    price = serializers.CharField()
    sold = serializers.IntegerField()
    total = serializers.IntegerField()
    available = serializers.IntegerField()
    checked_in = serializers.IntegerField()
    revenue = serializers.CharField()


class Last24hStatsSerializer(serializers.Serializer):
    orders = serializers.IntegerField()
    tickets = serializers.IntegerField()


class EventStatsSerializer(serializers.Serializer):
    revenue = RevenueStatsSerializer()
    tickets = TicketCountStatsSerializer()
    by_ticket_type = TicketTypeStatsSerializer(many=True)
    last_24h = Last24hStatsSerializer()
    generated_at = serializers.DateTimeField()


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["ticket_type_name", "unit_price", "quantity", "subtotal"]


class TicketSerializer(serializers.ModelSerializer):
    ticket_type_name = serializers.CharField(source="ticket_type.name", read_only=True)
    order_code = serializers.CharField(source="order.code", read_only=True)
    event_title = serializers.CharField(source="order.event.title", read_only=True)
    organization_name = serializers.CharField(source="order.event.organization.name", read_only=True)
    organization_contact_email = serializers.CharField(
        source="order.event.organization.contact_email", read_only=True
    )
    is_expired = serializers.BooleanField(read_only=True)
    checked_in_by_email = serializers.CharField(read_only=True)
    qr_payload = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "code", "status", "holder_name", "ticket_type_name",
            "order_code", "event_title", "organization_name", "organization_contact_email",
            "checked_in_at", "checked_in_by_email", "voided_at", "void_reason",
            "is_expired", "qr_payload",
        ]

    def get_qr_payload(self, obj: Ticket) -> str:
        return sign_ticket_code(obj.code)


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    tickets = TicketSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "code", "status", "currency", "subtotal", "service_fee", "total",
            "expires_at", "paid_at", "buyer_email", "buyer_name",
            "voided_at", "void_reason", "refunded_at", "refund_reference",
            "items", "tickets", "created_at",
        ]


class OrderTicketSerializer(serializers.ModelSerializer):
    """Una fila de entradas para el detalle de la orden (H07): el código, su
    estado y, si ingresó, quién y cuándo la validó."""

    ticket_type_name = serializers.CharField(source="ticket_type.name", read_only=True)
    checked_in_by_email = serializers.CharField(read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id", "code", "status", "holder_name", "ticket_type_name",
            "checked_in_at", "checked_in_by_email", "voided_at", "void_reason",
        ]


class OrderDetailSerializer(serializers.ModelSerializer):
    """Detalle completo de una venta para el organizador (H07): comprador,
    líneas, pasarela, emails enviados y cada entrada emitida."""

    items = OrderItemSerializer(many=True, read_only=True)
    tickets = OrderTicketSerializer(many=True, read_only=True)
    resends_today = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "code", "status", "currency", "subtotal", "service_fee", "total",
            "created_at", "paid_at", "voided_at", "void_reason_code", "void_reason",
            "refund_reference", "refunded_at",
            "buyer_email", "buyer_name", "buyer_phone", "buyer_document",
            "gateway", "gateway_reference",
            "tickets_email_sent_at", "resends_today",
            "items", "tickets",
        ]

    def get_resends_today(self, obj: Order) -> int:
        return resends_today(obj.id)


class OrderVoidSerializer(serializers.Serializer):
    reason_code = serializers.ChoiceField(choices=VOID_REASON_CODES)
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    restock = serializers.BooleanField(required=False, default=True)


class OrderRefundSerializer(serializers.Serializer):
    refund_reference = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )


class OrderPublicStatusSerializer(serializers.ModelSerializer):
    """Para `GET /api/checkout/orders/{code}/`, público y sin autenticación
    (§6.1): solo lo necesario para el *polling* de "¿ya se pagó?". Nunca
    incluye `tickets` — el código de la orden es adivinable-ish y no es un
    secreto, así que exponer QR reales detrás de él sería un agujero."""

    class Meta:
        model = Order
        fields = ["code", "status", "currency", "subtotal", "service_fee", "total", "expires_at", "paid_at"]


class CartLineSerializer(serializers.Serializer):
    ticket_type_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)

    def to_cart_line(self) -> CartLine:
        return CartLine(**self.validated_data)


class BuyerSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    document_id = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")

    def to_buyer_data(self) -> BuyerData:
        return BuyerData(**self.validated_data)


class CheckoutCreateSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()
    items = CartLineSerializer(many=True)
    buyer = BuyerSerializer()
    terms_accepted = serializers.BooleanField()


class PaymentSessionSerializer(serializers.Serializer):
    gateway = serializers.CharField()
    form_token = serializers.CharField()
    public_key = serializers.CharField()
    js_url = serializers.CharField(allow_blank=True)


class CheckoutCreateResponseSerializer(serializers.Serializer):
    order = OrderSerializer()
    payment = PaymentSessionSerializer()
