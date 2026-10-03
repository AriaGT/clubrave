"""§13.1 — Autorización: "la organización A no ve ni toca nada de B."
Cubre los endpoints de organizador uno por uno, no solo check-in (que ya
tiene su propia prueba en test_checkin.py)."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Membership, Organization, User
from apps.events.models import Event, EventImage, TicketType
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.fulfillment import mark_paid


def _org_token(user: User, organization_id) -> str:
    refresh = RefreshToken.for_user(user)
    refresh["scope"] = "org"
    refresh["organization_id"] = str(organization_id)
    access = refresh.access_token
    access["scope"] = "org"
    access["organization_id"] = str(organization_id)
    return str(access)


@pytest.fixture
def org_b(db):
    return Organization.objects.create(name="Promotora B", slug="promotora-b", contact_email="b@test.pe")


@pytest.fixture
def org_b_user(db, org_b):
    user = User.objects.create_user(email="organizadorb@test.pe", password="x", role=User.Role.ORGANIZER)
    Membership.objects.create(user=user, organization=org_b, role=Membership.Role.OWNER)
    return user


@pytest.fixture
def client_b(org_b_user, org_b):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_org_token(org_b_user, org_b.id)}")
    return client


@pytest.fixture
def client_a(organizer_user, organization):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_org_token(organizer_user, organization.id)}")
    return client


def test_org_b_cannot_retrieve_org_a_event(client_b, published_event):
    response = client_b.get(f"/api/org/events/{published_event.id}/")
    assert response.status_code == 404


def test_org_b_event_list_never_includes_org_a_events(client_b, published_event):
    response = client_b.get("/api/org/events/")
    ids = [e["id"] for e in response.json()["results"]]
    assert str(published_event.id) not in ids


def test_org_b_cannot_update_org_a_event(client_b, published_event):
    response = client_b.patch(f"/api/org/events/{published_event.id}/", {"title": "Hackeado"}, format="json")
    assert response.status_code == 404
    published_event.refresh_from_db()
    assert published_event.title != "Hackeado"


def test_org_b_cannot_delete_org_a_event(client_b, published_event):
    response = client_b.delete(f"/api/org/events/{published_event.id}/")
    assert response.status_code == 404
    assert Event.objects.filter(id=published_event.id).exists()


def test_org_b_cannot_publish_org_a_event(client_b, published_event):
    response = client_b.post(f"/api/org/events/{published_event.id}/publish/")
    assert response.status_code == 404


def test_org_b_cannot_see_org_a_event_stats(client_b, published_event):
    response = client_b.get(f"/api/org/events/{published_event.id}/stats/")
    assert response.status_code == 404


def test_org_b_cannot_list_org_a_ticket_types(client_b, published_event, ticket_type):
    response = client_b.get(f"/api/org/events/{published_event.id}/ticket-types/")
    # El evento de A no es visible desde B: se comporta igual que si no
    # tuviera tipos de entrada, nunca filtra los de A.
    body = response.json()
    results = body.get("results", []) if isinstance(body, dict) else []
    ids = [t["id"] for t in results]
    assert str(ticket_type.id) not in ids


def test_org_b_cannot_update_org_a_ticket_type(client_b, ticket_type):
    response = client_b.patch(f"/api/org/ticket-types/{ticket_type.id}/", {"price": "0.01"}, format="json")
    assert response.status_code == 404
    ticket_type.refresh_from_db()
    assert str(ticket_type.price) != "0.01"


def test_org_b_cannot_delete_org_a_ticket_type(client_b, ticket_type):
    response = client_b.delete(f"/api/org/ticket-types/{ticket_type.id}/")
    assert response.status_code == 404
    assert TicketType.objects.filter(id=ticket_type.id).exists()


def _valid_image_upload() -> SimpleUploadedFile:
    image = Image.new("RGB", (1000, 800), (10, 20, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    buffer.seek(0)
    return SimpleUploadedFile("photo.jpg", buffer.read(), content_type="image/jpeg")


def test_org_b_cannot_upload_image_to_org_a_event(client_b, published_event):
    response = client_b.post(
        f"/api/org/events/{published_event.id}/images/",
        {"alt": "x", "image": _valid_image_upload()},
        format="multipart",
    )
    assert response.status_code == 404


def test_org_b_cannot_modify_org_a_event_image(client_b, published_event):
    image = EventImage.objects.get(event=published_event)
    response = client_b.patch(
        f"/api/org/events/{published_event.id}/images/{image.id}/", {"is_cover": False}, format="json"
    )
    assert response.status_code == 404


def test_org_b_cannot_see_org_a_orders(client_b, published_event, ticket_type):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BuyerData(email="comprador@test.pe", full_name="Comprador"),
        terms_accepted=True,
    )
    mark_paid(order_id=order.id)

    response = client_b.get(f"/api/org/events/{published_event.id}/orders/")
    assert response.status_code == 200
    codes = [o["code"] for o in response.json()["results"]]
    assert order.code not in codes


def test_org_b_cannot_export_org_a_orders_csv(client_b, published_event):
    response = client_b.get(f"/api/org/events/{published_event.id}/orders.csv")
    assert response.status_code == 200
    # Nunca ve las filas de A: el CSV para el evento de A, visto por B,
    # está vacío en vez de filtrar mal.
    rows = response.content.decode().strip().splitlines()
    assert len(rows) <= 1  # solo el encabezado, ninguna orden de A


def test_org_b_cannot_see_org_a_attendees(client_b, published_event, ticket_type):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BuyerData(email="comprador@test.pe", full_name="Comprador"),
        terms_accepted=True,
    )
    mark_paid(order_id=order.id)

    response = client_b.get(f"/api/org/events/{published_event.id}/attendees/")
    assert response.status_code == 200
    assert response.json()["results"] == []


# ── Sesión de organizador: se re-verifica en cada petición ───────────────────
# Antes `IsOrganizer` solo leía los claims del JWT: desactivar la organización
# o quitarle la membresía al organizador no surtía efecto hasta que vencía el
# access token (30 min).


def test_removing_the_membership_cuts_an_already_issued_token(client_a, organizer_user, organization):
    assert client_a.get("/api/org/events/").status_code == 200
    Membership.objects.filter(user=organizer_user, organization=organization).delete()
    assert client_a.get("/api/org/events/").status_code == 403


def test_deactivating_the_organization_cuts_an_already_issued_token(client_a, organization):
    assert client_a.get("/api/org/events/").status_code == 200
    Organization.objects.filter(pk=organization.pk).update(is_active=False)
    assert client_a.get("/api/org/events/").status_code == 403


def test_a_token_naming_an_organization_the_user_does_not_own_is_rejected(organizer_user, org_b):
    forged = APIClient()
    forged.credentials(HTTP_AUTHORIZATION=f"Bearer {_org_token(organizer_user, org_b.id)}")
    assert forged.get("/api/org/events/").status_code == 403


def test_organizer_login_is_refused_for_an_inactive_organization(client, organizer_user, organization):
    Organization.objects.filter(pk=organization.pk).update(is_active=False)
    res = client.post(
        "/api/auth/org/login/",
        {"email": organizer_user.email, "password": "clave12345"},
        content_type="application/json",
    )
    assert res.status_code in (400, 403)
