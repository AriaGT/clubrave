from apps.orders.models import Order, Ticket
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.fulfillment import mark_failed, mark_paid

BUYER = BuyerData(email="comprador@test.pe", full_name="Comprador Test")


def _make_order(event, ticket_type, quantity=2):
    return create_order(
        event=event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=quantity)],
        buyer=BUYER,
        terms_accepted=True,
    )


def test_mark_paid_issues_one_ticket_per_unit(published_event, ticket_type):
    order = _make_order(published_event, ticket_type, quantity=3)
    mark_paid(order_id=order.id, gateway_reference="ref-1")

    order.refresh_from_db()
    assert order.status == Order.Status.PAID
    assert order.paid_at is not None
    assert Ticket.objects.filter(order=order).count() == 3

    ticket_type.refresh_from_db()
    assert ticket_type.quantity_sold == 3
    assert ticket_type.quantity_reserved == 0


def test_mark_paid_is_idempotent(published_event, ticket_type):
    """Navegador + IPN pueden llamar mark_paid dos veces: nunca dos juegos
    de entradas (ver §7.3 y §8.8)."""
    order = _make_order(published_event, ticket_type, quantity=2)
    mark_paid(order_id=order.id, gateway_reference="ref-1")
    mark_paid(order_id=order.id, gateway_reference="ref-2")

    assert Ticket.objects.filter(order=order).count() == 2
    order.refresh_from_db()
    assert order.gateway_reference == "ref-1"  # la primera confirmación manda


def test_ticket_codes_are_unique_per_order(published_event, ticket_type):
    order = _make_order(published_event, ticket_type, quantity=5)
    mark_paid(order_id=order.id)
    codes = list(Ticket.objects.filter(order=order).values_list("code", flat=True))
    assert len(codes) == len(set(codes))


def test_mark_failed_releases_reserved_inventory(published_event, ticket_type):
    order = _make_order(published_event, ticket_type, quantity=4)
    mark_failed(order_id=order.id)

    order.refresh_from_db()
    assert order.status == Order.Status.FAILED
    assert Ticket.objects.filter(order=order).count() == 0

    ticket_type.refresh_from_db()
    assert ticket_type.quantity_reserved == 0
    assert ticket_type.quantity_sold == 0
