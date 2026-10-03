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
        SITE_SETTINGS_UPDATED = "SITE_SETTINGS_UPDATED"
        PAYMENT_SETTINGS_UPDATED = "PAYMENT_SETTINGS_UPDATED"
        ORDER_VOIDED = "ORDER_VOIDED"
        ORDER_REFUND_MARKED = "ORDER_REFUND_MARKED"
        ORDER_MANUAL_SALE = "ORDER_MANUAL_SALE"
        TICKETS_RESENT = "TICKETS_RESENT"
        TICKET_VOIDED = "TICKET_VOIDED"
        CHECKIN_UNDONE = "CHECKIN_UNDONE"
        GUEST_CODES_GENERATED = "GUEST_CODES_GENERATED"
        GUEST_CODE_VOIDED = "GUEST_CODE_VOIDED"
        GUEST_CODE_REDEEMED = "GUEST_CODE_REDEEMED"
        # Empleados de seguridad y lo que escanean.
        EMPLOYEE_CREATED = "EMPLOYEE_CREATED"
        EMPLOYEE_UPDATED = "EMPLOYEE_UPDATED"
        EMPLOYEE_DEACTIVATED = "EMPLOYEE_DEACTIVATED"
        EMPLOYEE_REACTIVATED = "EMPLOYEE_REACTIVATED"
        EMPLOYEE_PASSWORD_RESET = "EMPLOYEE_PASSWORD_RESET"
        EMPLOYEE_DELETED = "EMPLOYEE_DELETED"
        TICKET_CHECKED_IN = "TICKET_CHECKED_IN"
        # Consola de administración (/api/admin/): organizaciones y usuarios.
        ORGANIZATION_CREATED = "ORGANIZATION_CREATED"
        ORGANIZATION_UPDATED = "ORGANIZATION_UPDATED"
        ORGANIZATION_DEACTIVATED = "ORGANIZATION_DEACTIVATED"
        ORGANIZATION_REACTIVATED = "ORGANIZATION_REACTIVATED"
        ORGANIZER_CREATED = "ORGANIZER_CREATED"
        ORGANIZER_UPDATED = "ORGANIZER_UPDATED"
        ORGANIZER_DEACTIVATED = "ORGANIZER_DEACTIVATED"
        ORGANIZER_REACTIVATED = "ORGANIZER_REACTIVATED"
        ORGANIZER_PASSWORD_RESET = "ORGANIZER_PASSWORD_RESET"
        SESSIONS_REVOKED = "SESSIONS_REVOKED"

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    # Vacía en las acciones de plataforma (pagos, sitio web): no pertenecen a
    # ninguna organización y no deben aparecer en la bitácora de ninguna.
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.CASCADE, null=True, blank=True, related_name="audit_logs"
    )
    actor = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs"
    )
    actor_email = models.CharField(max_length=150)  # fotografía: sobrevive al borrado
    action = models.CharField(max_length=32, choices=Action.choices)
    target_type = models.CharField(max_length=16, blank=True)  # "event" | "order" | "guestcode" | ...
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


def site_logo_upload_path(instance, filename) -> str:
    return f"site/logo-{uuid4().hex}.webp"


class SiteSettings(models.Model):
    """Configuración del sitio público (tienda): logo, contacto y redes.

    Una sola fila para toda la plataforma — la tienda es una marca, no una
    por organización. Se lee con `SiteSettings.load()`, que la crea vacía la
    primera vez; los campos en blanco simplemente no se muestran.
    """

    SINGLETON_ID = 1

    id = models.PositiveSmallIntegerField(primary_key=True, default=SINGLETON_ID, editable=False)
    logo = models.ImageField(upload_to=site_logo_upload_path, blank=True, null=True)
    tagline = models.CharField(max_length=160, blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    whatsapp = models.CharField(max_length=30, blank=True)
    contact_email = models.EmailField(blank=True)
    address = models.CharField(max_length=200, blank=True)
    instagram_url = models.URLField(blank=True)
    tiktok_url = models.URLField(blank=True)
    facebook_url = models.URLField(blank=True)
    youtube_url = models.URLField(blank=True)
    complaints_book_url = models.URLField(blank=True)  # Libro de Reclamaciones (Indecopi)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "configuración del sitio"
        verbose_name_plural = "configuración del sitio"

    def __str__(self):
        return "Configuración del sitio"

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_ID
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "SiteSettings":
        obj, _ = cls.objects.get_or_create(pk=cls.SINGLETON_ID)
        return obj
