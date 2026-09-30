"""Métricas del evento en tiempo real — una sola consulta agregada en SQL,
sin bucles en Python (ver §6.5 del plan).

Invitados: las órdenes de cortesía (`Order.is_guest`) ocupan cupo y cuentan
como emitidas (`guests`), pero nunca como vendidas ni como ingresos."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from ..models import GuestCode, Order, Ticket


def event_stats(*, event) -> dict:
    paid_orders = Order.objects.filter(event=event, status=Order.Status.PAID, is_guest=False)

    revenue = paid_orders.aggregate(gross=Sum("total"), orders_paid=Count("id"))

    # Entradas de invitado vigentes por tipo: están dentro de `quantity_sold`
    # (ocupan cupo) y se restan para no inflar ventas ni ingresos.
    guests_by_type = dict(
        Ticket.objects.filter(
            order__event=event, order__is_guest=True, order__status=Order.Status.PAID
        )
        .exclude(status=Ticket.Status.VOID)
        .order_by()
        .values_list("ticket_type_id")
        .annotate(n=Count("id"))
    )
    guest_codes = dict(
        GuestCode.objects.filter(event=event).order_by().values_list("status").annotate(n=Count("id"))
    )

    ticket_types = event.ticket_types.all()
    guests = sum(guests_by_type.values())
    sold = sum(t.quantity_sold for t in ticket_types) - guests
    capacity = sum(t.quantity_total for t in ticket_types)
    checked_in = Ticket.objects.filter(order__event=event, status=Ticket.Status.CHECKED_IN).count()

    by_ticket_type = [
        {
            "id": str(t.id),
            "name": t.name,
            "price": str(t.price),
            "sold": max(t.quantity_sold - guests_by_type.get(t.id, 0), 0),
            "guests": guests_by_type.get(t.id, 0),
            "total": t.quantity_total,
            "available": t.available,
            "checked_in": Ticket.objects.filter(
                order__event=event, ticket_type=t, status=Ticket.Status.CHECKED_IN
            ).count(),
            "revenue": str(
                (t.price * max(t.quantity_sold - guests_by_type.get(t.id, 0), 0)).quantize(
                    Decimal("0.01")
                )
            ),
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
        "tickets": {
            "sold": max(sold, 0),
            "guests": guests,
            "capacity": capacity,
            "checked_in": checked_in,
        },
        "guest_codes": {
            "total": sum(guest_codes.values()),
            "available": guest_codes.get(GuestCode.Status.AVAILABLE, 0),
            "redeemed": guest_codes.get(GuestCode.Status.REDEEMED, 0),
            "voided": guest_codes.get(GuestCode.Status.VOIDED, 0),
        },
        "by_ticket_type": by_ticket_type,
        "last_24h": {"orders": last_24h_orders.count(), "tickets": last_24h_tickets},
        "generated_at": timezone.now().isoformat(),
    }
