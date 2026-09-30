from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.events.models import TicketType

from ..models import Order


@transaction.atomic
def release_expired_orders(limit: int = 500) -> int:
    """Devuelve al inventario lo retenido por órdenes vencidas.

    Se ejecuta por scheduler cada 5 minutos y de forma oportunista al
    consultar la disponibilidad de un evento (ver §5.5 del plan).
    """
    expired = list(
        Order.objects.select_for_update(skip_locked=True)
        .filter(status=Order.Status.PENDING, expires_at__lt=timezone.now())[:limit]
    )
    for order in expired:
        for item in order.items.all():
            TicketType.objects.filter(id=item.ticket_type_id).update(
                quantity_reserved=F("quantity_reserved") - item.quantity
            )
        order.status = Order.Status.EXPIRED
        order.save(update_fields=["status", "updated_at"])
    return len(expired)
