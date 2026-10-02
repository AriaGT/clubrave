from .base import *  # noqa: F403

DEBUG = True

# En desarrollo basta una clave derivada de SECRET_KEY para no tener que
# configurar nada; en producción PAYMENT_CREDENTIALS_KEY es obligatoria
# (system check payments.E010).
PAYMENT_CREDENTIALS_KEY = PAYMENT_CREDENTIALS_KEY or f"dev-only::{SECRET_KEY}"  # noqa: F405

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

CORS_ALLOW_ALL_ORIGINS = True

INSTALLED_APPS += ["django_extensions"] if env.bool("USE_DJANGO_EXTENSIONS", default=False) else []  # noqa: F405
