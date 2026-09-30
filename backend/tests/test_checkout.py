import threading
from decimal import Decimal

import pytest
from django.db import connection
from django.utils import timezone

from apps.common.errors import DomainError
from apps.events.models import Event
from apps.orders.models import Order
from apps.orders.services.checkout import BuyerData, CartLine, create_order

BUYER = BuyerData(email="comprador@test.pe", full_name="Comprador Test")


def test_total_is_recalculated_from_the_database(published_event, ticket_type):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=3)],
        buyer=BUYER,
        terms_accepted=True,
    )
    assert order.subtotal == Decimal("150.00")
    assert order.total == Decimal("150.00")
    assert order.status == Order.Status.PENDING


def test_reserves_inventory_without_selling_it(published_event, ticket_type):
    create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=3)],
        buyer=BUYER,
        terms_accepted=True,
    )
    ticket_type.refresh_from_db()
    assert ticket_type.quantity_reserved == 3
    assert ticket_type.quantity_sold == 0
    assert ticket_type.available == 97


def test_sold_out_reports_real_availability(published_event, ticket_type):
    ticket_type.quantity_total = 5
    ticket_type.save(update_fields=["quantity_total"])
    with pytest.raises(DomainError) as exc:
        create_order(
            event=published_event,
            items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=6)],
            buyer=BUYER,
            terms_accepted=True,
        )
    assert exc.value.code == "SOLD_OUT"
    assert exc.value.details["available"] == 5


def test_max_per_order_is_enforced(published_event, ticket_type):
    ticket_type.max_per_order = 4
    ticket_type.save(update_fields=["max_per_order"])
    with pytest.raises(DomainError) as exc:
        create_order(
            event=published_event,
            items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=5)],
            buyer=BUYER,
            terms_accepted=True,
        )
    assert exc.value.code == "VALIDATION_ERROR"


def test_unpublished_event_is_rejected(published_event, ticket_type):
    published_event.status = Event.Status.DRAFT
    published_event.save(update_fields=["status"])
    with pytest.raises(DomainError) as exc:
        create_order(
            event=published_event,
            items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
            buyer=BUYER,
            terms_accepted=True,
        )
    assert exc.value.code == "EVENT_NOT_PUBLISHED"


def test_terms_must_be_accepted(published_event, ticket_type):
    with pytest.raises(DomainError) as exc:
        create_order(
            event=published_event,
            items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
            buyer=BUYER,
            terms_accepted=False,
        )
    assert exc.value.code == "VALIDATION_ERROR"


def test_closed_sales_window_is_rejected(published_event, ticket_type):
    ticket_type.sales_end_at = timezone.now() - timezone.timedelta(days=1)
    ticket_type.save(update_fields=["sales_end_at"])
    with pytest.raises(DomainError) as exc:
        create_order(
            event=published_event,
            items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
            buyer=BUYER,
            terms_accepted=True,
        )
    assert exc.value.code == "SALES_CLOSED"


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor == "sqlite",
    reason="SQLite serializa el archivo completo a nivel de proceso: no emula "
    "el bloqueo de fila de Postgres. Este escenario corre en CI contra "
    "Postgres real (§15.2 del plan).",
)
def test_concurrent_purchases_of_the_last_ticket_never_oversell(published_event, scarce_ticket_type):
    """Con 200 entradas a la venta y compras concurrentes, jamás se emiten
    201 (criterio de éxito §2.3). Aquí con 1 entrada y 5 compradores a la vez."""
    results = []

    def attempt():
        connection.close()  # cada hilo necesita su propia conexión
        try:
            order = create_order(
                event=published_event,
                items=[CartLine(ticket_type_id=str(scarce_ticket_type.id), quantity=1)],
                buyer=BUYER,
                terms_accepted=True,
            )
            results.append(("ok", order.code))
        except DomainError as exc:
            results.append(("error", exc.code))
        finally:
            connection.close()

    threads = [threading.Thread(target=attempt) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    successes = [r for r in results if r[0] == "ok"]
    failures = [r for r in results if r[0] == "error"]

    assert len(successes) == 1
    assert len(failures) == 4
    assert all(code == "SOLD_OUT" for _, code in failures)

    scarce_ticket_type.refresh_from_db()
    assert scarce_ticket_type.quantity_reserved == 1
