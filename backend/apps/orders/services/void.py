"""Anular una venta (H08), anular una entrada suelta (H12) y registrar un
reembolso (H09) — Épicas B y C.

- `void_order` pasa una orden `PAID` o `PENDING` a `CANCELLED`: las entradas
  `VALID` se anulan (sus QR dejan de pasar), las `CHECKED_IN` se respetan,
  y si `restock=True` el cupo vendido vuelve al inventario. La retención de
  una orden `PENDING` se libera siempre (D1).
- `void_ticket` anula **una** entrada suelta (`VALID` → `VOID`) sin tocar el
  estado de la orden: de una compra de 6 puede anularse solo la del que no
  va a venir (H12).
- `mark_refunded` anota que el dinero ya se devolvió **fuera de la plataforma**:
  la orden pasa a `REFUNDED`, que es terminal. Nunca toca `total`.
- El comprador de una orden anulada recibe un email con el motivo y el
  contacto de la organización (los emails salen en `on_commit`, jamás dentro
  de la transacción).
"""

from django.db import transaction
from django.db.models import F
from django.template.loader import render_to_string
from django.utils import timezone

from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.mailer import send as send_email
from apps.common.models import AuditLog
from apps.events.models import TicketType

from ..models import Order, Ticket

VOID_REASON_CODES = ["FRAUD", "DUPLICATE", "BUYER_REQUEST", "ORGANIZER_ERROR", "OTHER"]
VOID_REASON_LABELS = {
    "FRAUD": "Fraude / contracargo",
    "DUPLICATE": "Compra duplicada",
    "BUYER_REQUEST": "Pedido del comprador",
    "ORGANIZER_ERROR": "Error del organizador",
    "OTHER": "Otro",
}

VOIDABLE_STATUSES = {Order.Status.PAID, Order.Status.PENDING}


def _release_reservation(order: Order) -> None:
    """Devuelve al inventario la retención de una orden pendiente (D1)."""
    for item in order.items.all():
        TicketType.objects.filter(id=item.ticket_type_id).update(
            quantity_reserved=F("quantity_reserved") - item.quantity
        )


def _restock_sold(order: Order) -> None:
    """Vuelve a poner a la venta las entradas vendidas de la orden.

    Las `CheckConstraint` de `TicketType` (cupo no negativo, vendido dentro de
    lo total) son la red final si algo quedara en un estado inconsistente.
    """
    for item in order.items.all():
        TicketType.objects.filter(id=item.ticket_type_id).update(
            quantity_sold=F("quantity_sold") - item.quantity
        )


def _send_void_email(order: Order, reason_code: str, reason: str) -> None:
    html = render_to_string(
        "orders/order_voided_email.html",
        {
            "order": order,
            "event": order.event,
            "reason_label": VOID_REASON_LABELS.get(reason_code, "Otro"),
            "reason": reason,
            "contact_email": order.event.organization.contact_email,
        },
    )
    send_email(
        to=order.buyer_email,
        subject=f"Se anuló tu compra {order.code}",
        html=html,
        reply_to=order.event.organization.contact_email,
    )


