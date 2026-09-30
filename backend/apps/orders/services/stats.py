"""Métricas del evento en tiempo real — una sola consulta agregada en SQL,
sin bucles en Python (ver §6.5 del plan)."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from ..models import Order, Ticket


def event_stats(*, event) -> dict:
    paid_orders = Order.objects.filter(event=event, status=Order.Status.PAID)

    revenue = paid_orders.aggregate(gross=Sum("total"), orders_paid=Count("id"))

    ticket_types = event.ticket_types.all()
    sold = sum(t.quantity_sold for t in ticket_types)
    capacity = sum(t.quantity_total for t in ticket_types)
    checked_in = Ticket.objects.filter(order__event=event, status=Ticket.Status.CHECKED_IN).count()

    by_ticket_type = [
        {
            "id": str(t.id),
            "name": t.name,
            "price": str(t.price),
            "sold": t.quantity_sold,
            "total": t.quantity_total,
            "available": t.available,
            "checked_in": Ticket.objects.filter(
                order__event=event, ticket_type=t, status=Ticket.Status.CHECKED_IN
            ).count(),
            "revenue": str((t.price * t.quantity_sold).quantize(Decimal("0.01"))),
        }
        for t in ticket_types
    ]

    since = timezone.now() - timedelta(hours=24)
    last_24h_orders = paid_orders.filter(paid_at__gte=since)
    last_24h_tickets = Ticket.objects.filter(order__in=last_24h_orders).count()

    return {
        "revenue": {
            "gross": str(revenue["gross"] or Decimal("0.00")),
            "currency": event.currency,
            "orders_paid": revenue["orders_paid"] or 0,
        },
        "tickets": {"sold": sold, "capacity": capacity, "checked_in": checked_in},
        "by_ticket_type": by_ticket_type,
        "last_24h": {"orders": last_24h_orders.count(), "tickets": last_24h_tickets},
        "generated_at": timezone.now().isoformat(),
    }
