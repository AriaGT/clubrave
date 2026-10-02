"""Chequeos de arranque de pagos.

La configuración de cada pasarela vive en la base (panel › Medios de pago) y
se valida contra el proveedor al guardarla, así que aquí solo queda lo que
depende del entorno del servidor: la clave con la que se cifran las
credenciales. Sin ella, en producción no se podría leer ninguna.
"""

from django.conf import settings
from django.core.checks import Error, register


@register()
def check_payment_credentials_key(app_configs, **kwargs):
    if settings.DEBUG or settings.PAYMENT_CREDENTIALS_KEY:
        return []
    return [
        Error(
            "Falta PAYMENT_CREDENTIALS_KEY: las credenciales de las pasarelas se guardan "
            "cifradas con ella y sin la clave no se pueden leer ni guardar.",
            hint='Genera una con python -c "import secrets; print(secrets.token_urlsafe(48))" '
            "y declárala en el entorno del servidor. No la cambies después.",
            id="payments.E010",
        )
    ]
