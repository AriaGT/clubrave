"""Épica A — Controles del evento en vivo (H01–H06).

Cubre el backend completo de la matriz del plan:
H01 editar un evento publicado (con bitácora), H02 comunicados por email,
H03 gestión de imágenes post-publicación (reordenar, borrar con portada,
última imagen protegida), H04 pausar/reanudar venta, H05 despublicar y
H06 cancelar con confirmación y aviso por email.
"""

import io
from datetime import timedelta

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Membership, Organization, User
from apps.common.models import AuditLog
from apps.events.models import Event, EventImage
from apps.orders.models import Order, Ticket
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.fulfillment import mark_paid

BUYER = BuyerData(email="comprador@test.pe", full_name="Comprador Test")


def _org_token(user: User, organization_id) -> str:
    refresh = RefreshToken.for_user(user)
    refresh["scope"] = "org"
    refresh["organization_id"] = str(organization_id)
    access = refresh.access_token
    access["scope"] = "org"
    access["organization_id"] = str(organization_id)
    return str(access)


@pytest.fixture
def client_a(organizer_user, organization):
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
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_org_token(org_b_user, org_b.id)}")
    return client


def _paid_order(event, ticket_type, email: str = "comprador@test.pe", quantity: int = 1) -> Order:
    order = create_order(
        event=event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=quantity)],
        buyer=BuyerData(email=email, full_name="Comprador Test"),
        terms_accepted=True,
    )
    mark_paid(order_id=order.id)
    return order


def _add_image(event, position: int, alt: str = "Foto") -> EventImage:
    return EventImage.objects.create(
        event=event, image="events/test.jpg", alt=alt, position=position
    )


# ── H01 — editar un evento publicado ──────────────────────────────────────────


def test_edit_published_event_updates_fields_and_keeps_the_slug(client_a, published_event):
    response = client_a.patch(
        f"/api/org/events/{published_event.id}/",
        {"title": "Nuevo título expuesto", "venue_name": "Otro local"},
        format="json",
    )
    assert response.status_code == 200
    published_event.refresh_from_db()
    assert published_event.title == "Nuevo título expuesto"
    assert published_event.venue_name == "Otro local"
    # El slug es read_only: editar el título nunca rompe el enlace público.
    assert response.json()["slug"] == published_event.slug


def test_edit_published_event_rejects_a_past_start_date(client_a, published_event):
    response = client_a.patch(
        f"/api/org/events/{published_event.id}/",
        {"starts_at": (timezone.now() - timedelta(days=1)).isoformat()},
        format="json",
    )
    assert response.status_code == 400
    published_event.refresh_from_db()
    assert published_event.starts_at > timezone.now()


def test_edit_records_audit_entry_with_the_changed_fields(client_a, published_event):
    client_a.patch(
        f"/api/org/events/{published_event.id}/", {"title": "Renombrado"}, format="json"
    )
    entry = AuditLog.objects.get(event=published_event, action=AuditLog.Action.EVENT_UPDATED)
    assert "title" in entry.metadata["fields"]
    assert entry.metadata["fields"]["title"]["new"] == "Renombrado"


