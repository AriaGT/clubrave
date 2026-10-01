import json

import pytest
from rest_framework.test import APIClient

from apps.orders.models import Order, Ticket
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.payments.models import PaymentEvent

BUYER = BuyerData(email="comprador@test.pe", full_name="Comprador Test")


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def pending_order(published_event, ticket_type):
    return create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=2)],
        buyer=BUYER,
        terms_accepted=True,
    )


def _ipn(client, order, approved, amount_cents=None, currency="PEN"):
    body = {
        "order_code": order.code,
        "approved": approved,
        "amount_cents": amount_cents if amount_cents is not None else int(order.total * 100),
        "currency": currency,
        "reference": f"ref-{order.code}",
    }
    return client.post("/api/webhooks/izipay/", data=json.dumps(body), content_type="application/json")


def test_approved_ipn_marks_order_paid_and_issues_tickets(client, pending_order, ticket_type):
    response = _ipn(client, pending_order, approved=True)
    assert response.status_code == 200

    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PAID
    assert Ticket.objects.filter(order=pending_order).count() == 2

    ticket_type.refresh_from_db()
    assert ticket_type.quantity_sold == 2


def test_rejected_ipn_marks_order_failed_and_releases_inventory(client, pending_order, ticket_type):
    response = _ipn(client, pending_order, approved=False)
    assert response.status_code == 200

    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.FAILED
    assert Ticket.objects.filter(order=pending_order).count() == 0

    ticket_type.refresh_from_db()
    assert ticket_type.quantity_reserved == 0


def test_duplicate_ipn_does_not_duplicate_tickets(client, pending_order):
    _ipn(client, pending_order, approved=True)
    _ipn(client, pending_order, approved=True)

    assert Ticket.objects.filter(order=pending_order).count() == 2
    # Mismo `external_id` en ambos IPN: la segunda bitácora no se duplica,
    # que es justamente la defensa contra procesarlo dos veces (§4.2).
    assert PaymentEvent.objects.filter(order=pending_order, kind=PaymentEvent.Kind.IPN).count() == 1


def test_ipn_with_mismatched_amount_is_rejected(client, pending_order):
    response = _ipn(client, pending_order, approved=True, amount_cents=1)
    assert response.status_code == 400

    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PENDING  # la orden queda intacta


def test_ipn_for_unknown_order_is_rejected(client, published_event):
    body = {"order_code": "TK-NOEXISTE", "approved": True, "amount_cents": 100, "currency": "PEN"}
    response = client.post("/api/webhooks/izipay/", data=json.dumps(body), content_type="application/json")
    assert response.status_code == 400


def test_checkout_view_creates_pending_order_with_fake_gateway_session(client, published_event, ticket_type):
    response = client.post(
        "/api/checkout/orders/",
        data={
            "event_id": str(published_event.id),
            "items": [{"ticket_type_id": str(ticket_type.id), "quantity": 1}],
            "buyer": {"email": "a@test.pe", "full_name": "A"},
            "terms_accepted": True,
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["order"]["status"] == "PENDING"
    assert body["payment"]["gateway"] == "fake"


def test_public_order_status_never_exposes_tickets(client, pending_order):
    """`GET /checkout/orders/{code}/` es público y sin autenticación (§6.1):
    jamás debe devolver los QR de las entradas, aunque la orden ya esté
    pagada — el código de orden no es un secreto."""
    _ipn(client, pending_order, approved=True)
    response = client.get(f"/api/checkout/orders/{pending_order.code}/")
    assert response.status_code == 200
    body = response.json()
    assert "tickets" not in body
    assert "buyer_email" not in body
    assert body["status"] == "PAID"


def test_checkout_view_ignores_client_supplied_price(client, published_event, ticket_type):
    """El cliente no puede mandar un precio: no existe ese campo en el
    contrato, así que cualquier intento se ignora silenciosamente."""
    response = client.post(
        "/api/checkout/orders/",
        data={
            "event_id": str(published_event.id),
            "items": [{"ticket_type_id": str(ticket_type.id), "quantity": 1, "unit_price": "0.01"}],
            "buyer": {"email": "a@test.pe", "full_name": "A"},
            "terms_accepted": True,
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["order"]["total"] == "50.00"


def test_checkout_is_blocked_when_payments_are_disabled(client, published_event, ticket_type, settings):
    settings.PAYMENT_GATEWAY = "disabled"
    response = client.post(
        "/api/checkout/orders/",
        data={
            "event_id": str(published_event.id),
            "items": [{"ticket_type_id": str(ticket_type.id), "quantity": 1}],
            "buyer": {"email": "a@test.pe", "full_name": "A"},
            "terms_accepted": True,
        },
        format="json",
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PAYMENT_DISABLED"
    assert not Order.objects.exists()

    detail = client.get(f"/api/events/{published_event.slug}/")
    assert detail.status_code == 200
    assert detail.json()["payments_disabled"] is True


def test_confirm_and_ipn_fail_closed_when_payments_are_disabled(client, pending_order, settings):
    settings.PAYMENT_GATEWAY = "disabled"
    confirm = client.post(
        f"/api/checkout/orders/{pending_order.code}/confirm/",
        data={"order_code": pending_order.code, "approved": True},
        format="json",
    )
    assert confirm.status_code == 503
    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PENDING
