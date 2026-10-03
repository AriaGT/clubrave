from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import Membership, Organization, User
from apps.events.models import Event, EventImage, TicketType


@pytest.fixture
def organization(db):
    return Organization.objects.create(
        name="Promotora Test", slug="promotora-test", contact_email="org@test.pe"
    )


@pytest.fixture
def organizer_user(db, organization):
    user = User.objects.create_user(
        email="organizador@test.pe", password="clave12345", role=User.Role.ORGANIZER
    )
    Membership.objects.create(user=user, organization=organization, role=Membership.Role.OWNER)
    return user


ADMIN_PASSWORD = "Admin-Segura-2026"


@pytest.fixture
def admin_user(db):
    """Administrador del sistema: superusuario de Django."""
    return User.objects.create_superuser(email="admin@test.pe", password=ADMIN_PASSWORD)


@pytest.fixture
def admin_tokens(admin_user):
    from apps.accounts import services

    return services.admin_tokens_for_user(admin_user)


@pytest.fixture
def admin_client(admin_tokens):
    from rest_framework.test import APIClient

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {admin_tokens['access']}")
    return client


@pytest.fixture
def customer_user(db):
    return User.objects.create_user(email="comprador@test.pe", role=User.Role.CUSTOMER)


@pytest.fixture
def published_event(db, organization):
    event = Event.objects.create(
        organization=organization,
        title="Evento de prueba",
        starts_at=timezone.now() + timedelta(days=10),
        venue_name="Local de prueba",
        city="Lima",
        status=Event.Status.PUBLISHED,
        published_at=timezone.now(),
    )
    EventImage.objects.create(event=event, image="events/test.jpg", is_cover=True)
    return event


@pytest.fixture
def ticket_type(db, published_event):
    return TicketType.objects.create(
        event=published_event, name="General", price=Decimal("50.00"), quantity_total=100
    )


@pytest.fixture
def scarce_ticket_type(db, published_event):
    """Un solo cupo disponible: para probar concurrencia."""
    return TicketType.objects.create(
        event=published_event, name="Última entrada", price=Decimal("50.00"), quantity_total=1
    )


# ── Configuración de pagos ───────────────────────────────────────────────────
# Vive en la base (panel › Medios de pago). Los tests arrancan siempre en modo
# simulador para no depender de lo que haya en el .env local: sin esto, la
# primera carga importaría la pasarela del entorno de quien corre los tests.


@pytest.fixture(autouse=True)
def _payments_default_to_fake(request):
    if "db" not in request.fixturenames and not request.node.get_closest_marker("django_db"):
        return
    request.getfixturevalue("db")
    from apps.payments.models import PaymentSettings

    PaymentSettings.objects.update_or_create(pk=PaymentSettings.SINGLETON_ID, defaults={"mode": "fake"})


@pytest.fixture
def set_payment_mode(db):
    from apps.payments.models import PaymentSettings

    def _set(mode: str):
        PaymentSettings.objects.update_or_create(pk=PaymentSettings.SINGLETON_ID, defaults={"mode": mode})

    return _set


@pytest.fixture
def configure_provider(db, set_payment_mode):
    """Guarda una pasarela con sus credenciales (cifradas, como el panel) y
    deja la tienda en modo real."""
    from apps.payments.models import PaymentProvider
    from apps.payments.providers import store_credentials

    def _configure(provider: str, credentials: dict, *, enabled=True, environment="test", mode="live"):
        row, _ = PaymentProvider.objects.get_or_create(provider=provider)
        row.enabled = enabled
        row.environment = environment
        store_credentials(row, credentials)
        row.save()
        set_payment_mode(mode)
        return row

    return _configure


@pytest.fixture(autouse=True)
def _never_send_real_email(settings):
    """Con RESEND_API_KEY en el .env local, los tests mandarían correos de
    verdad por la API de Resend. Siempre al backend de memoria de Django."""
    settings.RESEND_API_KEY = ""
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
