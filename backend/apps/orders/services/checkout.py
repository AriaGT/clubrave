"""Crear la orden y retener inventario — la función más crítica del sistema.

Nada aquí confía en el cliente salvo *qué* se quiere comprar y *cuánto*. Los
precios se leen de la base de datos dentro de la transacción (regla A2/A3).
"""

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.common.errors import DomainError
from apps.events.models import Event, TicketType

from ..models import Order, OrderItem
from .codes import generate_order_code


@dataclass
class CartLine:
    ticket_type_id: str
    quantity: int


@dataclass
class BuyerData:
    email: str
    full_name: str
    phone: str = ""
    document_id: str = ""


@transaction.atomic
def create_order(
    *,
    event: Event,
    items: list[CartLine],
    buyer: BuyerData,
    customer=None,
    terms_accepted: bool,
) -> Order:
    if event.status == Event.Status.CANCELLED:
        raise DomainError("EVENT_CANCELLED", "Este evento fue cancelado y la venta está cerrada.")
    if event.status != Event.Status.PUBLISHED:
        raise DomainError("EVENT_NOT_PUBLISHED")
    if event.sales_paused:
        raise DomainError("SALES_PAUSED")
    if not terms_accepted:
        raise DomainError("VALIDATION_ERROR", "Debes aceptar los términos.")
    if not items:
        raise DomainError("VALIDATION_ERROR", "El carrito está vacío.")

    # Bloqueo determinista por id: evita interbloqueos entre compras
    # simultáneas que tocan los mismos tipos de entrada en distinto orden.
    type_ids = sorted({str(line.ticket_type_id) for line in items})
    ticket_types = {
        str(t.id): t
        for t in TicketType.objects.select_for_update()
        .filter(id__in=type_ids, event=event)
        .order_by("id")
    }

    subtotal = Decimal("0.00")
    order_items = []

    for line in items:
        tt = ticket_types.get(str(line.ticket_type_id))
        if tt is None or not tt.is_active:
            raise DomainError("TICKET_INVALID")
        if not tt.sales_open_now():
            raise DomainError("SALES_CLOSED", f"La venta de {tt.name} no está abierta.")
        if line.quantity < 1 or line.quantity > tt.max_per_order:
            raise DomainError(
                "VALIDATION_ERROR", f"Máximo {tt.max_per_order} por compra en {tt.name}."
            )
        if line.quantity > tt.available:
            raise DomainError(
                "SOLD_OUT",
                f"Quedan {tt.available} entradas de {tt.name}.",
                details={"ticket_type_id": str(tt.id), "available": tt.available},
            )

        tt.quantity_reserved = F("quantity_reserved") + line.quantity
        tt.save(update_fields=["quantity_reserved"])  # la CheckConstraint es la red final

        line_subtotal = (tt.price * line.quantity).quantize(Decimal("0.01"))
        subtotal += line_subtotal
        order_items.append(
            OrderItem(
                ticket_type=tt,
                ticket_type_name=tt.name,
                unit_price=tt.price,
                quantity=line.quantity,
                subtotal=line_subtotal,
            )
        )

    order = Order.objects.create(
        code=generate_order_code(),
        event=event,
        customer=customer,
        status=Order.Status.PENDING,
        subtotal=subtotal,
        service_fee=Decimal("0.00"),  # punto de extensión: comisiones
        total=subtotal,
        currency=event.currency,
        buyer_email=buyer.email.lower(),
        buyer_name=buyer.full_name,
        buyer_phone=buyer.phone,
        buyer_document=buyer.document_id,
        expires_at=timezone.now() + timedelta(minutes=settings.ORDER_HOLD_MINUTES),
        terms_accepted_at=timezone.now(),
        terms_version=settings.TERMS_VERSION,
    )
    for item in order_items:
        item.order = order
    OrderItem.objects.bulk_create(order_items)
    return order
