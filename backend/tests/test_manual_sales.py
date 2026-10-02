"""Documento obligatorio en toda venta y ventas manuales del organizador."""

from decimal import Decimal

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Membership, Organization, User
from apps.common.models import AuditLog
from apps.events.models import TicketType
from apps.orders.models import Order, Ticket


def _client_for(user, organization) -> APIClient:
    access = RefreshToken.for_user(user).access_token
    access["scope"] = "org"
    access["organization_id"] = str(organization.id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@pytest.fixture
def org_client(organizer_user, organization):
    return _client_for(organizer_user, organization)


@pytest.fixture
def other_org_client(db):
    org = Organization.objects.create(name="Otra", slug="otra", contact_email="otra@test.pe")
    user = User.objects.create_user(email="otro@test.pe", password="clave12345", role=User.Role.ORGANIZER)
    Membership.objects.create(user=user, organization=org, role=Membership.Role.OWNER)
    return _client_for(user, org)


def _checkout(buyer, event, ticket_type):
    return APIClient().post(
        "/api/checkout/orders/",
        data={
            "event_id": str(event.id),
            "items": [{"ticket_type_id": str(ticket_type.id), "quantity": 1}],
            "buyer": buyer,
            "terms_accepted": True,
        },
        format="json",
    )


# ── Documento obligatorio ────────────────────────────────────────────────────


def test_checkout_requires_a_document(published_event, ticket_type):
    response = _checkout({"email": "a@test.pe", "full_name": "Ana"}, published_event, ticket_type)
    assert response.status_code == 400
    assert not Order.objects.exists()


@pytest.mark.parametrize("number", ["1234567", "123456789", "ABCDEFGH"])
def test_checkout_rejects_an_invalid_dni(published_event, ticket_type, number):
    buyer = {"email": "a@test.pe", "full_name": "Ana", "document_id": number}
    assert _checkout(buyer, published_event, ticket_type).status_code == 400


def test_checkout_normalizes_and_stores_the_document(published_event, ticket_type):
    buyer = {"email": "a@test.pe", "full_name": "Ana", "document_id": " 12.345-678 "}
    response = _checkout(buyer, published_event, ticket_type)
    assert response.status_code == 201
    order = Order.objects.get()
    assert (order.buyer_document_type, order.buyer_document) == ("DNI", "12345678")


def test_foreigners_can_buy_with_ce_or_passport(published_event, ticket_type):
    buyer = {
        "email": "a@test.pe", "full_name": "John", "document_type": "PASSPORT", "document_id": "ab123456"
    }
    assert _checkout(buyer, published_event, ticket_type).status_code == 201
    assert Order.objects.get().buyer_document == "AB123456"


def test_organizer_can_search_sales_by_document(org_client, published_event, ticket_type):
    buyer = {"email": "a@test.pe", "full_name": "Ana", "document_id": "44556677"}
    _checkout(buyer, published_event, ticket_type)
    response = org_client.get(f"/api/org/events/{published_event.id}/orders/", {"q": "44556677"})
    assert [o["buyer_document"] for o in response.json()["results"]] == ["44556677"]


# ── Venta manual ─────────────────────────────────────────────────────────────


def _manual_sale(client, event, ticket_type, **overrides):
    body = {
        "items": [{"ticket_type_id": str(ticket_type.id), "quantity": 2}],
        "buyer": {"full_name": "Carla Ruiz", "document_id": "70112233", "phone": "987654321"},
        "payment_method": "YAPE_PLIN",
        "payment_reference": "op 123",
        "send_email": False,
    }
    body.update(overrides)
    return client.post(f"/api/org/events/{event.id}/manual-sales/", body, format="json")


def test_manual_sale_issues_tickets_without_email(org_client, organizer_user, published_event, ticket_type):
    mail.outbox = []
    response = _manual_sale(org_client, published_event, ticket_type)
    assert response.status_code == 201, response.json()

    body = response.json()
    assert body["status"] == "PAID" and body["is_manual"]
    assert body["manual_payment_method"] == "YAPE_PLIN"
    assert body["buyer_email"] == ""
    assert body["sold_by_email"] == organizer_user.email
    assert len(body["tickets"]) == 2
    assert body["total"] == "100.00"  # 2 × 50.00, precio publicado

    ticket_type.refresh_from_db()
    assert ticket_type.quantity_sold == 2 and ticket_type.quantity_reserved == 0
    assert mail.outbox == []
    log = AuditLog.objects.get(action=AuditLog.Action.ORDER_MANUAL_SALE)
    assert log.metadata["payment_method"] == "YAPE_PLIN" and log.metadata["tickets"] == 2


def test_manual_sale_records_the_amount_actually_charged(org_client, published_event, ticket_type):
    response = _manual_sale(org_client, published_event, ticket_type, total="80.00")
    order = Order.objects.get(code=response.json()["code"])
    assert order.total == Decimal("80.00")
    assert order.subtotal == Decimal("100.00")  # el precio de lista queda como referencia

    stats = org_client.get(f"/api/org/events/{published_event.id}/stats/")
    if stats.status_code == 200:
        assert stats.json()["revenue"]["gross"] == "80.00"


def test_manual_sale_can_email_the_tickets(
    org_client, published_event, ticket_type, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        response = _manual_sale(
            org_client,
            published_event,
            ticket_type,
            buyer={"full_name": "Carla", "document_id": "70112233", "email": "carla@test.pe"},
            send_email=True,
        )
    assert response.status_code == 201
    assert Order.objects.get().tickets_email_sent_at is not None


def test_manual_sale_cannot_email_without_an_address(org_client, published_event, ticket_type):
    assert _manual_sale(org_client, published_event, ticket_type, send_email=True).status_code == 400
    assert not Order.objects.exists()


def test_manual_sale_works_with_web_sales_paused_and_hidden_types(org_client, published_event, ticket_type):
    published_event.sales_paused_at = timezone.now()
    published_event.save(update_fields=["sales_paused_at"])
    hidden = TicketType.objects.create(
        event=published_event, name="VIP mesa", price=Decimal("300.00"), quantity_total=5, is_active=False
    )
    assert _manual_sale(org_client, published_event, hidden).status_code == 201


def test_manual_sale_respects_capacity(org_client, published_event, scarce_ticket_type):
    assert _manual_sale(org_client, published_event, scarce_ticket_type).status_code == 409


def test_manual_sale_requires_the_document(org_client, published_event, ticket_type):
    response = _manual_sale(org_client, published_event, ticket_type, buyer={"full_name": "Sin DNI"})
    assert response.status_code == 400


def test_manual_sale_is_scoped_to_the_organization(other_org_client, published_event, ticket_type):
    assert _manual_sale(other_org_client, published_event, ticket_type).status_code == 404


# ── Compartir las entradas ───────────────────────────────────────────────────


def test_organizer_downloads_the_tickets_as_pdf_and_image(org_client, published_event, ticket_type):
    code = _manual_sale(org_client, published_event, ticket_type).json()["code"]

    pdf = org_client.get(f"/api/org/orders/{code}/tickets.pdf")
    assert pdf.status_code == 200 and pdf["Content-Type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")

    ticket = Ticket.objects.filter(order__code=code).first()
    image = org_client.get(f"/api/org/tickets/{ticket.code}/image.png")
    assert image.status_code == 200 and image["Content-Type"] == "image/png"
    assert image.content.startswith(b"\x89PNG")


def test_other_organizations_cannot_download_tickets(
    org_client, other_org_client, published_event, ticket_type
):
    code = _manual_sale(org_client, published_event, ticket_type).json()["code"]
    ticket = Ticket.objects.filter(order__code=code).first()
    assert other_org_client.get(f"/api/org/orders/{code}/tickets.pdf").status_code == 404
    assert other_org_client.get(f"/api/org/tickets/{ticket.code}/image.png").status_code == 404


def test_an_email_can_be_added_once_to_a_sale_without_one(org_client, published_event, ticket_type):
    code = _manual_sale(org_client, published_event, ticket_type).json()["code"]

    missing = org_client.post(f"/api/org/orders/{code}/resend-tickets/", {}, format="json")
    assert missing.status_code == 400

    url = f"/api/org/orders/{code}/resend-tickets/"
    sent = org_client.post(url, {"email": "Carla@Test.pe"}, format="json")
    assert sent.status_code == 200
    assert Order.objects.get(code=code).buyer_email == "carla@test.pe"

    # Con correo ya registrado no se puede redirigir a otro.
    org_client.post(f"/api/org/orders/{code}/resend-tickets/", {"email": "otro@test.pe"}, format="json")
    assert Order.objects.get(code=code).buyer_email == "carla@test.pe"
