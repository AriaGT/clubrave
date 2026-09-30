"""Confirmar el pago y emitir las entradas — idempotente por diseño.

Se llama tanto desde el retorno del navegador como desde el IPN de la
pasarela; cualquiera de los dos que llegue primero emite las entradas, el
segundo no hace nada (regla de negocio §7.3 del plan).
"""

from uuid import UUID

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.common.errors import DomainError
from apps.events.models import TicketType

from ..models import Order, Ticket
from .codes import generate_ticket_code


def _ensure_capacity_or_fail(order: Order) -> None:
    """El pago llegó justo después del vencimiento: se acepta solo si
    todavía hay cupo; si no, se marca FAILED para gestionar el reembolso.

    La retención de esta orden pudo liberarse ya por `release_expired_orders`,
    así que se valida directamente contra el aforo total vendido."""
    for item in order.items.select_related("ticket_type"):
        tt = TicketType.objects.select_for_update().get(id=item.ticket_type_id)
        if tt.available < 0 or (tt.quantity_sold + item.quantity) > tt.quantity_total:
            order.status = Order.Status.FAILED
            order.save(update_fields=["status", "updated_at"])
            raise DomainError(
                "SOLD_OUT",
                "El cupo se agotó mientras se confirmaba el pago. Se gestionará un reembolso.",
            )


@transaction.atomic
def mark_paid(*, order_id: UUID, gateway_reference: str | None = None) -> Order:
    order = Order.objects.select_for_update().get(id=order_id)

    if order.status == Order.Status.PAID:
        return order  # idempotencia: navegador + IPN

    if order.status != Order.Status.PENDING:
        raise DomainError("ORDER_EXPIRED")

    if order.expires_at < timezone.now():
        _ensure_capacity_or_fail(order)

    tickets = []
    for item in order.items.select_related("ticket_type"):
        tt = TicketType.objects.select_for_update().get(id=item.ticket_type_id)
        tt.quantity_reserved = F("quantity_reserved") - item.quantity
        tt.quantity_sold = F("quantity_sold") + item.quantity
        tt.save(update_fields=["quantity_reserved", "quantity_sold"])

        tickets += [
            Ticket(
                order=order,
                ticket_type_id=item.ticket_type_id,
                code=generate_ticket_code(),
                holder_name=order.buyer_name,
            )
            for _ in range(item.quantity)
        ]

    Ticket.objects.bulk_create(tickets)  # `code` es UNIQUE: colisión = error, no duplicado

    order.status = Order.Status.PAID
    order.paid_at = timezone.now()
    order.gateway_reference = gateway_reference or order.gateway_reference
    order.save(update_fields=["status", "paid_at", "gateway_reference", "updated_at"])

    transaction.on_commit(lambda: _send_tickets_email_safely(order.id))
    return order


def _send_tickets_email_safely(order_id: UUID) -> None:
    from .tickets_email import send_tickets_email

    send_tickets_email(order_id)


@transaction.atomic
def mark_failed(*, order_id: UUID) -> Order:
    order = Order.objects.select_for_update().get(id=order_id)
    if order.status == Order.Status.PAID:
        return order
    if not order.can_transition_to(Order.Status.FAILED):
        raise DomainError("ORDER_EXPIRED")

    for item in order.items.all():
        TicketType.objects.filter(id=item.ticket_type_id).update(
            quantity_reserved=F("quantity_reserved") - item.quantity
        )
    order.status = Order.Status.FAILED
    order.save(update_fields=["status", "updated_at"])
    return order
