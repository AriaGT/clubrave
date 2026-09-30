from datetime import timedelta

from django.utils import timezone

from apps.orders.models import Order
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.expiry import release_expired_orders

BUYER = BuyerData(email="comprador@test.pe", full_name="Comprador Test")


def test_release_expired_orders_returns_inventory(published_event, ticket_type):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=2)],
        buyer=BUYER,
        terms_accepted=True,
    )
    Order.objects.filter(id=order.id).update(expires_at=timezone.now() - timedelta(minutes=1))

    released = release_expired_orders()

    assert released == 1
    order.refresh_from_db()
    assert order.status == Order.Status.EXPIRED

    ticket_type.refresh_from_db()
    assert ticket_type.quantity_reserved == 0
    assert ticket_type.available == 100


def test_release_expired_orders_ignores_orders_still_within_hold(published_event, ticket_type):
    create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=2)],
        buyer=BUYER,
        terms_accepted=True,
    )
    released = release_expired_orders()
    assert released == 0
    ticket_type.refresh_from_db()
    assert ticket_type.quantity_reserved == 2
