"""Validación de coherencia de `IZIPAY_MODE` (§8.6 del plan): una etiqueta
operativa por sí sola no evita nada, pero avisar cuando no coincide con lo
esperado sí evita el incidente clásico de cobrar en producción con llaves
de prueba, o viceversa."""

from django.conf import settings
from django.core.checks import Warning, register


@register()
def check_izipay_mode_coherence(app_configs, **kwargs):
    errors = []

    if settings.PAYMENT_GATEWAY != "izipay":
        return errors

    if settings.IZIPAY_MODE not in ("test", "production"):
        errors.append(
            Warning(
                f"IZIPAY_MODE={settings.IZIPAY_MODE!r} no es 'test' ni 'production'.",
                hint="Corrige IZIPAY_MODE para que la conciliación y las alertas sepan en qué entorno están.",
                id="payments.W001",
            )
        )

    if settings.IZIPAY_MODE == "production" and settings.DEBUG:
        errors.append(
            Warning(
                "IZIPAY_MODE=production pero DEBUG=True: probablemente credenciales de "
                "producción corriendo en un servidor de desarrollo.",
                hint="Usa config.settings.prod (DEBUG=False) para procesar cobros reales.",
                id="payments.W002",
            )
        )

    return errors
