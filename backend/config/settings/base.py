"""Ajustes comunes a todos los entornos. Nada de secretos en el repositorio."""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="dev-insecure-secret-key-change-me")
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # terceros
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    # dominio
    "apps.common",
    "apps.accounts",
    "apps.events",
    "apps.orders",
    "apps.payments",
    "apps.checkin",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.common.middleware.SecurityHeadersMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
}
if "sqlite" in DATABASES["default"]["ENGINE"]:
    # Da tiempo a que `select_for_update()` espere el lock en vez de fallar
    # de inmediato: sqlite solo sirve para dev/tests locales (ver §14.1).
    DATABASES["default"]["OPTIONS"] = {"timeout": 20}

# Argon2 primero (§13.1): es el hasher recomendado por Django desde hace
# años; el resto queda para poder verificar (no crear) contraseñas de
# usuarios existentes con un hash anterior si el proyecto migrara de otro
# sistema.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "es-pe"
TIME_ZONE = "America/Lima"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── Dominio ────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.DefaultPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "apps.common.errors.api_exception_handler",
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "login_code": "5/hour",     # por email: código OTP del comprador
        "org_login": "30/hour",     # login del organizador (email + contraseña)
        "password_change": "10/hour",  # solicitar/confirmar cambio de contraseña
        "checkout": "20/hour",      # por IP
        "public": "120/min",        # catálogo
        "checkin": "600/hour",      # puerta: alto, pero acotado
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Ticketera API",
    "DESCRIPTION": "Plataforma de venta de entradas con QR — MVP",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])

# Código único de entrada + firma HMAC (ver apps/orders/services/codes.py)
TICKET_SIGNING_KEYS = dict(
    pair.split(":", 1) for pair in env.list("TICKET_SIGNING_KEYS", default=["k1:dev-insecure-signing-key"])
)
TICKET_SIGNING_KEY_ID = env("TICKET_SIGNING_KEY_ID", default="k1")

ORDER_HOLD_MINUTES = env.int("ORDER_HOLD_MINUTES", default=15)
TERMS_VERSION = env("TERMS_VERSION", default="2026-01")

# ── Archivos (S3 en prod; disco local en dev) ───────────────────────────────
AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="")
AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default="")
AWS_S3_CUSTOM_DOMAIN = env("AWS_S3_CUSTOM_DOMAIN", default="")
AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="")
AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="")
# Cloudflare R2 exige "auto"; un bucket S3 real ignora este valor si no aplica.
AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="auto")
# Sin esto, django-storages firma cada URL con parámetros que expiran a la
# hora (?X-Amz-...) — rompe portadas en emails viejos, OG cacheado, etc.
# AWS_S3_CUSTOM_DOMAIN ya sirve el bucket como público vía R2, no hace
# falta firmar.
AWS_QUERYSTRING_AUTH = False

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# ── Email ────────────────────────────────────────────────────────────────
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="entradas@ticketera.pe")
# Con esto configurado, apps/common/mailer.py usa la API HTTP de Resend en
# vez de SMTP (ver ese archivo para el motivo). Por default toma el mismo
# valor que EMAIL_HOST_PASSWORD: si ya usas Resend por SMTP, no hace falta
# declarar esta variable aparte — la API key es la misma.
RESEND_API_KEY = env("RESEND_API_KEY", default=env("EMAIL_HOST_PASSWORD", default=""))
FRONTEND_STORE_URL = env("FRONTEND_STORE_URL", default="http://localhost:3000")
FRONTEND_PANEL_URL = env("FRONTEND_PANEL_URL", default="http://localhost:3001")

# ── Pagos (nombres de variable tal cual §8.6 del plan) ─────────────────────
PAYMENT_GATEWAY = env("PAYMENT_GATEWAY", default="fake")
IZIPAY_SHOP_ID = env("IZIPAY_SHOP_ID", default="")
IZIPAY_REST_PASSWORD = env("IZIPAY_REST_PASSWORD", default="")
IZIPAY_HMAC_SHA256_KEY = env("IZIPAY_HMAC_SHA256_KEY", default="")
IZIPAY_PUBLIC_KEY = env("IZIPAY_PUBLIC_KEY", default="")
IZIPAY_REST_URL = env("IZIPAY_REST_URL", default="https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment")
IZIPAY_JS_URL = env(
    "IZIPAY_JS_URL",
    default="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js",
)
# Etiqueta operativa: valida que no se mezclen credenciales de prueba con un
# despliegue que se cree "production" (ver system check payments.W001).
IZIPAY_MODE = env("IZIPAY_MODE", default="test")