def test_edit_cancelled_event_is_rejected(client_a, published_event):
    response = client_a.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {
            "reason_code": "OTHER",
            "reason": "Decisión del organizador",
            "confirm_title": published_event.title,
        },
        format="json",
    )
    assert response.status_code == 200

    response = client_a.patch(
        f"/api/org/events/{published_event.id}/", {"title": "Otra cosa"}, format="json"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EVENT_CANCELLED"


def test_change_impact_is_zero_when_there_are_no_sales(client_a, published_event):
    response = client_a.get(f"/api/org/events/{published_event.id}/change-impact/")
    assert response.json() == {"paid_orders": 0, "distinct_buyers": 0}


def test_change_impact_counts_paid_orders_and_unique_buyers(client_a, published_event, ticket_type):
    _paid_order(published_event, ticket_type, email="a@test.pe")
    _paid_order(published_event, ticket_type, email="a@test.pe")
    _paid_order(published_event, ticket_type, email="b@test.pe")

    response = client_a.get(f"/api/org/events/{published_event.id}/change-impact/")
    body = response.json()
    assert body["paid_orders"] == 3
    assert body["distinct_buyers"] == 2


# ── H02 — comunicados a compradores ──────────────────────────────────────────


def test_announce_reaches_each_paid_buyer_once(client_a, published_event, ticket_type):
    _paid_order(published_event, ticket_type, email="a@test.pe")
    _paid_order(published_event, ticket_type, email="a@test.pe")  # duplicado ignorado
    _paid_order(published_event, ticket_type, email="b@test.pe")

    response = client_a.post(
        f"/api/org/events/{published_event.id}/announce/",
        {"subject": "Cambio de puerta", "message": "Entra por la puerta 3 a partir de las 18:00."},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["recipients"] == 2
    entry = AuditLog.objects.get(event=published_event, action=AuditLog.Action.EVENT_ANNOUNCED)
    assert entry.metadata["recipients"] == 2
    assert entry.metadata["subject"] == "Cambio de puerta"


def test_announce_ignores_pending_cancelled_and_expired_orders(client_a, published_event, ticket_type):
    _paid_order(published_event, ticket_type, email="paga@test.pe")

    pending = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BUYER,
        terms_accepted=True,
    )
    cancelled = _paid_order(published_event, ticket_type, email="cancelada@test.pe")
    cancelled.status = Order.Status.CANCELLED
    cancelled.save(update_fields=["status"])

    assert pending.status == Order.Status.PENDING

    response = client_a.post(
        f"/api/org/events/{published_event.id}/announce/",
        {"subject": "Aviso", "message": "Mensaje."},
        format="json",
    )
    assert response.json()["recipients"] == 1


def test_announce_without_paid_buyers_is_rejected(client_a, published_event):
    response = client_a.post(
        f"/api/org/events/{published_event.id}/announce/",
        {"subject": "Aviso", "message": "Mensaje."},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_announce_limits_to_three_messages_per_day(client_a, published_event, ticket_type):
    _paid_order(published_event, ticket_type, email="a@test.pe")
    for i in range(3):
        response = client_a.post(
            f"/api/org/events/{published_event.id}/announce/",
            {"subject": f"Aviso {i}", "message": f"Mensaje {i}."},
            format="json",
        )
        assert response.status_code == 200

    response = client_a.post(
        f"/api/org/events/{published_event.id}/announce/",
        {"subject": "Cuarto", "message": "Ya no debe pasar."},
        format="json",
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"


@pytest.mark.django_db(transaction=True)
@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_announce_email_uses_event_title_and_contact_email(
    client_a, published_event, ticket_type, organization
):
    mail.outbox.clear()
    _paid_order(published_event, ticket_type, email="destinatario@test.pe")

    client_a.post(
        f"/api/org/events/{published_event.id}/announce/",
        {"subject": "Cambio de puerta", "message": "Entra por la puerta 3."},
        format="json",
    )

    sent = [m for m in mail.outbox if m.subject.startswith(f"{published_event.title}: ")]
    assert len(sent) == 1
    email = sent[0]
    assert email.subject == f"{published_event.title}: Cambio de puerta"
    assert email.to == ["destinatario@test.pe"]
    assert email.reply_to == [organization.contact_email]
    assert "puerta 3" in email.body


def test_announce_on_cancelled_event_is_rejected(client_a, published_event, ticket_type):
    _paid_order(published_event, ticket_type)
    client_a.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {"reason_code": "OTHER", "reason": "X", "confirm_title": published_event.title},
        format="json",
    )
    response = client_a.post(
        f"/api/org/events/{published_event.id}/announce/",
        {"subject": "Aviso", "message": "Mensaje."},
        format="json",
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EVENT_CANCELLED"


# ── H03 — gestión de imágenes post-publicación ───────────────────────────────


def test_upload_extra_image_keeps_existing_cover(client_a, published_event):
    cover = published_event.images.get()
    payload = {
        "alt": "Nueva foto",
        "image": _valid_image_upload(),
    }
    response = client_a.post(
        f"/api/org/events/{published_event.id}/images/", payload, format="multipart"
    )
    assert response.status_code == 201
    assert response.json()["is_cover"] is False

    cover.refresh_from_db()
    assert cover.is_cover is True


def test_reorder_persists_the_new_position(client_a, published_event):
    cover = EventImage.objects.get(event=published_event, position=0)
    second = _add_image(published_event, position=1, alt="Segunda")
    third = _add_image(published_event, position=2, alt="Tercera")

    response = client_a.post(
        f"/api/org/events/{published_event.id}/images/reorder/",
        {"order": [str(third.id), str(second.id), str(cover.id)]},
        format="json",
    )
    assert response.status_code == 200
    ordered = [img["id"] for img in response.json()]
    assert ordered == [str(third.id), str(second.id), str(cover.id)]


def test_reorder_rejects_an_incomplete_or_foreign_id_set(client_a, published_event):
    image = _add_image(published_event, position=1)
    foreign = image.id
    response = client_a.post(
        f"/api/org/events/{published_event.id}/images/reorder/",
        {"order": [str(foreign), "unknown-uuid-not-here"]},
        format="json",
    )
    assert response.status_code == 400


def test_last_image_of_a_published_event_cannot_be_deleted(client_a, published_event):
    image = published_event.images.get()
    response = client_a.delete(f"/api/org/events/{published_event.id}/images/{image.id}/")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LAST_IMAGE"
    assert EventImage.objects.filter(id=image.id).exists()


def test_deleting_other_images_works_and_cover_promotes(client_a, published_event):
    cover = published_event.images.get()
    cover.is_cover = True
    cover.save(update_fields=["is_cover"])
    second = _add_image(published_event, position=1, alt="Segunda")

    response = client_a.delete(f"/api/org/events/{published_event.id}/images/{cover.id}/")
    assert response.status_code == 204

    second.refresh_from_db()
    assert second.is_cover is True


def test_images_of_cancelled_event_are_read_only(client_a, published_event):
    image = published_event.images.get()
    client_a.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {"reason_code": "OTHER", "reason": "X", "confirm_title": published_event.title},
        format="json",
    )

    response = client_a.delete(f"/api/org/events/{published_event.id}/images/{image.id}/")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EVENT_CANCELLED"

    response = client_a.post(
        f"/api/org/events/{published_event.id}/images/",
        {"alt": "x", "image": _valid_image_upload()},
        format="multipart",
    )
    assert response.status_code == 409


# ── H04 — pausar / reanudar la venta ─────────────────────────────────────────


def test_paused_event_blocks_new_checkout(client_a, published_event, ticket_type):
    response = client_a.post(
        f"/api/org/events/{published_event.id}/pause-sales/", {"paused": True}, format="json"
    )
    assert response.status_code == 200
    published_event.refresh_from_db()
    assert published_event.sales_paused_at is not None

    with pytest.raises(Exception) as exc:
        create_order(
            event=published_event,
            items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
            buyer=BUYER,
            terms_accepted=True,
        )
    assert exc.value.code == "SALES_PAUSED"


def test_pause_flag_is_exposed_in_public_detail(client_a, published_event):
    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": True}, format="json")
    detail = client_a.get(f"/api/org/events/{published_event.id}/").json()
    assert detail["sales_paused"] is True

    public = client_a.get(f"/api/events/{published_event.slug}/")
    assert public.status_code == 200
    assert public.json()["sales_paused"] is True

    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": False}, format="json")
    assert client_a.get(f"/api/events/{published_event.slug}/").json()["sales_paused"] is False


def test_pending_order_can_finish_paying_while_paused(client_a, published_event, ticket_type):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BUYER,
        terms_accepted=True,
    )
    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": True}, format="json")

    mark_paid(order_id=order.id)

    order.refresh_from_db()
    assert order.status == Order.Status.PAID
    assert order.tickets.count() == 1


def test_resume_sales_reenables_checkout(client_a, published_event, ticket_type):
    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": True}, format="json")
    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": False}, format="json")
    published_event.refresh_from_db()
    assert published_event.sales_paused_at is None

    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BUYER,
        terms_accepted=True,
    )
    assert order.status == Order.Status.PENDING


