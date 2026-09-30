from django.db import models

from apps.common.models import TimeStampedModel


class PaymentEvent(TimeStampedModel):
    """Bitácora de todo lo que ocurre con el pago de una orden: auditoría,
    soporte al cliente e idempotencia en una sola tabla (ver §4.2)."""

    class Kind(models.TextChoices):
        SESSION_CREATED = "SESSION_CREATED", "Sesión creada"
        BROWSER_RETURN = "BROWSER_RETURN", "Retorno del navegador"
        IPN = "IPN", "Notificación de la pasarela"
        MANUAL = "MANUAL", "Manual"

    order = models.ForeignKey(
        "orders.Order", on_delete=models.CASCADE, related_name="payment_events", null=True, blank=True
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    external_id = models.CharField(max_length=100, blank=True, null=True)
    signature_valid = models.BooleanField(null=True, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)  # nunca se expone por la API
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["order", "kind", "external_id"], name="unique_payment_event_per_external_id"
            ),
        ]
        ordering = ["-received_at"]

    def __str__(self):
        return f"{self.kind} — {self.order.code}"
