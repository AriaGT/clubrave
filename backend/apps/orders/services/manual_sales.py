"""Venta manual: el organizador vende fuera de la web (WhatsApp, en persona)
y emite las entradas en el acto.

Pasa por el mismo camino que una compra web (`create_order` + `mark_paid`):
el inventario, las entradas y los QR son idénticos. Lo que cambia:
- cobra fuera de la plataforma: se registra cómo (efectivo, Yape…) y el
  monto real, que puede diferir del precio publicado;
- el correo es opcional: sin email, el organizador comparte el QR por el
  medio que quiera (PDF o imagen desde el panel).
"""

from decimal import Decimal

from django.db import transaction

from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.models import AuditLog
from apps.events.models import Event

from ..models import Order
from .checkout import BuyerData, CartLine, create_order
from .fulfillment import mark_paid


@transaction.atomic
def create_manual_sale(
    *,
    event: Event,
    items: list[CartLine],
    buyer: BuyerData,
    payment_method: str,
    payment_reference: str = "",
    total: Decimal | None = None,
    send_email: bool,
    actor,
) -> Order:
    if payment_method not in Order.ManualPaymentMethod.values:
        raise DomainError("VALIDATION_ERROR", "Indica cómo te pagó el cliente.")
    if send_email and not buyer.email:
        raise DomainError("VALIDATION_ERROR", "Para enviar las entradas por correo falta el email.")

    order = create_order(event=event, items=items, buyer=buyer, terms_accepted=True, manual=True)

    if total is not None:
        if total < 0:
            raise DomainError("VALIDATION_ERROR", "El monto cobrado no puede ser negativo.")
        order.total = total.quantize(Decimal("0.01"))
    order.is_manual = True
    order.manual_payment_method = payment_method
    order.sold_by = actor
    order.gateway = "manual"
    order.save(update_fields=["total", "is_manual", "manual_payment_method", "sold_by", "gateway"])

    order = mark_paid(order_id=order.id, gateway_reference=payment_reference, send_email=send_email)

    record(
        actor=actor,
        organization=event.organization,
        action=AuditLog.Action.ORDER_MANUAL_SALE,
        target=order,
        metadata={
            "payment_method": payment_method,
            "total": str(order.total),
            "list_price": str(order.subtotal),
            "tickets": sum(line.quantity for line in items),
            "email_sent": bool(send_email),
        },
    )
    return order