def test_pause_requires_a_published_event(client_a, published_event):
    published_event.status = Event.Status.DRAFT
    published_event.save(update_fields=["status"])
    response = client_a.post(
        f"/api/org/events/{published_event.id}/pause-sales/", {"paused": True}, format="json"
    )
    assert response.status_code == 400


def test_pause_is_idempotent_and_records_each_transition_once(client_a, published_event):
    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": True}, format="json")
    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": True}, format="json")
    published_event.refresh_from_db()
    assert published_event.sales_paused_at is not None
    assert AuditLog.objects.filter(
        event=published_event, action=AuditLog.Action.EVENT_SALES_PAUSED
    ).count() == 1

    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": False}, format="json")
    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": False}, format="json")
    published_event.refresh_from_db()
    assert published_event.sales_paused_at is None
    assert AuditLog.objects.filter(
        event=published_event, action=AuditLog.Action.EVENT_SALES_RESUMED
    ).count() == 1


# ── H05 — despublicar ─────────────────────────────────────────────────────────


def test_unpublish_is_rejected_when_the_event_has_paid_orders(client_a, published_event, ticket_type):
    _paid_order(published_event, ticket_type)
    response = client_a.post(f"/api/org/events/{published_event.id}/unpublish/")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EVENT_HAS_SALES"
    published_event.refresh_from_db()
    assert published_event.status == Event.Status.PUBLISHED


