"""Códigos de invitado: generación en lote, validación, redención (una sola
vez, también bajo concurrencia), anulación, aislamiento por organización,
ingresos sin invitados y check-in con la marca de invitado."""

import threading
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core import mail
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Membership, Organization, User
from apps.checkin.services import check_in
from apps.common.errors import DomainError
from apps.common.models import AuditLog
from apps.events.models import Event, TicketType
from apps.orders.models import GuestCode, Order, Ticket
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.codes import ALPHABET, sign_ticket_code
from apps.orders.services.fulfillment import mark_paid
from apps.orders.services.guest_codes import (
    GUEST_CODE_LENGTH,
    format_guest_code,
    generate_guest_codes,
    redeem_guest_code,
    validate_guest_code,
    void_guest_code,
)
from apps.orders.services.stats import event_stats

GUEST = BuyerData(email="invitada@test.pe", full_name="Invitada Test", document_id="12345678")


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


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def org_client(organizer_user, organization):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(organizer_user, 'org', organization.id)}")
    return client


@pytest.fixture
def customer_client(customer_user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(customer_user, 'customer')}")
    return client


@pytest.fixture
def vip(published_event):
    return TicketType.objects.create(
        event=published_event, name="VIP", price=Decimal("120.00"), quantity_total=10
    )


def _generate(event, ticket_type, user, quantity=3, label=""):
    return generate_guest_codes(
        event=event, ticket_type_id=ticket_type.id, quantity=quantity, actor=user, label=label
    )


# ── Generación en lote ───────────────────────────────────────────────────────


def test_batch_generation_creates_unique_hard_to_guess_codes(published_event, vip, organizer_user):
    codes = _generate(published_event, vip, organizer_user, quantity=5, label="Prensa")

    assert len(codes) == 5
    assert len({c.code for c in codes}) == 5
    assert len({c.batch_id for c in codes}) == 1  # un lote
    for guest_code in codes:
        assert len(guest_code.code) == GUEST_CODE_LENGTH
        assert set(guest_code.code) <= set(ALPHABET)  # sin I, L, O, 0, 1
        assert guest_code.status == GuestCode.Status.AVAILABLE
        assert guest_code.ticket_type_id == vip.id
        assert guest_code.label == "Prensa"


def test_generation_reserves_capacity(published_event, vip, organizer_user):
    """Decisión de inventario: el cupo se retiene al generar."""
    _generate(published_event, vip, organizer_user, quantity=4)
    vip.refresh_from_db()
    assert vip.quantity_reserved == 4
    assert vip.quantity_sold == 0
    assert vip.available == 6


def test_generation_cannot_exceed_available_capacity(published_event, vip, organizer_user):
    with pytest.raises(DomainError) as exc:
        _generate(published_event, vip, organizer_user, quantity=11)
    assert exc.value.code == "SOLD_OUT"
    assert GuestCode.objects.count() == 0
    vip.refresh_from_db()
    assert vip.quantity_reserved == 0


def test_generated_codes_block_public_sale_of_that_capacity(published_event, vip, organizer_user):
    _generate(published_event, vip, organizer_user, quantity=10)
    with pytest.raises(DomainError) as exc:
        create_order(
            event=published_event,
            items=[CartLine(ticket_type_id=str(vip.id), quantity=1)],
            buyer=GUEST,
            terms_accepted=True,
        )
    assert exc.value.code == "SOLD_OUT"


def test_generation_requires_ticket_type_of_the_same_event(published_event, organizer_user, organization):
    other_event = Event.objects.create(
        organization=organization,
        title="Otro",
        starts_at=timezone.now() + timedelta(days=3),
        venue_name="X",
        status=Event.Status.PUBLISHED,
    )
    foreign_type = TicketType.objects.create(
        event=other_event, name="General", price=Decimal("10.00"), quantity_total=5
    )
    with pytest.raises(DomainError) as exc:
        _generate(published_event, foreign_type, organizer_user)
    assert exc.value.code == "VALIDATION_ERROR"


