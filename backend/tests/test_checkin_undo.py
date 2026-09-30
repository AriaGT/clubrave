"""Épica C — H13 deshacer un ingreso escaneado por error.

El chico de la puerta escaneó el QR equivocado: desde la pantalla ámbar se
deshace el ingreso, la entrada vuelve a `VALID` y el check-in anterior queda
en la bitácora. El siguiente escaneo vuelve a dar verde.
"""

import pytest

from apps.accounts.models import Membership, Organization, User
from apps.checkin.services import check_in
from apps.common.models import AuditLog
from apps.orders.models import Ticket
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.codes import sign_ticket_code
from apps.orders.services.fulfillment import mark_paid

BUYER = BuyerData(email="comprador@test.pe", full_name="Comprador Test")


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


@pytest.fixture
def paid_ticket(published_event, ticket_type):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=2)],
        buyer=BUYER,
        terms_accepted=True,
    )
    order = mark_paid(order_id=order.id)
    return order.tickets.first()


def _org_id(organizer_user):
    return Membership.objects.get(user=organizer_user).organization_id


def _scan(ticket, event, organizer_user):
    return check_in(
        qr_payload=sign_ticket_code(ticket.code),
        event_id=event.id,
        organization_id=_org_id(organizer_user),
        actor=organizer_user,
    )


def _undo_url(code):
    return f"/api/org/tickets/{code}/undo-checkin/"


def test_undo_returns_to_valid_and_allows_a_second_scan(
    client_a, paid_ticket, published_event, organizer_user
):
    _scan(paid_ticket, published_event, organizer_user)
    paid_ticket.refresh_from_db()
    assert paid_ticket.status == "CHECKED_IN"

    response = client_a.post(
        _undo_url(paid_ticket.code), {"reason_code": "MISTAKE", "reason": ""}, format="json"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "VALID"
    assert body["ticket_code"] == paid_ticket.code
    paid_ticket.refresh_from_db()
    assert paid_ticket.status == "VALID"
    assert paid_ticket.checked_in_at is None
    assert paid_ticket.checked_in_by is None

    # La puerta vuelve a aceptar el QR.
    result = _scan(paid_ticket, published_event, organizer_user)
    assert result.just_checked_in
    paid_ticket.refresh_from_db()
    assert paid_ticket.status == "CHECKED_IN"


def test_undo_keeps_previous_checkin_in_the_audit_log(
    client_a, paid_ticket, published_event, organizer_user
):
    _scan(paid_ticket, published_event, organizer_user)
    paid_ticket.refresh_from_db()
    previous_at = paid_ticket.checked_in_at

    client_a.post(
        _undo_url(paid_ticket.code), {"reason_code": "DOUBLE_SCAN", "reason": ""}, format="json"
    )

    entry = AuditLog.objects.get(event=published_event, action=AuditLog.Action.CHECKIN_UNDONE)
    assert entry.target_label == paid_ticket.code
    assert entry.actor_email == organizer_user.email
    assert entry.reason == "Doble escaneo"
    assert entry.metadata["order_code"] == paid_ticket.order.code
    assert entry.metadata["previous_check_in"]["checked_in_at"] == previous_at.isoformat()
    assert entry.metadata["previous_check_in"]["checked_in_by"] == organizer_user.email


def test_undo_on_a_valid_ticket_fails(client_a, paid_ticket):
    response = client_a.post(
        _undo_url(paid_ticket.code), {"reason_code": "MISTAKE"}, format="json"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CHECKIN_NOT_UNDOABLE"


def test_undo_on_a_void_ticket_fails(client_a, paid_ticket):
    client_a.post(
        f"/api/org/tickets/{paid_ticket.code}/void/",
        {"reason_code": "FRAUD", "restock": True},
        format="json",
    )
    response = client_a.post(_undo_url(paid_ticket.code), {"reason_code": "MISTAKE"}, format="json")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CHECKIN_NOT_UNDOABLE"


def test_undo_requires_a_reason_code(client_a, paid_ticket, published_event, organizer_user):
    _scan(paid_ticket, published_event, organizer_user)
    response = client_a.post(_undo_url(paid_ticket.code), {}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_undo_is_scoped_to_the_organization(
    client_b, paid_ticket, published_event, organizer_user
):
    _scan(paid_ticket, published_event, organizer_user)
    response = client_b.post(_undo_url(paid_ticket.code), {"reason_code": "MISTAKE"}, format="json")
    assert response.status_code == 404
    paid_ticket.refresh_from_db()
    assert paid_ticket.status == "CHECKED_IN"


def test_undo_requires_an_organizer_session(paid_ticket, published_event, organizer_user):
    _scan(paid_ticket, published_event, organizer_user)
    from rest_framework.test import APIClient

    response = APIClient().post(_undo_url(paid_ticket.code), {"reason_code": "MISTAKE"}, format="json")
    assert response.status_code == 401
    paid_ticket.refresh_from_db()
    assert paid_ticket.status == "CHECKED_IN"


def test_undo_only_resets_the_target_ticket(client_a, published_event, ticket_type, organizer_user):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=2)],
        buyer=BUYER,
        terms_accepted=True,
    )
    order = mark_paid(order_id=order.id)
    first, second = list(order.tickets.all())
    _scan(first, published_event, organizer_user)
    _scan(second, published_event, organizer_user)

    client_a.post(_undo_url(first.code), {"reason_code": "OTHER"}, format="json")

    first.refresh_from_db()
    second.refresh_from_db()
    assert first.status == "VALID"
    assert second.status == Ticket.Status.CHECKED_IN
