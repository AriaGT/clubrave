"""Cancelar un evento: órdenes a CANCELLED, entradas a VOID, aviso por email.

Reescrito para la Épica A (H06):
- `preview_event_cancellation` calcula el impacto en el servidor sin tocar nada.
- `cancel_event` exige `reason_code` + `confirm_title`, es **idempotente** (D7),
  libera la retención de las órdenes `PENDING` (D1), registra en la bitácora y
  avisa a cada comprador con el motivo y el `contact_email` de la organización
  (D7). Los emails salen en `transaction.on_commit`, nunca dentro de ella.
"""

from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.template.loader import render_to_string
from django.utils import timezone

from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.mailer import send as send_email
from apps.common.models import AuditLog
from apps.events.models import Event, TicketType

from ..models import Order, Ticket

CANCELLATION_REASON_CODES = ["VENUE_ISSUE", "CAPACITY", "ARTIST_CANCELLED", "WEATHER", "OTHER"]
CANCELLATION_REASON_LABELS = {
    "VENUE_ISSUE": "Problema con el local",
    "CAPACITY": "Aforo insuficiente",
    "ARTIST_CANCELLED": "Cancelación del artista",
    "WEATHER": "Clima",
    "OTHER": "Otro",
}


def preview_event_cancellation(*, event: Event) -> dict:
    """Impacto exacto de cancelar `event`: una consulta agregada, sin bucles."""
    paid = Order.objects.filter(event=event, status=Order.Status.PAID)
    paid_ids = list(paid.values_list("id", flat=True))
    gross = paid.aggregate(total=Sum("total"))["total"] or Decimal("0.00")
    if isinstance(gross, float):  # sqlite devuelve float para SUM en DecimalField
        gross = Decimal(str(gross))
    gross = gross.quantize(Decimal("0.01"))
    return {
        "paid_orders": len(paid_ids),
        "distinct_buyers": paid.values("buyer_email").distinct().count(),
        "tickets_to_void": Ticket.objects.filter(order_id__in=paid_ids).count(),
        "tickets_already_checked_in": Ticket.objects.filter(
            order_id__in=paid_ids, status=Ticket.Status.CHECKED_IN
        ).count(),
        "gross": str(gross),
        "currency": event.currency,
    }


def _send_cancellation_email(order: Order, event: Event) -> None:
    html = render_to_string(
        "orders/event_cancelled_email.html",
        {
            "order": order,
            "event": event,
            "reason_label": CANCELLATION_REASON_LABELS.get(event.cancellation_reason_code, "Otro"),
            "reason": event.cancellation_reason,
            "contact_email": event.organization.contact_email,
        },
    )
    send_email(
        to=order.buyer_email,
        subject=f"{event.title} fue cancelado",
        html=html,
        reply_to=event.organization.contact_email,
    )


def _send_cancellation_emails(orders: list[Order], event: Event) -> None:
    for order in orders:
        _send_cancellation_email(order, event)


@transaction.atomic
def cancel_event(
    *,
    event: Event,
    actor=None,
    reason_code: str = "",
    reason: str = "",
    confirm_title: str = "",
) -> dict:
    if reason_code not in CANCELLATION_REASON_CODES:
        raise DomainError("VALIDATION_ERROR", "Debes elegir un motivo de cancelación.")
    if confirm_title != event.title:
        raise DomainError("VALIDATION_ERROR", "El título escrito no coincide con el del evento.")

    # Idempotente: cancelar dos veces falla y jamás reenvía emails (D7).
    if event.status == Event.Status.CANCELLED:
        raise DomainError("EVENT_CANCELLED", "Este evento ya fue cancelado.")

    impact = preview_event_cancellation(event=event)

    event = Event.objects.select_for_update().get(pk=event.pk)
    event.status = Event.Status.CANCELLED
    event.cancelled_at = timezone.now()
    if reason_code:
        event.cancellation_reason_code = reason_code
    if reason:
        event.cancellation_reason = reason
    event.save(
        update_fields=[
            "status", "cancelled_at", "cancellation_reason_code",
            "cancellation_reason", "updated_at",
        ]
    )

    # El motivo se denormaliza en la orden y en cada entrada (igual que hace
    # `void_order` para H08): sin esto, el comprador abre "Mi cuenta" y no ve
    # por qué su entrada quedó anulada (D2/H16) — el motivo vive en `Event`,
    # pero esas dos vistas leen `Order.void_reason` y `Ticket.void_reason`.
    reason_label = reason.strip() or CANCELLATION_REASON_LABELS.get(reason_code, "")
    now = timezone.now()

    paid_orders = list(Order.objects.select_for_update().filter(event=event, status=Order.Status.PAID))
    for order in paid_orders:
        Ticket.objects.filter(order=order).update(
            status=Ticket.Status.VOID, voided_at=now, void_reason=reason_label
        )
        order.status = Order.Status.CANCELLED
        order.voided_at = now
        order.void_reason = reason_label
        order.save(update_fields=["status", "voided_at", "void_reason", "updated_at"])

    # D1 — las órdenes PENDING devuelven su retención de inventario, igual
    # que hace `release_expired_orders`: nunca queda `quantity_reserved` inflado.
    pending_orders = list(
        Order.objects.select_for_update().filter(event=event, status=Order.Status.PENDING)
    )
    for order in pending_orders:
        for item in order.items.all():
            TicketType.objects.filter(id=item.ticket_type_id).update(
                quantity_reserved=F("quantity_reserved") - item.quantity
            )
        order.status = Order.Status.CANCELLED
        order.voided_at = now
        order.void_reason = reason_label
        order.save(update_fields=["status", "voided_at", "void_reason", "updated_at"])

    # Los códigos de invitado sin usar también liberan su retención (D1).
    from .guest_codes import void_available_codes_for_event

    impact["guest_codes_voided"] = void_available_codes_for_event(event=event)

    record(
        actor=actor,
        organization=event.organization,
        action=AuditLog.Action.EVENT_CANCELLED,
        target=event,
        reason=reason or CANCELLATION_REASON_LABELS.get(reason_code, ""),
        **impact,
    )

    transaction.on_commit(lambda: _send_cancellation_emails(paid_orders, event))
    return impact