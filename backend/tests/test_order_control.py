"""Épica B — Control del dinero (H07–H11).

H07 detalle de una venta, H08 anular una venta (con restock, CHECKED_IN
respetadas, email al comprador), H09 registrar el reembolso + columnas del CSV,
H10 reenviar entradas (límite 5/día por orden) y H11 buscar órdenes. Todo
acotado por la organización del JWT y con su bitácora.
"""

import csv
import io
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core import mail
from django.test import override_settings
from django.utils import timezone

from apps.accounts.models import Membership, Organization, User
from apps.checkin.services import check_in
from apps.common.errors import DomainError
from apps.common.models import AuditLog
from apps.events.models import Event, TicketType
from apps.orders.models import Order, Ticket
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.codes import sign_ticket_code
from apps.orders.services.fulfillment import mark_failed, mark_paid
from apps.orders.services.void import VOID_REASON_LABELS


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
def org_b_user(db, org_b):
    user = User.objects.create_user(email="organizadorb@test.pe", password="x", role=User.Role.ORGANIZER)
    Membership.objects.create(user=user, organization=org_b, role=Membership.Role.OWNER)
    return user


@pytest.fixture
def client_b(org_b_user, org_b):
    from rest_framework.test import APIClient

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_org_token(org_b_user, org_b.id)}")
    return client


def _order(event, ticket_type, *, quantity=4, email="lucia@test.pe", name="Lucía Pérez") -> Order:
    return create_order(
        event=event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=quantity)],
        buyer=BuyerData(email=email, full_name=name, phone="999 888 777", document_id="43211234"),
        terms_accepted=True,
    )


def _paid_order(event, ticket_type, **kwargs) -> Order:
    order = _order(event, ticket_type, **kwargs)
    mark_paid(order_id=order.id)
    return order


def _void_url(code):
    return f"/api/org/orders/{code}/void/"


def _detail_url(event, code):
    return f"/api/org/events/{event.id}/orders/{code}/"


# ── H07 — ver el detalle de una venta ────────────────────────────────────────


def test_order_detail_shows_buyer_orders_payment_and_each_ticket(
    client_a, published_event, ticket_type
):
    order = _paid_order(published_event, ticket_type, quantity=4)
    order.refresh_from_db()
    order.gateway = "izipay"
    order.gateway_reference = "REF-123"
    order.save(update_fields=["gateway", "gateway_reference", "updated_at"])
    order.tickets.filter(status=Ticket.Status.VALID).update(status=Ticket.Status.CHECKED_IN)

    response = client_a.get(_detail_url(published_event, order.code))

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == order.code
    assert body["status"] == "PAID"
    assert body["buyer_email"] == "lucia@test.pe"
    assert body["buyer_name"] == "Lucía Pérez"
    assert body["buyer_phone"] == "999 888 777"
    assert body["buyer_document"] == "43211234"
    assert body["gateway"] == "izipay"
    assert body["gateway_reference"] == "REF-123"
    assert body["items"][0]["ticket_type_name"] == "General"
    assert body["items"][0]["quantity"] == 4
    assert len(body["tickets"]) == 4
    for ticket in body["tickets"]:
        assert ticket["code"]
        assert ticket["ticket_type_name"] == "General"
        assert ticket["status"] in ("VALID", "CHECKED_IN")
    assert body["tickets_email_sent_at"] is None
    assert body["resends_today"] == 0


def test_order_detail_is_scoped_to_the_event(client_a, organization, ticket_type, published_event):
    other_event = Event.objects.create(
        organization=organization,
        title="Otro evento",
        starts_at=timezone.now() + timedelta(days=5),
        venue_name="Otro local",
        status=Event.Status.PUBLISHED,
    )
    other_tt = TicketType.objects.create(
        event=other_event, name="General", price=Decimal("50.00"), quantity_total=100
    )
    order = _paid_order(other_event, other_tt)
    response = client_a.get(_detail_url(published_event, order.code))
    assert response.status_code == 404


def test_order_detail_unknown_code_is_404(client_a, published_event):
    response = client_a.get(_detail_url(published_event, "TK-NOEXISTE"))
    assert response.status_code == 404


def test_order_detail_is_scoped_to_the_organization(client_b, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type)
    response = client_b.get(_detail_url(published_event, order.code))
    assert response.status_code == 404


# ── H08 — anular una venta ───────────────────────────────────────────────────


