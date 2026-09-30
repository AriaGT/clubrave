from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.events.models import Event, TicketType


class Order(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pendiente"
        PAID = "PAID", "Pagada"
        FAILED = "FAILED", "Fallida"
        EXPIRED = "EXPIRED", "Vencida"
        CANCELLED = "CANCELLED", "Cancelada"
        REFUNDED = "REFUNDED", "Reembolsada"

    # Transiciones válidas desde cada estado (ver §4.3 del plan).
    VALID_TRANSITIONS = {
        Status.PENDING: {Status.PAID, Status.FAILED, Status.EXPIRED, Status.CANCELLED},
        Status.PAID: {Status.REFUNDED, Status.CANCELLED},
        Status.FAILED: set(),
        Status.EXPIRED: set(),
        Status.CANCELLED: {Status.REFUNDED},  # H09 — el reembolso se registra aparte
        Status.REFUNDED: set(),  # terminal
    }

    code = models.CharField(max_length=16, unique=True)
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name="orders")
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders", null=True, blank=True
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    service_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="PEN")

    buyer_email = models.EmailField()
    buyer_name = models.CharField(max_length=150)
    buyer_phone = models.CharField(max_length=32, blank=True)
    buyer_document = models.CharField(max_length=32, blank=True)

    expires_at = models.DateTimeField()
    paid_at = models.DateTimeField(null=True, blank=True)

    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    terms_version = models.CharField(max_length=16, blank=True)

    gateway = models.CharField(max_length=32, default="fake")
    gateway_reference = models.CharField(max_length=100, blank=True)

    tickets_email_sent_at = models.DateTimeField(null=True, blank=True)

    # H08 — anulación de una venta (el email y el CSV leen estos campos
    # denormalizados; el detalle vive además en la bitácora, ver §5.2).
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason_code = models.CharField(max_length=24, blank=True)
    void_reason = models.CharField(max_length=200, blank=True)

    # H09 — registro de reembolso fuera de la plataforma (nunca limpia `total`).
    refund_reference = models.CharField(max_length=120, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event", "status"]),
            models.Index(fields=["buyer_email"]),
            models.Index(fields=["customer", "-created_at"]),
            models.Index(fields=["status", "expires_at"]),
        ]

    def __str__(self):
        return self.code

    def can_transition_to(self, to_status: str) -> bool:
        return to_status in self.VALID_TRANSITIONS.get(self.status, set())


class OrderItem(TimeStampedModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    ticket_type = models.ForeignKey(TicketType, on_delete=models.PROTECT, related_name="order_items")
    ticket_type_name = models.CharField(max_length=60)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.quantity}x {self.ticket_type_name} — {self.order.code}"


class Ticket(TimeStampedModel):
    class Status(models.TextChoices):
        VALID = "VALID", "Válida"
        CHECKED_IN = "CHECKED_IN", "Usada"
        VOID = "VOID", "Anulada"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="tickets")
    ticket_type = models.ForeignKey(TicketType, on_delete=models.PROTECT, related_name="tickets")
    code = models.CharField(max_length=32, unique=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.VALID)
    holder_name = models.CharField(max_length=150, blank=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="checked_in_tickets",
        null=True,
        blank=True,
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        indexes = [models.Index(fields=["order"]), models.Index(fields=["status"])]

    def __str__(self):
        return self.code

    @property
    def is_expired(self) -> bool:
        """El vencimiento se deriva del evento; no se persiste (ver §4.2)."""
        return timezone.now() > self.order.event.effective_ends_at

    @property
    def checked_in_by_email(self) -> str | None:
        return self.checked_in_by.email if self.checked_in_by_id else None
