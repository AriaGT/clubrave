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
