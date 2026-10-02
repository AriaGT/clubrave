from django.db import IntegrityError, models, transaction

from apps.common.models import TimeStampedModel


class PaymentSettings(models.Model):
    """Configuración del checkout, editable desde el panel. Registro único.

    `mode` decide qué cobra la tienda:
    - `disabled`: no se crean órdenes (la tienda avisa de un problema técnico);
    - `fake`: simulador de desarrollo, aprueba sin cobrar. Excluye a los reales;
    - `live`: pasarelas reales; puede haber varias activas a la vez y el
      comprador elige con cuál pagar.
    """

    SINGLETON_ID = 1

    class Mode(models.TextChoices):
        DISABLED = "disabled", "Deshabilitado"
        FAKE = "fake", "Simulador"
        LIVE = "live", "Pasarelas reales"

    id = models.PositiveSmallIntegerField(primary_key=True, default=SINGLETON_ID, editable=False)
    mode = models.CharField(max_length=16, choices=Mode.choices, default=Mode.DISABLED)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuración de pagos"
        verbose_name_plural = "Configuración de pagos"

    def __str__(self):
        return f"Pagos: {self.get_mode_display()}"

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_ID
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "PaymentSettings":
        obj = cls.objects.filter(pk=cls.SINGLETON_ID).first()
        if obj is not None:
            return obj
        # Primera vez: se importa lo que hubiera en las variables de entorno
        # heredadas, para que un despliegue que ya cobraba siga cobrando.
        from .providers import import_from_environment

        try:
            with transaction.atomic():
                obj = cls.objects.create(pk=cls.SINGLETON_ID)
                import_from_environment(obj)
        except IntegrityError:
            # Otra petición la creó a la vez: se usa la suya.
            obj = cls.objects.get(pk=cls.SINGLETON_ID)
        return obj


class PaymentProvider(models.Model):
    """Una pasarela real y sus credenciales, cifradas (ver `crypto.py`).

    Las credenciales nunca salen por la API: el panel solo ve `hints`
    (valores públicos completos y secretos enmascarados)."""

    class Environment(models.TextChoices):
        TEST = "test", "Pruebas"
        PRODUCTION = "production", "Producción"

    provider = models.CharField(max_length=32, unique=True)  # id del registro en providers.py
    enabled = models.BooleanField(default=False)
    environment = models.CharField(max_length=16, choices=Environment.choices, default=Environment.TEST)
    credentials = models.TextField(blank=True)  # JSON cifrado con Fernet
    hints = models.JSONField(default=dict, blank=True)
    # Última vez que el proveedor aceptó estas credenciales. Vacío si se
    # importaron del entorno y nadie las validó todavía desde el panel.
    verified_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Pasarela de pago"
        verbose_name_plural = "Pasarelas de pago"

    def __str__(self):
        return f"{self.provider} ({'activa' if self.enabled else 'inactiva'})"

    @property
    def configured(self) -> bool:
        return bool(self.credentials)


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
