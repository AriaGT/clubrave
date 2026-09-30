import io
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Membership, User
from apps.common.models import AuditLog, SiteSettings
from apps.events.models import TicketType


def _client_for(user, organization) -> APIClient:
    access = RefreshToken.for_user(user).access_token
    access["scope"] = "org"
    access["organization_id"] = str(organization.id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@pytest.fixture
def owner_client(organizer_user, organization):
    return _client_for(organizer_user, organization)


@pytest.fixture
def staff_client(db, organization):
    user = User.objects.create_user(email="puerta@test.pe", password="clave12345", role=User.Role.STAFF)
    Membership.objects.create(user=user, organization=organization, role=Membership.Role.STAFF)
    return _client_for(user, organization)


def _png(size=(200, 80), mode="RGBA") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new(mode, size, (124, 58, 237, 0) if mode == "RGBA" else (1, 2, 3)).save(buffer, format="PNG")
    return SimpleUploadedFile("logo.png", buffer.getvalue(), content_type="image/png")


def test_public_endpoint_returns_blank_settings_on_first_read(db):
    response = APIClient().get("/api/site/")
    assert response.status_code == 200
    assert response.json()["logo"] is None
    assert response.json()["instagram_url"] == ""


def test_owner_updates_contact_and_socials_and_it_is_audited(owner_client, organization):
    response = owner_client.patch(
        "/api/org/site/",
        {
            "contact_phone": "+51 987 654 321",
            "whatsapp": "+51 987 654 321",
            "instagram_url": "https://instagram.com/clubrave",
            "tiktok_url": "https://www.tiktok.com/@clubrave",
        },
        format="json",
    )
    assert response.status_code == 200
    public = APIClient().get("/api/site/").json()
    assert public["tiktok_url"] == "https://www.tiktok.com/@clubrave"

    entry = AuditLog.objects.get(action=AuditLog.Action.SITE_SETTINGS_UPDATED)
    assert entry.organization == organization
    assert "instagram_url" in entry.metadata["fields"]


def test_logo_upload_keeps_transparency_and_can_be_removed(owner_client):
    response = owner_client.patch("/api/org/site/", {"logo": _png()}, format="multipart")
    assert response.status_code == 200
    settings_obj = SiteSettings.load()
    assert settings_obj.logo.name.endswith(".webp")
    with settings_obj.logo.open() as f:
        assert Image.open(f).mode == "RGBA"

    response = owner_client.patch("/api/org/site/", {"logo": None}, format="json")
    assert response.status_code == 200
    assert response.json()["logo"] is None


def test_tiny_logo_is_rejected(owner_client):
    response = owner_client.patch("/api/org/site/", {"logo": _png(size=(40, 40))}, format="multipart")
    assert response.status_code == 400


def test_invalid_whatsapp_is_rejected(owner_client):
    response = owner_client.patch("/api/org/site/", {"whatsapp": "123"}, format="json")
    assert response.status_code == 400


def test_staff_member_cannot_edit_site_settings(staff_client):
    response = staff_client.patch("/api/org/site/", {"tagline": "Hackeado"}, format="json")
    assert response.status_code == 403
    assert SiteSettings.load().tagline == ""


def test_anonymous_cannot_edit_site_settings(db):
    response = APIClient().patch("/api/org/site/", {"tagline": "X"}, format="json")
    assert response.status_code in (401, 403)


def test_public_list_includes_lowest_active_price(published_event):
    TicketType.objects.create(event=published_event, name="VIP", price=Decimal("90.00"), quantity_total=10)
    TicketType.objects.create(
        event=published_event, name="Preventa", price=Decimal("30.00"), quantity_total=10
    )
    TicketType.objects.create(
        event=published_event, name="Cerrada", price=Decimal("10.00"), quantity_total=10, is_active=False
    )
    [event] = APIClient().get("/api/events/").json()["results"]
    assert event["price_from"] == "30.00"


def test_public_list_price_from_is_null_without_ticket_types(published_event):
    published_event.starts_at += timedelta(days=1)
    published_event.save(update_fields=["starts_at"])
    [event] = APIClient().get("/api/events/").json()["results"]
    assert event["price_from"] is None
