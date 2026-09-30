from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import Membership, Organization, User
from apps.checkin.services import check_in, lookup
from apps.common.errors import DomainError
from apps.events.models import Event
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.codes import sign_ticket_code
from apps.orders.services.fulfillment import mark_paid

BUYER = BuyerData(email="comprador@test.pe", full_name="Comprador Test")


@pytest.fixture
def paid_ticket(published_event, ticket_type, organizer_user):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BUYER,
        terms_accepted=True,
    )
    order = mark_paid(order_id=order.id)
    return order.tickets.first()


def _org_id(organizer_user):
    return Membership.objects.get(user=organizer_user).organization_id


def _scan(ticket, event, organizer_user, *, organization_id=None):
    return check_in(
        qr_payload=sign_ticket_code(ticket.code),
        event_id=event.id,
        organization_id=organization_id or _org_id(organizer_user),
        actor=organizer_user,
    )


def test_valid_scan_checks_in_the_ticket(paid_ticket, published_event, organizer_user):
    result = _scan(paid_ticket, published_event, organizer_user)
    assert result.just_checked_in
    paid_ticket.refresh_from_db()
    assert paid_ticket.status == "CHECKED_IN"
    assert paid_ticket.checked_in_by_id == organizer_user.id


def test_double_scan_is_rejected_with_who_and_when(paid_ticket, published_event, organizer_user):
    _scan(paid_ticket, published_event, organizer_user)

    with pytest.raises(DomainError) as exc:
        _scan(paid_ticket, published_event, organizer_user)

    assert exc.value.code == "TICKET_ALREADY_USED"
    assert exc.value.details["checked_in_by"] == organizer_user.email


def test_scan_for_wrong_event_is_rejected(paid_ticket, organizer_user):
    other_event = Event.objects.create(
        organization=Membership.objects.get(user=organizer_user).organization,
        title="Otro evento",
        starts_at=timezone.now() + timedelta(days=5),
        venue_name="Otro local",
        status=Event.Status.PUBLISHED,
    )
    with pytest.raises(DomainError) as exc:
        _scan(paid_ticket, other_event, organizer_user)
    assert exc.value.code == "TICKET_WRONG_EVENT"


def test_scan_for_another_organization_looks_like_invalid(paid_ticket, published_event):
    """Regla de negocio: un ticket de otra organización da el mismo error
    que uno inexistente, para no poder sondear códigos ajenos (§5.9)."""
    other_org = Organization.objects.create(
        name="Otra promotora", slug="otra-promotora", contact_email="otra@test.pe"
    )
    other_user = User.objects.create_user(email="otro@test.pe", password="x", role=User.Role.ORGANIZER)
    Membership.objects.create(user=other_user, organization=other_org, role=Membership.Role.OWNER)

    with pytest.raises(DomainError) as exc:
        _scan(paid_ticket, published_event, other_user, organization_id=other_org.id)
    assert exc.value.code == "TICKET_INVALID"


def test_forged_qr_is_rejected_without_touching_the_database(published_event, organizer_user):
    with pytest.raises(DomainError) as exc:
        check_in(
            qr_payload="T1.FAKECODE0000000000AB.k1.badsignature",
            event_id=published_event.id,
            organization_id=_org_id(organizer_user),
            actor=organizer_user,
        )
    assert exc.value.code == "TICKET_INVALID"


def test_manual_code_entry_checks_in_without_signature(paid_ticket, published_event, organizer_user):
    """Resiliencia de puerta (§10.5): el personal puede teclear el código
    de 22 caracteres tal cual, sin la firma completa del QR."""
    result = check_in(
        qr_payload=None,
        manual_code=paid_ticket.code,
        event_id=published_event.id,
        organization_id=_org_id(organizer_user),
        actor=organizer_user,
    )
    assert result.just_checked_in


def test_manual_code_entry_is_case_insensitive(paid_ticket, published_event, organizer_user):
    result = check_in(
        qr_payload=None,
        manual_code=paid_ticket.code.lower(),
        event_id=published_event.id,
        organization_id=_org_id(organizer_user),
        actor=organizer_user,
    )
    assert result.just_checked_in


def test_lookup_does_not_burn_the_ticket(paid_ticket, published_event, organizer_user):
    payload = sign_ticket_code(paid_ticket.code)
    ticket = lookup(qr_payload=payload, event_id=published_event.id, organization_id=_org_id(organizer_user))
    assert ticket.status == "VALID"
    paid_ticket.refresh_from_db()
    assert paid_ticket.status == "VALID"