def test_void_paid_order_voids_valid_tickets_and_restocks(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=4)
    ticket_type.refresh_from_db()
    sold_before = ticket_type.quantity_sold
    # Dos de las cuatro ya ingresaron: deben permanecer intactas.
    checked = list(order.tickets.all())[:2]
    Ticket.objects.filter(id__in=[t.id for t in checked]).update(status=Ticket.Status.CHECKED_IN)

    response = client_a.post(
        _void_url(order.code),
        {"reason_code": "FRAUD", "reason": "Contracargo del banco", "restock": True},
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tickets_voided"] == 2
    assert body["tickets_checked_in"] == 2
    assert body["restocked"] is True

    order.refresh_from_db()
    assert order.status == "CANCELLED"
    assert order.void_reason_code == "FRAUD"
    assert order.voided_at is not None
    # Las VALID pasaron a VOID; las CHECKED_IN sobreviven.
    assert set(order.tickets.values_list("status", flat=True)) == {"VOID", "CHECKED_IN"}
    # El cupo volvió a la venta.
    ticket_type.refresh_from_db()
    assert ticket_type.quantity_sold == sold_before - 4


def test_void_without_restock_keeps_capacity_consumed(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=2)
    ticket_type.refresh_from_db()
    sold_before = ticket_type.quantity_sold

    response = client_a.post(
        _void_url(order.code), {"reason_code": "OTHER", "restock": False}, format="json"
    )

    assert response.status_code == 200
    order.refresh_from_db()
    assert order.status == "CANCELLED"
    ticket_type.refresh_from_db()
    assert ticket_type.quantity_sold == sold_before


def test_void_pending_order_releases_reservation_immediately(client_a, published_event, ticket_type):
    order = _order(published_event, ticket_type, quantity=3)
    ticket_type.refresh_from_db()
    reserved_before = ticket_type.quantity_reserved

    response = client_a.post(
        _void_url(order.code), {"reason_code": "BUYER_REQUEST", "restock": True}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["tickets_voided"] == 0
    order.refresh_from_db()
    assert order.status == "CANCELLED"
    ticket_type.refresh_from_db()
    assert ticket_type.quantity_reserved == reserved_before - 3
    assert ticket_type.quantity_sold == 0


def test_void_requires_a_reason_code(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type)
    response = client_a.post(_void_url(order.code), {"restock": True}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_void_twice_fails_with_order_not_voidable(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)
    client_a.post(
        _void_url(order.code), {"reason_code": "DUPLICATE", "restock": True}, format="json"
    )
    response = client_a.post(
        _void_url(order.code), {"reason_code": "DUPLICATE", "restock": True}, format="json"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ORDER_NOT_VOIDABLE"


def test_void_failed_order_is_not_voidable(client_a, published_event, ticket_type):
    order = _order(published_event, ticket_type, quantity=1)
    mark_failed(order_id=order.id)
    response = client_a.post(
        _void_url(order.code), {"reason_code": "OTHER", "restock": True}, format="json"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ORDER_NOT_VOIDABLE"


def test_void_is_scoped_to_the_organization(client_b, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)
    response = client_b.post(
        _void_url(order.code), {"reason_code": "OTHER", "restock": True}, format="json"
    )
    assert response.status_code == 404


def test_void_records_audit_with_reason_and_author(client_a, published_event, ticket_type, organizer_user):
    order = _paid_order(published_event, ticket_type, quantity=2)
    client_a.post(
        _void_url(order.code),
        {"reason_code": "ORGANIZER_ERROR", "reason": "Me equivoqué de tipo", "restock": True},
        format="json",
    )
    entry = AuditLog.objects.get(event=published_event, action=AuditLog.Action.ORDER_VOIDED)
    assert entry.target_label == order.code
    assert entry.actor_email == organizer_user.email
    assert entry.reason == "Me equivoqué de tipo"
    assert entry.metadata["reason_code"] == "ORGANIZER_ERROR"
    assert entry.metadata["tickets_voided"] == 2


@pytest.mark.django_db(transaction=True)
@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_void_emails_the_buyer_with_reason_and_contact(
    client_a, published_event, ticket_type, organization
):
    mail.outbox.clear()
    order = _paid_order(published_event, ticket_type, quantity=1)
    client_a.post(
        _void_url(order.code),
        {"reason_code": "FRAUD", "reason": "Tarjeta robada", "restock": True},
        format="json",
    )
    assert any(
        "Se anuló tu compra" in message.subject and order.buyer_email in message.to
        for message in mail.outbox
    )
    email = next(
        message for message in mail.outbox if "Se anuló tu compra" in message.subject
    )
    body = "".join(email.alternatives[0][0]) if email.alternatives else email.body
    assert VOID_REASON_LABELS["FRAUD"] in body
    assert organization.contact_email in body


def test_scanner_rejects_qr_of_a_voided_order(client_a, published_event, ticket_type, organizer_user):
    order = _paid_order(published_event, ticket_type, quantity=1)
    ticket = order.tickets.first()
    client_a.post(
        _void_url(order.code), {"reason_code": "FRAUD", "restock": True}, format="json"
    )

    with pytest.raises(DomainError) as exc:
        check_in(
            qr_payload=sign_ticket_code(ticket.code),
            event_id=published_event.id,
            organization_id=Membership.objects.get(user=organizer_user).organization_id,
            actor=organizer_user,
        )
    assert exc.value.code == "TICKET_INVALID"


# ── H09 — registrar el reembolso ─────────────────────────────────────────────


def _voided_order(client_a, published_event, ticket_type, **kwargs) -> Order:
    order = _paid_order(published_event, ticket_type, **kwargs)
    client_a.post(
        _void_url(order.code), {"reason_code": "DUPLICATE", "restock": True}, format="json"
    )
    order.refresh_from_db()
    return order


def test_mark_refunded_only_from_cancelled(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)
    response = client_a.post(
        f"/api/org/orders/{order.code}/mark-refunded/", {"refund_reference": "Yape 12/03"}, format="json"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ORDER_NOT_VOIDABLE"


def test_mark_refunded_terminates_and_stores_the_reference(
    client_a, published_event, ticket_type
):
    order = _voided_order(client_a, published_event, ticket_type, quantity=2)

    response = client_a.post(
        f"/api/org/orders/{order.code}/mark-refunded/", {"refund_reference": "Yape 12/03"}, format="json"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "REFUNDED"
    assert body["refund_reference"] == "Yape 12/03"
    order.refresh_from_db()
    assert order.status == "REFUNDED"
    assert order.refunded_at is not None

    # Terminal: no admite un segundo reembolso ni reabrir la anulación.
    second = client_a.post(
        f"/api/org/orders/{order.code}/mark-refunded/", {"refund_reference": "Otra"}, format="json"
    )
    assert second.status_code == 409
    void_again = client_a.post(
        _void_url(order.code), {"reason_code": "OTHER", "restock": True}, format="json"
    )
    assert void_again.status_code == 409
    assert void_again.json()["error"]["code"] == "ORDER_NOT_VOIDABLE"


def test_mark_refunded_records_audit(client_a, published_event, ticket_type, organizer_user):
    order = _voided_order(client_a, published_event, ticket_type, quantity=1)
    client_a.post(
        f"/api/org/orders/{order.code}/mark-refunded/", {"refund_reference": "Yape 12/03"}, format="json"
    )
    entry = AuditLog.objects.get(event=published_event, action=AuditLog.Action.ORDER_REFUND_MARKED)
    assert entry.target_label == order.code
    assert entry.actor_email == organizer_user.email
    assert entry.reason == "Yape 12/03"


def test_mark_refunded_is_scoped_to_the_organization(client_b, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)
    response = client_b.post(
        f"/api/org/orders/{order.code}/mark-refunded/", {"refund_reference": "x"}, format="json"
    )
    assert response.status_code == 404


def test_csv_includes_void_and_refund_columns(client_a, published_event, ticket_type):
    order = _voided_order(client_a, published_event, ticket_type, quantity=1)
    client_a.post(
        f"/api/org/orders/{order.code}/mark-refunded/", {"refund_reference": "Yape 12/03"}, format="json"
    )

    response = client_a.get(f"/api/org/events/{published_event.id}/orders.csv")
    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8"))))
    row = next(r for r in rows if r["codigo"] == order.code)
    assert row["motivo_anulacion"] == VOID_REASON_LABELS["DUPLICATE"]
    assert row["anulada_en"]
    assert row["referencia_reembolso"] == "Yape 12/03"


# ── H10 — reenviar entradas ──────────────────────────────────────────────────


def test_resend_requires_a_paid_order(client_a, published_event, ticket_type):
    order = _order(published_event, ticket_type, quantity=1)
    response = client_a.post(f"/api/org/orders/{order.code}/resend-tickets/", {}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_resend_sends_email_and_updates_sent_at(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=2)

    response = client_a.post(f"/api/org/orders/{order.code}/resend-tickets/", {}, format="json")

    assert response.status_code == 200
    body = response.json()
    assert body["sent"] is True
    assert body["sent_at"]
    assert body["resends_today"] == 1
    order.refresh_from_db()
    assert order.tickets_email_sent_at is not None
    assert AuditLog.objects.filter(
        action=AuditLog.Action.TICKETS_RESENT, target_label=order.code
    ).exists()


@pytest.mark.django_db(transaction=True)
@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_resend_reaches_buyer_only_and_keeps_last_sent_date(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)
    assert len(mail.outbox) == 1  # el de confirmación al pagar
    mail.outbox.clear()

    client_a.post(f"/api/org/orders/{order.code}/resend-tickets/", {}, format="json")

    assert len(mail.outbox) == 1
    email = mail.outbox[0]
    assert email.to == [order.buyer_email]
    assert "Tus entradas para" in email.subject
    assert email.attachments  # los QR van adjuntos
    order.refresh_from_db()
    assert order.tickets_email_sent_at is not None


def test_resend_is_limited_to_five_per_order_per_day(client_a, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)

    for _ in range(5):
        response = client_a.post(f"/api/org/orders/{order.code}/resend-tickets/", {}, format="json")
        assert response.status_code == 200

    response = client_a.post(f"/api/org/orders/{order.code}/resend-tickets/", {}, format="json")
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"


def test_resend_is_scoped_to_the_organization(client_b, published_event, ticket_type):
    order = _paid_order(published_event, ticket_type, quantity=1)
    response = client_b.post(f"/api/org/orders/{order.code}/resend-tickets/", {}, format="json")
    assert response.status_code == 404


# ── H11 — encontrar una venta en segundos ────────────────────────────────────


def test_orders_list_searches_by_email_name_and_code(client_a, published_event, ticket_type):
    code_target = _paid_order(published_event, ticket_type, quantity=1, email="ana@test.pe")
    email_target = _paid_order(published_event, ticket_type, quantity=1, email="lucia@test.pe",
                               name="Lucía Pérez")
    _paid_order(published_event, ticket_type, quantity=1, email="pedro@test.pe")

    by_email = client_a.get(f"/api/org/events/{published_event.id}/orders/", {"q": "lucia"})
    codes = [o["code"] for o in by_email.json()["results"]]
    assert codes == [email_target.code]

    by_code = client_a.get(
        f"/api/org/events/{published_event.id}/orders/", {"q": code_target.code[3:6]}
    )
    codes = [o["code"] for o in by_code.json()["results"]]
    assert code_target.code in codes

    by_name = client_a.get(f"/api/org/events/{published_event.id}/orders/", {"q": "Pérez"})
    codes = [o["code"] for o in by_name.json()["results"]]
    assert email_target.code in codes


def test_orders_list_search_is_case_insensitive_partial(client_a, published_event, ticket_type):
    _paid_order(published_event, ticket_type, quantity=1, email="SofiaAndrade@test.pe", name="Sofía")
    response = client_a.get(f"/api/org/events/{published_event.id}/orders/", {"q": "sofi"})
    assert len(response.json()["results"]) == 1


def test_orders_list_combines_status_filter_with_search(client_a, published_event, ticket_type):
    paid = _paid_order(published_event, ticket_type, quantity=1, email="lucia@test.pe")
    pending = _order(published_event, ticket_type, quantity=1, email="lucia@test.pe")

    response = client_a.get(
        f"/api/org/events/{published_event.id}/orders/", {"q": "lucia", "status": "PAID"}
    )
    codes = [o["code"] for o in response.json()["results"]]
    assert codes == [paid.code]
    assert pending.code not in codes


def test_orders_list_accepts_multiple_statuses_separated_by_comma(client_a, published_event, ticket_type):
    paid = _paid_order(published_event, ticket_type, quantity=1)
    pending = _order(published_event, ticket_type, quantity=1)
    _voided_order(client_a, published_event, ticket_type)

    response = client_a.get(
        f"/api/org/events/{published_event.id}/orders/", {"status": "PAID,PENDING"}
    )
    codes = [o["code"] for o in response.json()["results"]]
    assert paid.code in codes
    assert pending.code in codes
    assert len(codes) == 2


def test_orders_list_search_only_sees_own_organization(client_b, published_event, ticket_type):
    _paid_order(published_event, ticket_type, quantity=1, email="lucia@test.pe")
    response = client_b.get(f"/api/org/events/{published_event.id}/orders/", {"q": "lucia"})
    assert response.json()["count"] == 0