def test_unpublish_without_sales_succeeds_and_hides_the_event(client_a, published_event):
    response = client_a.post(f"/api/org/events/{published_event.id}/unpublish/")
    assert response.status_code == 200
    published_event.refresh_from_db()
    assert published_event.status == Event.Status.DRAFT

    public = client_a.get(f"/api/events/{published_event.slug}/")
    assert public.status_code == 404


def test_unpublish_ignores_pending_orders(client_a, published_event, ticket_type):
    create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BUYER,
        terms_accepted=True,
    )
    response = client_a.post(f"/api/org/events/{published_event.id}/unpublish/")
    assert response.status_code == 200


def test_republish_rechecks_the_requirements(client_a, published_event, ticket_type):
    published_event.venue_name = ""
    published_event.save(update_fields=["venue_name"])
    client_a.post(f"/api/org/events/{published_event.id}/unpublish/")

    response = client_a.post(f"/api/org/events/{published_event.id}/publish/")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    published_event.venue_name = "Local de nuevo"
    published_event.save(update_fields=["venue_name"])
    response = client_a.post(f"/api/org/events/{published_event.id}/publish/")
    assert response.status_code == 200
    assert response.json()["status"] == "PUBLISHED"


def test_unpublish_records_audit_entry(client_a, published_event):
    client_a.post(f"/api/org/events/{published_event.id}/unpublish/")
    assert AuditLog.objects.filter(
        event=published_event, action=AuditLog.Action.EVENT_UNPUBLISHED
    ).exists()


# ── H06 — cancelar evento ─────────────────────────────────────────────────────


def test_cancel_preview_reports_exact_impact(client_a, published_event, ticket_type):
    _paid_order(published_event, ticket_type, email="a@test.pe")
    _paid_order(published_event, ticket_type, email="b@test.pe", quantity=2)
    ticket = Ticket.objects.filter(order__event=published_event).first()
    ticket.status = Ticket.Status.CHECKED_IN
    ticket.save(update_fields=["status"])

    response = client_a.get(f"/api/org/events/{published_event.id}/cancel-preview/")
    body = response.json()
    assert body == {
        "paid_orders": 2,
        "distinct_buyers": 2,
        "tickets_to_void": 3,
        "tickets_already_checked_in": 1,
        "gross": "150.00",
        "currency": "PEN",
    }