def test_generation_is_audited(published_event, vip, organizer_user):
    _generate(published_event, vip, organizer_user, quantity=2)
    log = AuditLog.objects.get(action=AuditLog.Action.GUEST_CODES_GENERATED)
    assert log.event_id == published_event.id
    assert log.metadata["quantity"] == 2
    assert log.metadata["ticket_type"] == "VIP"


def test_generate_endpoint_and_list(org_client, published_event, vip):
    response = org_client.post(
        f"/api/org/events/{published_event.id}/guest-codes/",
        {"ticket_type_id": str(vip.id), "quantity": 3, "label": "Lista DJ"},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert len(body["codes"]) == 3
    assert body["codes"][0]["ticket_type_name"] == "VIP"
    assert body["codes"][0]["status"] == "AVAILABLE"

    listing = org_client.get(f"/api/org/events/{published_event.id}/guest-codes/")
    assert listing.status_code == 200
    assert len(listing.json()) == 3

    filtered = org_client.get(f"/api/org/events/{published_event.id}/guest-codes/?status=REDEEMED")
    assert filtered.json() == []


# ── Validación y redención ───────────────────────────────────────────────────


def test_validate_returns_ticket_type_and_accepts_formatted_input(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    typed = format_guest_code(guest_code.code).lower()  # "abcd-efgh-jkmn"
    found = validate_guest_code(raw_code=typed, event_id=published_event.id)
    assert found.pk == guest_code.pk
    assert found.ticket_type.name == "VIP"


def test_validate_unknown_code_is_invalid(published_event):
    with pytest.raises(DomainError) as exc:
        validate_guest_code(raw_code="ZZZZ-ZZZZ-ZZZZ", event_id=published_event.id)
    assert exc.value.code == "GUEST_CODE_INVALID"


def test_code_from_another_event_looks_like_unknown(published_event, vip, organizer_user, organization):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    other_event = Event.objects.create(
        organization=organization,
        title="Otro",
        starts_at=timezone.now() + timedelta(days=3),
        venue_name="X",
        status=Event.Status.PUBLISHED,
    )
    with pytest.raises(DomainError) as exc:
        validate_guest_code(raw_code=guest_code.code, event_id=other_event.id)
    assert exc.value.code == "GUEST_CODE_INVALID"


def test_redeem_issues_free_paid_guest_order_with_ticket_and_email(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=2)[0]
    result = redeem_guest_code(
        raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True
    )

    order = result.order
    assert order.status == Order.Status.PAID
    assert order.is_guest is True
    assert order.total == 0
    assert order.gateway == "guest"
    assert order.buyer_document == "12345678"
    ticket = Ticket.objects.get(order=order)
    assert ticket.ticket_type_id == vip.id
    assert ticket.holder_name == "Invitada Test"

    guest_code.refresh_from_db()
    assert guest_code.status == GuestCode.Status.REDEEMED
    assert guest_code.order_id == order.id
    assert guest_code.redeemed_at is not None

    vip.refresh_from_db()
    assert vip.quantity_reserved == 1  # el otro código sigue retenido
    assert vip.quantity_sold == 1

    assert AuditLog.objects.filter(action=AuditLog.Action.GUEST_CODE_REDEEMED).count() == 1


@pytest.mark.django_db(transaction=True)
def test_redeem_sends_the_tickets_email_marked_as_guest(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    mail.outbox.clear()
    redeem_guest_code(
        raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True
    )
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == ["invitada@test.pe"]
    assert "invitado" in message.subject.lower()
    html = message.alternatives[0][0] if message.alternatives else message.body
    assert "INVITADO" in html
    assert "VIP" in html
    assert len(message.attachments) == 1  # el QR


def test_double_redemption_is_rejected(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    redeem_guest_code(raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True)

    with pytest.raises(DomainError) as exc:
        redeem_guest_code(
            raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True
        )
    assert exc.value.code == "GUEST_CODE_ALREADY_USED"
    assert Order.objects.filter(is_guest=True).count() == 1
    vip.refresh_from_db()
    assert vip.quantity_sold == 1
    assert vip.quantity_reserved == 0


def test_redeem_requires_terms(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    with pytest.raises(DomainError) as exc:
        redeem_guest_code(
            raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=False
        )
    assert exc.value.code == "VALIDATION_ERROR"
    guest_code.refresh_from_db()
    assert guest_code.status == GuestCode.Status.AVAILABLE


def test_redeem_works_even_when_sales_are_paused_or_type_inactive(published_event, vip, organizer_user):
    """Una invitación no es una venta: pausar la venta o esconder el tipo de
    entrada (p. ej. un tipo "Invitados" inactivo) no la bloquea."""
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    published_event.sales_paused_at = timezone.now()
    published_event.save(update_fields=["sales_paused_at"])
    vip.is_active = False
    vip.save(update_fields=["is_active"])

    result = redeem_guest_code(
        raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True
    )
    assert result.order.status == Order.Status.PAID


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor == "sqlite",
    reason="SQLite serializa el archivo completo a nivel de proceso: no emula "
    "el bloqueo de fila de Postgres. Este escenario corre en CI contra Postgres real.",
)
def test_concurrent_redemptions_of_the_same_code_issue_a_single_ticket(
    published_event, vip, organizer_user
):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    results = []

    def attempt():
        connection.close()  # cada hilo necesita su propia conexión
        try:
            result = redeem_guest_code(
                raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True
            )
            results.append(("ok", result.order.code))
        except DomainError as exc:
            results.append(("error", exc.code))
        finally:
            connection.close()

    threads = [threading.Thread(target=attempt) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len([r for r in results if r[0] == "ok"]) == 1
    assert all(code == "GUEST_CODE_ALREADY_USED" for kind, code in results if kind == "error")
    assert Ticket.objects.filter(order__is_guest=True).count() == 1
    vip.refresh_from_db()
    assert vip.quantity_sold == 1
    assert vip.quantity_reserved == 0


def test_redeem_rejected_for_cancelled_event(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    Event.objects.filter(pk=published_event.pk).update(status=Event.Status.CANCELLED)
    with pytest.raises(DomainError) as exc:
        redeem_guest_code(
            raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True
        )
    assert exc.value.code == "EVENT_CANCELLED"


# ── Anulación ────────────────────────────────────────────────────────────────


def test_void_available_code_releases_capacity_and_blocks_redemption(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=2)[0]
    void_guest_code(guest_code=guest_code, actor=organizer_user, reason="Se equivocó de lista")

    guest_code.refresh_from_db()
    assert guest_code.status == GuestCode.Status.VOIDED
    vip.refresh_from_db()
    assert vip.quantity_reserved == 1

    with pytest.raises(DomainError) as exc:
        redeem_guest_code(
            raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True
        )
    assert exc.value.code == "GUEST_CODE_INVALID"
    assert AuditLog.objects.filter(action=AuditLog.Action.GUEST_CODE_VOIDED).count() == 1


def test_redeemed_code_cannot_be_voided(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    redeem_guest_code(raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True)
    with pytest.raises(DomainError) as exc:
        void_guest_code(guest_code=guest_code, actor=organizer_user)
    assert exc.value.code == "GUEST_CODE_NOT_VOIDABLE"


def test_void_endpoint(org_client, published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    response = org_client.post(f"/api/org/guest-codes/{guest_code.id}/void/", {}, format="json")
    assert response.status_code == 200
    assert response.json()["status"] == "VOIDED"


def test_cancelling_the_event_voids_unused_codes_and_releases_capacity(
    org_client, published_event, vip, organizer_user
):
    _generate(published_event, vip, organizer_user, quantity=3)
    response = org_client.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {"reason_code": "WEATHER", "reason": "", "confirm_title": published_event.title},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["guest_codes_voided"] == 3
    vip.refresh_from_db()
    assert vip.quantity_reserved == 0


def test_ticket_type_with_guest_codes_cannot_be_deleted(org_client, published_event, vip, organizer_user):
    _generate(published_event, vip, organizer_user, quantity=1)
    response = org_client.delete(f"/api/org/ticket-types/{vip.id}/")
    assert response.status_code == 400
    assert TicketType.objects.filter(id=vip.id).exists()


def test_capacity_cannot_drop_below_reserved_guest_codes(org_client, published_event, vip, organizer_user):
    _generate(published_event, vip, organizer_user, quantity=5)
    response = org_client.patch(f"/api/org/ticket-types/{vip.id}/", {"quantity_total": 4}, format="json")
    assert response.status_code == 400


# ── Aislamiento por organización ─────────────────────────────────────────────


@pytest.fixture
def client_b(db):
    org_b = Organization.objects.create(name="Promotora B", slug="promotora-b", contact_email="b@test.pe")
    user_b = User.objects.create_user(email="b@test.pe", password="x", role=User.Role.ORGANIZER)
    Membership.objects.create(user=user_b, organization=org_b, role=Membership.Role.OWNER)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(user_b, 'org', org_b.id)}")
    return client


def test_org_b_cannot_generate_codes_for_org_a_event(client_b, published_event, vip):
    response = client_b.post(
        f"/api/org/events/{published_event.id}/guest-codes/",
        {"ticket_type_id": str(vip.id), "quantity": 2},
        format="json",
    )
    assert response.status_code == 404
    assert GuestCode.objects.count() == 0


def test_org_b_cannot_list_org_a_codes(client_b, published_event, vip, organizer_user):
    _generate(published_event, vip, organizer_user, quantity=2)
    response = client_b.get(f"/api/org/events/{published_event.id}/guest-codes/")
    assert response.status_code == 200
    assert response.json() == []


def test_org_b_cannot_void_org_a_code(client_b, published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    response = client_b.post(f"/api/org/guest-codes/{guest_code.id}/void/", {}, format="json")
    assert response.status_code == 404
    guest_code.refresh_from_db()
    assert guest_code.status == GuestCode.Status.AVAILABLE


def test_customer_token_cannot_generate_codes(customer_client, published_event, vip):
    response = customer_client.post(
        f"/api/org/events/{published_event.id}/guest-codes/",
        {"ticket_type_id": str(vip.id), "quantity": 1},
        format="json",
    )
    assert response.status_code in (401, 403)


# ── Endpoints públicos ───────────────────────────────────────────────────────


def test_public_validate_endpoint(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    response = APIClient().post(
        "/api/guest-codes/validate/",
        {"code": format_guest_code(guest_code.code), "event_id": str(published_event.id)},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ticket_type"]["name"] == "VIP"
    assert body["event"]["slug"] == published_event.slug
    guest_code.refresh_from_db()
    assert guest_code.status == GuestCode.Status.AVAILABLE  # validar no redime


def test_public_validate_is_throttled_per_ip(published_event):
    client = APIClient()
    statuses = [
        client.post(
            "/api/guest-codes/validate/",
            {"code": "ZZZZZZZZZZZZ", "event_id": str(published_event.id)},
            format="json",
        ).status_code
        for _ in range(31)
    ]
    assert statuses[:30] == [404] * 30
    assert statuses[30] == 429


def test_redeem_endpoint_requires_customer_session(published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    response = APIClient().post(
        "/api/guest-codes/redeem/",
        {
            "code": guest_code.code,
            "event_id": str(published_event.id),
            "buyer": {"email": "x@test.pe", "full_name": "X", "document_id": "12345678"},
            "terms_accepted": True,
        },
        format="json",
    )
    assert response.status_code == 401


def test_redeem_endpoint_ties_ticket_to_the_verified_customer(
    customer_client, customer_user, published_event, vip, organizer_user
):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    response = customer_client.post(
        "/api/guest-codes/redeem/",
        {
            "code": guest_code.code,
            "event_id": str(published_event.id),
            "buyer": {"email": "otro@correo.pe", "full_name": "Ana Invitada", "document_id": "87654321"},
            "terms_accepted": True,
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["is_guest"] is True
    assert body["total"] == "0.00"
    assert body["buyer_email"] == customer_user.email  # nunca el email del formulario
    assert body["tickets"][0]["is_guest"] is True
    assert body["tickets"][0]["ticket_type_name"] == "VIP"

    mine = customer_client.get("/api/me/tickets/?status=active")
    assert mine.json()["results"][0]["is_guest"] is True


# ── Reportes e ingresos ──────────────────────────────────────────────────────


def test_guests_are_issued_but_never_counted_as_revenue(published_event, vip, ticket_type, organizer_user):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(vip.id), quantity=2)],
        buyer=BuyerData(email="c@test.pe", full_name="Comprador"),
        terms_accepted=True,
    )
    mark_paid(order_id=order.id)
    codes = _generate(published_event, vip, organizer_user, quantity=3)
    for guest_code in codes[:2]:
        redeem_guest_code(
            raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True
        )

    stats = event_stats(event=published_event)
    assert Decimal(stats["revenue"]["gross"]) == Decimal("240.00")  # SQLite suma como float
    assert stats["revenue"]["orders_paid"] == 1
    assert stats["tickets"]["sold"] == 2
    assert stats["tickets"]["guests"] == 2
    assert stats["guest_codes"] == {"total": 3, "available": 1, "redeemed": 2, "voided": 0}
    vip_row = next(row for row in stats["by_ticket_type"] if row["name"] == "VIP")
    assert vip_row["sold"] == 2
    assert vip_row["guests"] == 2
    assert vip_row["revenue"] == "240.00"
    assert vip_row["available"] == 10 - 2 - 2 - 1  # vendidas, invitados, código sin usar


def test_guest_orders_are_marked_in_the_csv(org_client, published_event, vip, organizer_user):
    guest_code = _generate(published_event, vip, organizer_user, quantity=1)[0]
    redeem_guest_code(raw_code=guest_code.code, event_id=published_event.id, buyer=GUEST, terms_accepted=True)
    rows = org_client.get(f"/api/org/events/{published_event.id}/orders.csv").content.decode().splitlines()
    assert rows[0].endswith("invitado")
    assert rows[1].endswith("si")


# ── Check-in ─────────────────────────────────────────────────────────────────


def _redeemed_ticket(event, ticket_type, user) -> Ticket:
    guest_code = _generate(event, ticket_type, user, quantity=1)[0]
    result = redeem_guest_code(
        raw_code=guest_code.code, event_id=event.id, buyer=GUEST, terms_accepted=True
    )
    return result.order.tickets.get()


def test_guest_ticket_checks_in_like_any_other(published_event, vip, organizer_user, organization):
    ticket = _redeemed_ticket(published_event, vip, organizer_user)
    result = check_in(
        qr_payload=sign_ticket_code(ticket.code),
        event_id=published_event.id,
        organization_id=organization.id,
        actor=organizer_user,
    )
    assert result.just_checked_in
    assert result.ticket.order.is_guest is True


def test_checkin_endpoint_shows_guest_ticket_type_and_zone(org_client, published_event, vip, organizer_user):
    ticket = _redeemed_ticket(published_event, vip, organizer_user)
    response = org_client.post(
        "/api/org/checkin/",
        {"qr_payload": sign_ticket_code(ticket.code), "event_id": str(published_event.id)},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()["ticket"]
    assert body["is_guest"] is True
    assert body["ticket_type_name"] == "VIP"

    again = org_client.post(
        "/api/org/checkin/",
        {"manual_code": ticket.code, "event_id": str(published_event.id)},
        format="json",
    )
    assert again.status_code == 409
    details = again.json()["error"]["details"]
    assert details["is_guest"] is True
    assert details["ticket_type_name"] == "VIP"


def test_checkin_endpoint_marks_regular_tickets_as_not_guest(org_client, published_event, ticket_type):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BuyerData(email="c@test.pe", full_name="Comprador"),
        terms_accepted=True,
    )
    ticket = mark_paid(order_id=order.id).tickets.get()
    response = org_client.post(
        "/api/org/checkin/",
        {"qr_payload": sign_ticket_code(ticket.code), "event_id": str(published_event.id)},
        format="json",
    )
    assert response.json()["ticket"]["is_guest"] is False


def test_checkin_lookup_exposes_guest_flag(org_client, published_event, vip, organizer_user):
    ticket = _redeemed_ticket(published_event, vip, organizer_user)
    response = org_client.get(
        "/api/org/checkin/lookup/",
        {"manual_code": ticket.code, "event_id": str(published_event.id)},
    )
    assert response.status_code == 200
    assert response.json()["is_guest"] is True
