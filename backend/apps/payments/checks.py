"""Validación de coherencia del modo de la pasarela (§8.6 del plan): una
etiqueta operativa por sí sola no evita nada, pero avisar cuando no coincide
con lo esperado sí evita el incidente clásico de cobrar en producción con
llaves de prueba, o viceversa."""

from django.conf import settings
from django.core.checks import Error, Warning, register


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


@register()
def check_mercadopago_configuration(app_configs, **kwargs):
    errors = []

    if settings.PAYMENT_GATEWAY != "mercadopago":
        return errors

    if not settings.MERCADOPAGO_ACCESS_TOKEN:
        errors.append(
            Error(
                "PAYMENT_GATEWAY=mercadopago pero MERCADOPAGO_ACCESS_TOKEN está vacío.",
                hint="Copia el access token de Tus integraciones › Credenciales al entorno.",
                id="payments.E001",
            )
        )

    if not settings.MERCADOPAGO_WEBHOOK_SECRET:
        # Sin la clave secreta ninguna notificación pasa la validación de
        # firma, así que la orden nunca se cerraría por el camino autoritativo.
        errors.append(
            Error(
                "PAYMENT_GATEWAY=mercadopago pero MERCADOPAGO_WEBHOOK_SECRET está vacío: "
                "todas las notificaciones se rechazarían por firma inválida.",
                hint="Configura Webhooks en Tus integraciones y copia la clave secreta generada.",
                id="payments.E002",
            )
        )

    if settings.MERCADOPAGO_MODE not in ("test", "production"):
        errors.append(
            Warning(
                f"MERCADOPAGO_MODE={settings.MERCADOPAGO_MODE!r} no es 'test' ni 'production'.",
                hint="Corrige MERCADOPAGO_MODE para que la conciliación sepa en qué entorno está.",
                id="payments.W003",
            )
        )

    if settings.MERCADOPAGO_MODE == "production" and settings.DEBUG:
        errors.append(
            Warning(
                "MERCADOPAGO_MODE=production pero DEBUG=True: probablemente credenciales de "
                "producción corriendo en un servidor de desarrollo.",
                hint="Usa config.settings.prod (DEBUG=False) para procesar cobros reales.",
                id="payments.W004",
            )
        )

    if not settings.FRONTEND_STORE_URL.startswith("https://") and settings.MERCADOPAGO_MODE == "production":
        # Mercado Pago rechaza dominios locales y exige HTTPS en las URLs de
        # retorno; con http:// el comprador ve "Algo ha salido mal" al volver.
        errors.append(
            Error(
                f"FRONTEND_STORE_URL={settings.FRONTEND_STORE_URL!r} no es HTTPS: las URLs de "
                "retorno de Checkout Pro no funcionarán.",
                hint="Declara FRONTEND_STORE_URL con el dominio público https:// de la tienda.",
                id="payments.E003",
            )
        )

    return errors