def test_cancel_requires_matching_confirm_title(client_a, published_event):
    response = client_a.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {"reason_code": "OTHER", "reason": "X", "confirm_title": "Título incorrecto"},
        format="json",
    )
    assert response.status_code == 400
    published_event.refresh_from_db()
    assert published_event.status == Event.Status.PUBLISHED


def test_cancel_requires_a_valid_reason_code(client_a, published_event):
    response = client_a.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {"reason_code": "", "confirm_title": published_event.title},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db(transaction=True)
@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_cancel_voids_orders_tickets_and_emails_the_buyer(
    client_a, published_event, ticket_type, organization
):
    mail.outbox.clear()
    _paid_order(published_event, ticket_type, email="afectado@test.pe")

    response = client_a.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {
            "reason_code": "ARTIST_CANCELLED",
            "reason": "El artista suspendió la gira",
            "confirm_title": published_event.title,
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["paid_orders"] == 1

    published_event.refresh_from_db()
    assert published_event.status == Event.Status.CANCELLED
    assert published_event.cancelled_at is not None
    assert published_event.cancellation_reason_code == "ARTIST_CANCELLED"
    assert published_event.cancellation_reason == "El artista suspendió la gira"

    order = Order.objects.get(event=published_event)
    assert order.status == Order.Status.CANCELLED
    assert order.tickets.filter(status=Ticket.Status.VOID).count() == 1

    # D2/H16 — el motivo se denormaliza en la orden y en cada entrada, igual
    # que hace `void_order` para H08: sin esto, "Mi cuenta" y el CSV no tienen
    # de dónde leer por qué se anuló, aunque el evento sí guarde el motivo.
    assert order.void_reason == "El artista suspendió la gira"
    assert order.voided_at is not None
    ticket = order.tickets.get()
    assert ticket.void_reason == "El artista suspendió la gira"
    assert ticket.voided_at is not None

    assert len([m for m in mail.outbox if m.subject == f"{published_event.title} fue cancelado"]) == 1
    email = [m for m in mail.outbox if m.subject == f"{published_event.title} fue cancelado"][0]
    assert email.to == ["afectado@test.pe"]
    assert email.reply_to == [organization.contact_email]
    assert "El artista suspendió la gira" in email.body


@pytest.mark.django_db(transaction=True)
@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_cancel_releases_pending_inventory_and_marks_pending_orders_cancelled(
    client_a, published_event, ticket_type
):
    pending = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=3)],
        buyer=BUYER,
        terms_accepted=True,
    )
    ticket_type.refresh_from_db()
    assert ticket_type.quantity_reserved == 3

    client_a.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {"reason_code": "VENUE_ISSUE", "confirm_title": published_event.title},
        format="json",
    )
    pending.refresh_from_db()
    ticket_type.refresh_from_db()
    assert pending.status == Order.Status.CANCELLED
    assert ticket_type.quantity_reserved == 0
    # Sin texto libre, el motivo denormalizado cae en la etiqueta del código.
    assert pending.void_reason == "Problema con el local"


