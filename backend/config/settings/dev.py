from .base import *  # noqa: F403

DEBUG = True

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

CORS_ALLOW_ALL_ORIGINS = True

INSTALLED_APPS += ["django_extensions"] if env.bool("USE_DJANGO_EXTENSIONS", default=False) else []  # noqa: F405