@transaction.atomic
def void_order(
    *,
    order: Order,
    actor,
    reason_code: str = "",
    reason: str = "",
    restock: bool = True,
) -> dict:
    if reason_code not in VOID_REASON_CODES:
        raise DomainError("VALIDATION_ERROR", "Debes elegir un motivo de anulación.")

    order = Order.objects.select_for_update().get(pk=order.pk)

    if order.status not in VOIDABLE_STATUSES:
        raise DomainError("ORDER_NOT_VOIDABLE", "Esta orden no se puede anular.")

    impact: dict = {
        "order_code": order.code,
        "status": Order.Status.CANCELLED,
        "reason_code": reason_code,
        "restock": restock,
    }

    if order.status == Order.Status.PENDING:
        _release_reservation(order)
        impact.update({"tickets_voided": 0, "tickets_checked_in": 0, "reserved_released": True})
    else:
        tickets = list(order.tickets.all())
        checked_in = sum(1 for t in tickets if t.status == Ticket.Status.CHECKED_IN)
        voided = order.tickets.filter(status=Ticket.Status.VALID).update(
            status=Ticket.Status.VOID,
            voided_at=timezone.now(),
            void_reason=reason[:200] or VOID_REASON_LABELS.get(reason_code, ""),
        )
        # Las `CHECKED_IN` no se tocan: ya pasaron por la puerta (H08).
        if restock:
            _restock_sold(order)
        impact.update(
            {
                "tickets_voided": voided,
                "tickets_checked_in": checked_in,
                "restocked": restock,
                "reserved_released": False,
            }
        )

    order.status = Order.Status.CANCELLED
    order.voided_at = timezone.now()
    order.void_reason_code = reason_code
    # Mismo fallback que ya usa `Ticket.void_reason` más arriba: sin esto, una
    # orden anulada sin texto libre queda con `void_reason` vacío y "Mi
    # cuenta" del comprador (que lee este campo, no `void_reason_code`) no
    # muestra ningún motivo (D2/H16).
    order.void_reason = reason[:200] or VOID_REASON_LABELS.get(reason_code, "")
    order.save(
        update_fields=["status", "voided_at", "void_reason_code", "void_reason", "updated_at"]
    )

    record(
        actor=actor,
        organization=order.event.organization,
        action=AuditLog.Action.ORDER_VOIDED,
        target=order,
        reason=reason or VOID_REASON_LABELS.get(reason_code, ""),
        **impact,
    )

    transaction.on_commit(lambda: _send_void_email(order, reason_code, reason))
    return impact


@transaction.atomic
def void_ticket(
    *,
    ticket: Ticket,
    actor,
    reason_code: str = "",
    reason: str = "",
    restock: bool = True,
) -> dict:
    """Anula una entrada suelta (H12) — la orden **no** cambia de estado.

    Solo aplica sobre una entrada `VALID`: una `CHECKED_IN` ya pasó por la
    puerta (la interfaz ofrece H13 en su lugar) y una `VOID` ya está anulada.
    Si `restock`, el cupo vuelve a la venta; el motivo se exige como en H08.
    """
    if reason_code not in VOID_REASON_CODES:
        raise DomainError("VALIDATION_ERROR", "Debes elegir un motivo de anulación.")

    ticket = (
        Ticket.objects.select_for_update()
        .select_related("order__event__organization", "ticket_type")
        .get(pk=ticket.pk)
    )

    if ticket.status != Ticket.Status.VALID:
        raise DomainError("TICKET_NOT_VOIDABLE")

    impact: dict = {
        "order_code": ticket.order.code,
        "ticket_code": ticket.code,
        "status": Ticket.Status.VOID,
        "reason_code": reason_code,
        "restock": restock,
        "restocked": restock,
    }

    ticket.status = Ticket.Status.VOID
    ticket.voided_at = timezone.now()
    ticket.void_reason = reason[:200] or VOID_REASON_LABELS.get(reason_code, "")
    ticket.save(update_fields=["status", "voided_at", "void_reason", "updated_at"])

    if restock:
        TicketType.objects.filter(id=ticket.ticket_type_id).update(
            quantity_sold=F("quantity_sold") - 1
        )

    record(
        actor=actor,
        organization=ticket.order.event.organization,
        action=AuditLog.Action.TICKET_VOIDED,
        target=ticket,
        event=ticket.order.event,
        reason=reason or VOID_REASON_LABELS.get(reason_code, ""),
        **impact,
    )
    return impact


@transaction.atomic
def mark_refunded(*, order: Order, actor, refund_reference: str = "") -> dict:
    """Registra que el dinero ya se devolvió, fuera de la plataforma (H09).

    Solo aplica sobre una orden `CANCELLED` y es terminal: nunca vuelve a
    `CANCELLED` ni admite una segunda devolución.
    """
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status != Order.Status.CANCELLED:
        raise DomainError(
            "ORDER_NOT_VOIDABLE", "Solo una orden anulada se puede registrar como reembolsada."
        )

    order.status = Order.Status.REFUNDED
    order.refund_reference = refund_reference[:120]
    order.refunded_at = timezone.now()
    order.save(update_fields=["status", "refund_reference", "refunded_at", "updated_at"])

    record(
        actor=actor,
        organization=order.event.organization,
        action=AuditLog.Action.ORDER_REFUND_MARKED,
        target=order,
        reason=refund_reference,
        refund_reference=refund_reference,
    )
    return {
        "order_code": order.code,
        "status": order.status,
        "refund_reference": order.refund_reference,
        "refunded_at": order.refunded_at.isoformat(),
    }