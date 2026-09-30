"""Épica C — H12 anular una entrada suelta.

De una compra de 6 puede anularse solo la del que no va a venir: la entrada
pasa a `VOID`, el cupo puede volver a la venta y la orden **sigue** `PAID`.
Todo acotado por la organización del JWT y con su bitácora.
"""

import pytest

from apps.accounts.models import Membership, Organization, User
from apps.checkin.services import check_in
from apps.common.errors import DomainError
from apps.common.models import AuditLog
from apps.orders.models import Ticket
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.codes import sign_ticket_code
from apps.orders.services.fulfillment import mark_paid


def _org_token(user: User, organization_id) -> str:
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(user)
    refresh["scope"] = "org"
    refresh["organization_id"] = str(organization_id)
    access = refresh.access_token
    access["scope"] = "org"
    access["organization_id"] = str(organization_id)
    return str(access)


@pytest.fixture
def client_a(organizer_user, organization):
    from rest_framework.test import APIClient

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_org_token(organizer_user, organization.id)}")
    return client


@pytest.fixture
def org_b(db):
    return Organization.objects.create(name="Promotora B", slug="promotora-b", contact_email="b@test.pe")


@pytest.fixture
def client_b(db, org_b):
    from rest_framework.test import APIClient

    user = User.objects.create_user(email="organizadorb@test.pe", password="x", role=User.Role.ORGANIZER)
    Membership.objects.create(user=user, organization=org_b, role=Membership.Role.OWNER)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_org_token(user, org_b.id)}")
    return client


def _paid_order(event, ticket_type, *, quantity=4, email="lucia@test.pe", name="Lucía Pérez"):
    order = create_order(
        event=event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=quantity)],
        buyer=BuyerData(email=email, full_name=name, phone="999 888 777", document_id="43211234"),
        terms_accepted=True,
    )
    mark_paid(order_id=order.id)
    return order


def _void_url(code):
    return f"/api/org/tickets/{code}/void/"


def test_void_ticket_voids_only_that_ticket_and_restocks(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=3)
    ticket = order.tickets.first()
    ticket_type.refresh_from_db()
    sold_before = ticket_type.quantity_sold

    response = client_a.post(
        _void_url(ticket.code),
        {"reason_code": "BUYER_REQUEST", "reason": "No puede asistir", "restock": True},
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ticket_code"] == ticket.code
    assert body["order_code"] == order.code
    assert body["status"] == "VOID"
    assert body["restocked"] is True

    # Solo esa entrada cambió; la orden sigue PAID con una entrada menos válida.
    ticket.refresh_from_db()
    assert ticket.status == "VOID"
    assert ticket.voided_at is not None
    assert ticket.void_reason == "No puede asistir"
    order.refresh_from_db()
    assert order.status == "PAID"
    assert order.tickets.filter(status=Ticket.Status.VALID).count() == 2
    # El cupo volvió a la venta.
    ticket_type.refresh_from_db()
    assert ticket_type.quantity_sold == sold_before - 1


def test_void_ticket_without_restock_keeps_capacity_consumed(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=2)
    ticket = order.tickets.first()
    ticket_type.refresh_from_db()
    sold_before = ticket_type.quantity_sold

    response = client_a.post(
        _void_url(ticket.code), {"reason_code": "OTHER", "restock": False}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["restocked"] is False
    ticket_type.refresh_from_db()
    assert ticket_type.quantity_sold == sold_before


def test_void_ticket_requires_a_reason_code(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)
    response = client_a.post(_void_url(order.tickets.first().code), {"restock": True}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_void_checked_in_ticket_is_rejected(client_a, published_event, ticket_type, organizer_user):
    order = _paid_order(published_event, ticket_type, quantity=1)
    ticket = order.tickets.first()
    check_in(
        qr_payload=sign_ticket_code(ticket.code),
        event_id=published_event.id,
        organization_id=Membership.objects.get(user=organizer_user).organization_id,
        actor=organizer_user,
    )

    response = client_a.post(
        _void_url(ticket.code), {"reason_code": "OTHER", "restock": True}, format="json"
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TICKET_NOT_VOIDABLE"
    ticket.refresh_from_db()
    assert ticket.status == "CHECKED_IN"


def test_void_already_voided_ticket_is_rejected(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)
    ticket = order.tickets.first()
    client_a.post(_void_url(ticket.code), {"reason_code": "OTHER", "restock": True}, format="json")

    response = client_a.post(
        _void_url(ticket.code), {"reason_code": "OTHER", "restock": True}, format="json"
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TICKET_NOT_VOIDABLE"


def test_void_ticket_is_scoped_to_the_organization(client_b, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)
    response = client_b.post(
        _void_url(order.tickets.first().code), {"reason_code": "OTHER", "restock": True}, format="json"
    )
    assert response.status_code == 404


def test_void_ticket_records_audit_with_reason_and_author(
    client_a, published_event, ticket_type, organizer_user
):
    order = _paid_order(published_event, ticket_type, quantity=2)
    ticket = order.tickets.first()
    client_a.post(
        _void_url(ticket.code),
        {"reason_code": "ORGANIZER_ERROR", "reason": "Me equivoqué", "restock": True},
        format="json",
    )

    entry = AuditLog.objects.get(event=published_event, action=AuditLog.Action.TICKET_VOIDED)
    assert entry.target_label == ticket.code
    assert entry.actor_email == organizer_user.email
    assert entry.reason == "Me equivoqué"
    assert entry.metadata["reason_code"] == "ORGANIZER_ERROR"
    assert entry.metadata["order_code"] == order.code


def test_scanner_rejects_qr_of_a_voided_ticket(client_a, published_event, ticket_type, organizer_user):
    order = _paid_order(published_event, ticket_type, quantity=2)
    ticket = order.tickets.first()
    client_a.post(_void_url(ticket.code), {"reason_code": "FRAUD", "restock": True}, format="json")

    with pytest.raises(DomainError) as exc:
        check_in(
            qr_payload=sign_ticket_code(ticket.code),
            event_id=published_event.id,
            organization_id=Membership.objects.get(user=organizer_user).organization_id,
            actor=organizer_user,
        )
    assert exc.value.code == "TICKET_INVALID"
    # La orden sigue PAID y la otra entrada sigue siendo válida.
    order.refresh_from_db()
    assert order.status == "PAID"
    assert order.tickets.filter(status=Ticket.Status.VALID).count() == 1


def test_attendees_search_filters_by_name_and_buyer(client_a, published_event, ticket_type):
    lucia = _paid_order(published_event, ticket_type, quantity=1, email="lucia@test.pe", name="Lucía Pérez")
    pedro = _paid_order(published_event, ticket_type, quantity=1, email="pedro@test.pe", name="Pedro Gómez")

    response = client_a.get(f"/api/org/events/{published_event.id}/attendees/", {"q": "pedro"})

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["order_code"] == pedro.code
    assert lucia.code not in [r["order_code"] for r in results]
