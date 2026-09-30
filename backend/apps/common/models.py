from uuid import uuid4

from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    """Modelo base: UUID como PK (evita filtrar volumen de negocio en URLs)."""

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditLog(models.Model):
    """Rastro de acciones de control (H02, H04–H06, H14 del plan de controles).

    Escritura exclusiva desde los servicios, con `record()` en
    `apps/common/audit.py`; nunca se edita ni se borra desde la API. Guarda
    una fotografía del actor y del objetivo para que la línea siga teniendo
    sentido aunque el usuario o el objeto desaparezcan después.
    """

    class Action(models.TextChoices):
        EVENT_PUBLISHED = "EVENT_PUBLISHED"
        EVENT_UNPUBLISHED = "EVENT_UNPUBLISHED"
        EVENT_UPDATED = "EVENT_UPDATED"
        EVENT_CANCELLED = "EVENT_CANCELLED"
        EVENT_DELETED = "EVENT_DELETED"
        EVENT_SALES_PAUSED = "EVENT_SALES_PAUSED"
        EVENT_SALES_RESUMED = "EVENT_SALES_RESUMED"
        EVENT_ANNOUNCED = "EVENT_ANNOUNCED"
        IMAGE_DELETED = "IMAGE_DELETED"
        ORDER_VOIDED = "ORDER_VOIDED"
        ORDER_REFUND_MARKED = "ORDER_REFUND_MARKED"
        TICKETS_RESENT = "TICKETS_RESENT"
        TICKET_VOIDED = "TICKET_VOIDED"
        CHECKIN_UNDONE = "CHECKIN_UNDONE"

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.CASCADE, related_name="audit_logs"
    )
    actor = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs"
    )
    actor_email = models.CharField(max_length=150)  # fotografía: sobrevive al borrado
    action = models.CharField(max_length=32, choices=Action.choices)
    target_type = models.CharField(max_length=16, blank=True)  # "event" | "order" | "ticket" | ...
    target_id = models.UUIDField(null=True, blank=True)
    target_label = models.CharField(max_length=150, blank=True)  # "TK-7F3A", "Sesión 02"
    event = models.ForeignKey(
        "events.Event", on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs"
    )
    reason = models.TextField(blank=True)
    metadata = models.JSONField(default=dict)  # impacto: {"recipients": 31, ...}

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "-created_at"]),
            models.Index(fields=["event", "-created_at"]),
            models.Index(fields=["target_type", "target_id"]),
        ]

    def __str__(self):
        return f"{self.action} — {self.target_label} — {self.actor_email}"