@pytest.mark.django_db(transaction=True)
@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_cancel_twice_is_rejected_and_never_sends_a_second_email(
    client_a, published_event, ticket_type
):
    mail.outbox.clear()
    _paid_order(published_event, ticket_type)
    payload = {
        "reason_code": "OTHER",
        "reason": "X",
        "confirm_title": published_event.title,
    }
    assert client_a.post(
        f"/api/org/events/{published_event.id}/cancel/", payload, format="json"
    ).status_code == 200

    response = client_a.post(
        f"/api/org/events/{published_event.id}/cancel/", payload, format="json"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EVENT_CANCELLED"
    cancelled_emails = [m for m in mail.outbox if m.subject == f"{published_event.title} fue cancelado"]
    assert len(cancelled_emails) == 1


def test_cancelled_event_blocks_checkout(published_event, ticket_type):
    from apps.orders.services.cancellation import cancel_event

    cancel_event(event=published_event, actor=None, reason_code="OTHER", confirm_title=published_event.title)
    published_event.refresh_from_db()
    with pytest.raises(Exception) as exc:
        create_order(
            event=published_event,
            items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
            buyer=BUYER,
            terms_accepted=True,
        )
    assert exc.value.code == "EVENT_CANCELLED"


def test_cancelled_event_cannot_be_published_again(client_a, published_event):
    client_a.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {"reason_code": "OTHER", "confirm_title": published_event.title},
        format="json",
    )
    response = client_a.post(f"/api/org/events/{published_event.id}/publish/")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EVENT_CANCELLED"


def test_cancel_records_audit_with_impact(client_a, published_event, ticket_type):
    _paid_order(published_event, ticket_type)
    client_a.post(
        f"/api/org/events/{published_event.id}/cancel/",
        {"reason_code": "WEATHER", "confirm_title": published_event.title},
        format="json",
    )
    entry = AuditLog.objects.get(event=published_event, action=AuditLog.Action.EVENT_CANCELLED)
    assert entry.metadata["paid_orders"] == 1
    assert entry.reason  # motivo guardado en la bitácora


# ── Bitácora ──────────────────────────────────────────────────────────────────


def test_org_audit_endpoint_lists_only_own_entries(client_a, published_event):
    client_a.post(f"/api/org/events/{published_event.id}/unpublish/")
    response = client_a.get("/api/org/audit/")
    actions = [r["action"] for r in response.json()["results"]]
    assert AuditLog.Action.EVENT_UNPUBLISHED in actions
    assert all(r["event"] == str(published_event.id) for r in response.json()["results"])


def test_event_audit_action_lists_the_event_timeline(client_a, published_event):
    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": True}, format="json")
    client_a.post(f"/api/org/events/{published_event.id}/pause-sales/", {"paused": False}, format="json")

    response = client_a.get(f"/api/org/events/{published_event.id}/audit/")
    actions = [r["action"] for r in response.json()["results"]]
    assert set(actions) == {
        AuditLog.Action.EVENT_SALES_PAUSED,
        AuditLog.Action.EVENT_SALES_RESUMED,
    }


# ── Aislamiento entre organizaciones ── ──────────────────────────────────────


def test_org_b_cannot_run_any_epica_a_control_on_org_a_event(
    client_b, published_event, ticket_type
):
    event_url = f"/api/org/events/{published_event.id}"
    actions = [
        ("get", f"{event_url}/change-impact/", {}),
        ("get", f"{event_url}/cancel-preview/", {}),
        ("post", f"{event_url}/cancel/", {"reason_code": "OTHER", "confirm_title": published_event.title}),
        ("post", f"{event_url}/pause-sales/", {"paused": True}),
        ("post", f"{event_url}/announce/", {"subject": "X", "message": "Y"}),
        ("post", f"{event_url}/unpublish/", {}),
        ("post", f"{event_url}/publish/", {}),
        ("get", f"{event_url}/audit/", {}),
    ]
    for method, url, payload in actions:
        response = getattr(client_b, method)(url, **({"data": payload, "format": "json"} if payload else {}))
        assert response.status_code == 404, f"{method.upper()} {url} -> {response.status_code}"

    image = published_event.images.get()
    response = client_b.post(
        f"/api/org/events/{published_event.id}/images/reorder/",
        {"order": [str(image.id)]},
        format="json",
    )
    assert response.status_code == 404
    published_event.refresh_from_db()
    assert published_event.status == Event.Status.PUBLISHED


def _valid_image_upload():
    image = Image.new("RGB", (1000, 800), (10, 20, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    buffer.seek(0)
    return SimpleUploadedFile("photo.jpg", buffer.read(), content_type="image/jpeg")