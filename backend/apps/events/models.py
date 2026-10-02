from datetime import timedelta

from django.db import models
from django.db.models import F, Q
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import Organization
from apps.common.models import TimeStampedModel

from .image_processing import event_image_upload_path


class Event(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Borrador"
        PUBLISHED = "PUBLISHED", "Publicado"
        CANCELLED = "CANCELLED", "Cancelado"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)

    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)

    venue_name = models.CharField(max_length=150, blank=True)
    address = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    maps_url = models.URLField(blank=True)

    min_age = models.PositiveSmallIntegerField(default=18)
    currency = models.CharField(max_length=3, default="PEN")

    published_at = models.DateTimeField(null=True, blank=True)

    # Controles del evento en vivo (Épica A del plan de controles).
    sales_paused_at = models.DateTimeField(null=True, blank=True)  # H04: None = venta abierta
    cancelled_at = models.DateTimeField(null=True, blank=True)  # H06
    cancellation_reason_code = models.CharField(max_length=32, blank=True)  # H06
    cancellation_reason = models.CharField(max_length=200, blank=True)  # H06, va al email

    class Meta:
        ordering = ["starts_at"]
        indexes = [
            models.Index(fields=["status", "starts_at"]),
            models.Index(fields=["organization", "-starts_at"]),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.title)[:120] or "evento"
            slug = base_slug
            counter = 2
            while Event.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def sales_paused(self) -> bool:
        return self.sales_paused_at is not None

    # Duración que se asume cuando el organizador no puso hora de fin.
    DEFAULT_DURATION = timedelta(hours=8)

    @property
    def effective_ends_at(self):
        return self.ends_at or (self.starts_at + self.DEFAULT_DURATION)

    @property
    def is_finished(self) -> bool:
        """`FINISHED` se deriva de la fecha; no se persiste (ver §4.2)."""
        return timezone.now() > self.effective_ends_at

    def publish_requirements_errors(self) -> list[str]:
        errors = []
        if not self.title:
            errors.append("Falta el título.")
        if self.starts_at <= timezone.now():
            errors.append("La fecha de inicio debe ser futura.")
        if not self.venue_name:
            errors.append("Falta el lugar del evento.")
        if not self.images.filter(kind=EventImage.Kind.FLYER).exists():
            errors.append("Debes subir al menos un flyer.")
        if not self.ticket_types.filter(is_active=True, quantity_total__gt=0).exists():
            errors.append("Debes crear al menos un tipo de entrada activo con aforo.")
        return errors


class EventImage(TimeStampedModel):
    class Kind(models.TextChoices):
        FLYER = "FLYER", "Flyer"
        ZONES = "ZONES", "Zonas"
        MAP = "MAP", "Mapa de ubicación"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="images")
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.FLYER)
    image = models.ImageField(upload_to=event_image_upload_path)
    alt = models.CharField(max_length=200, blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    # La imagen elegida dentro de su tipo: en FLYER es la portada del evento.
    is_cover = models.BooleanField(default=False)

    class Meta:
        ordering = ["position", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["event", "kind"],
                condition=Q(is_cover=True),
                name="one_cover_image_per_event_kind",
            ),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} de {self.event.title} (#{self.position})"


class TicketType(TimeStampedModel):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="ticket_types")
    name = models.CharField(max_length=60)
    description = models.CharField(max_length=280, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity_total = models.PositiveIntegerField()
    quantity_sold = models.PositiveIntegerField(default=0)
    quantity_reserved = models.PositiveIntegerField(default=0)
    max_per_order = models.PositiveSmallIntegerField(default=10)
    sales_start_at = models.DateTimeField(null=True, blank=True)
    sales_end_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity_sold__gte=0) & Q(quantity_reserved__gte=0),
                name="ticket_type_non_negative_counters",
            ),
            models.CheckConstraint(
                condition=Q(quantity_sold__lte=F("quantity_total")),
                name="ticket_type_sold_within_total",
            ),
            models.CheckConstraint(
                condition=Q(quantity_total__gte=F("quantity_sold") + F("quantity_reserved")),
                name="ticket_type_capacity_not_exceeded",
            ),
        ]

    def __str__(self):
        return f"{self.name} — {self.event.title}"

    @property
    def available(self) -> int:
        return self.quantity_total - self.quantity_sold - self.quantity_reserved

    def sales_open_now(self) -> bool:
        now = timezone.now()
        if self.sales_start_at and now < self.sales_start_at:
            return False
        if self.sales_end_at and now > self.sales_end_at:
            return False
        return self.is_active
