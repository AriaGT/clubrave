from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403

DEBUG = False

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Ya son el valor por defecto de SecurityMiddleware desde Django 3.0/3.1;
# se dejan explícitos aquí para que el checklist de §13.1 sea auditable sin
# tener que confiar en que el default de Django no cambie.
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"

# La API navegable de DRF (HTML con estilos/scripts en línea) es para
# desarrollo: en producción solo se sirve JSON, lo que además simplifica
# la política de Content-Security-Policy (apps/common/middleware.py).
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = ("rest_framework.renderers.JSONRenderer",)  # noqa: F405

if not env.list("ALLOWED_HOSTS", default=[]):  # noqa: F405
    raise ImproperlyConfigured("ALLOWED_HOSTS debe declararse explícitamente en producción.")

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="")  # noqa: F405
EMAIL_PORT = env.int("EMAIL_PORT", default=587)  # noqa: F405
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")  # noqa: F405
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")  # noqa: F405
EMAIL_USE_TLS = True
# Solo aplica si RESEND_API_KEY no está configurada (ver apps/common/mailer.py):
# sin esto, un egress SMTP bloqueado cuelga el worker varios minutos por intento
# en vez de fallar rápido y dejar que el reintento de resend_pending_ticket_emails
# lo recoja.
EMAIL_TIMEOUT = 10

STORAGES["default"] = {"BACKEND": "storages.backends.s3.S3Storage"}  # noqa: F405

SENTRY_DSN = env("SENTRY_DSN", default="")  # noqa: F405
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(dsn=SENTRY_DSN, integrations=[DjangoIntegration()], traces_sample_rate=0.1)
