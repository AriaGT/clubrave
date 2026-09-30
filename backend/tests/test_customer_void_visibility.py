"""Épica D — H16 el comprador ve sus entradas anuladas.

La pestaña «Anuladas» de «Mis entradas» reúne las entradas `VOID` y todas las
de una orden cancelada o reembolsada, con el motivo y el contacto de la
organización, y sin código QR. La orden conserva su motivo y, si aplica, la
referencia del reembolso.
"""

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.orders.models import Ticket
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.fulfillment import mark_paid


def _token(user: User, scope: str, organization_id=None) -> str:
    refresh = RefreshToken.for_user(user)
    refresh["scope"] = scope
    if organization_id is not None:
        refresh["organization_id"] = str(organization_id)
    access = refresh.access_token
    access["scope"] = scope
    if organization_id is not None:
        access["organization_id"] = str(organization_id)
    return str(access)


@pytest.fixture
def customer_client(customer_user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(customer_user, 'customer')}")
    return client


@pytest.fixture
def organizer_client(organizer_user, organization):
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {_token(organizer_user, 'org', organization.id)}"
    )
    return client


def _paid_order_for(event, ticket_type, customer, *, quantity=2):
    order = create_order(
        event=event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=quantity)],
        buyer=BuyerData(email=customer.email, full_name="Compradora Test", phone="999 111 222"),
        customer=customer,
        terms_accepted=True,
    )
    mark_paid(order_id=order.id)
    return order


def test_void_tab_shows_only_voided_tickets_with_reason_and_contact(
    customer_client, organizer_client, customer_user, published_event, ticket_type
):
    order = _paid_order_for(published_event, ticket_type, customer_user)
    ticket = order.tickets.first()
    organizer_client.post(
        f"/api/org/tickets/{ticket.code}/void/",
        {"reason_code": "BUYER_REQUEST", "reason": "No puede asistir", "restock": True},
        format="json",
    )

    response = customer_client.get("/api/me/tickets/", {"status": "void"})

    assert response.status_code == 200
    results = response.json()["results"]
    assert [row["code"] for row in results] == [ticket.code]
    row = results[0]
    assert row["status"] == "VOID"
    assert row["void_reason"] == "No puede asistir"
    assert row["organization_name"] == published_event.organization.name
    assert row["organization_contact_email"] == published_event.organization.contact_email

    # La entrada anulada ya no aparece entre las activas.
    active = customer_client.get("/api/me/tickets/", {"status": "active"}).json()["results"]
    assert ticket.code not in [item["code"] for item in active]


def test_void_tab_includes_every_ticket_of_a_cancelled_order(
    customer_client, organizer_client, customer_user, published_event, ticket_type
):
    order = _paid_order_for(published_event, ticket_type, customer_user, quantity=3)
    organizer_client.post(
        f"/api/org/orders/{order.code}/void/",
        {"reason_code": "FRAUD", "reason": "Contracargo", "restock": True},
        format="json",
    )

    response = customer_client.get("/api/me/tickets/", {"status": "void"})

    assert response.status_code == 200
    rows = response.json()["results"]
    assert {row["order_code"] for row in rows} == {order.code}
    assert len(rows) == 3
    assert all(row["status"] == "VOID" for row in rows)

    # Ni activas ni usadas: la orden completa desaparece de las otras pestañas.
    for tab in ("active", "used"):
        codes = [
            item["code"]
            for item in customer_client.get("/api/me/tickets/", {"status": tab}).json()["results"]
        ]
        assert codes == []


def test_void_tab_is_empty_when_everything_is_valid(
    customer_client, customer_user, published_event, ticket_type
):
    _paid_order_for(published_event, ticket_type, customer_user, quantity=1)

    response = customer_client.get("/api/me/tickets/", {"status": "void"})

    assert response.status_code == 200
    assert response.json()["results"] == []


def test_void_tab_never_leaks_another_customers_tickets(
    customer_client, organizer_client, customer_user, published_event, ticket_type, db
):
    from apps.orders.services.checkout import BuyerData as BD

    other = User.objects.create_user(email="otra@test.pe", role=User.Role.CUSTOMER)
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BD(email=other.email, full_name="Otra Persona"),
        customer=other,
        terms_accepted=True,
    )
    mark_paid(order_id=order.id)
    organizer_client.post(
        f"/api/org/tickets/{order.tickets.first().code}/void/",
        {"reason_code": "OTHER", "reason": "", "restock": True},
        format="json",
    )

    response = customer_client.get("/api/me/tickets/", {"status": "void"})

    assert response.status_code == 200
    assert response.json()["results"] == []


def test_my_order_exposes_void_reason_and_refund_reference(
    customer_client, organizer_client, customer_user, published_event, ticket_type
):
    order = _paid_order_for(published_event, ticket_type, customer_user, quantity=2)
    organizer_client.post(
        f"/api/org/orders/{order.code}/void/",
        {"reason_code": "ORGANIZER_ERROR", "reason": "Producto equivocado", "restock": True},
        format="json",
    )
    organizer_client.post(
        f"/api/org/orders/{order.code}/mark-refunded/",
        {"refund_reference": "REF-123"},
        format="json",
    )

    response = customer_client.get(f"/api/me/orders/{order.code}/")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "REFUNDED"
    assert body["void_reason"] == "Producto equivocado"
    assert body["refund_reference"] == "REF-123"
    assert body["refunded_at"] is not None
    assert all(ticket["status"] == Ticket.Status.VOID for ticket in body["tickets"])


def test_order_void_reason_falls_back_to_the_reason_label_without_free_text(
    customer_client, organizer_client, customer_user, published_event, ticket_type
):
    """Sin texto libre, `Order.void_reason` no debe quedar vacío: es lo que
    lee "Mi cuenta" del comprador (no `void_reason_code`), así que sin este
    resguardo una orden anulada por código nada más se ve sin motivo."""
    order = _paid_order_for(published_event, ticket_type, customer_user, quantity=1)
    organizer_client.post(
        f"/api/org/orders/{order.code}/void/",
        {"reason_code": "DUPLICATE", "restock": True},
        format="json",
    )

    response = customer_client.get(f"/api/me/orders/{order.code}/")

    assert response.status_code == 200
    assert response.json()["void_reason"] == "Compra duplicada"
