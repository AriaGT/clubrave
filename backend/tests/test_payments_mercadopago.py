"""Checkout Pro de Mercado Pago sobre la Orders API.

La red se corta en `requests.request`, de modo que todo lo nuestro corre de
verdad: armado del payload, lectura de la respuesta, validación de firma y
mapeo de estados. Lo único simulado es lo que diría Mercado Pago.
"""

import hashlib
import hmac
import json

import pytest
from rest_framework.test import APIClient

from apps.orders.models import Order, Ticket
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.payments import mercadopago as mp_module
from apps.payments.gateways import MercadoPagoGateway
from apps.payments.mercadopago import MercadoPagoError, build_signature_manifest
from apps.payments.models import PaymentEvent

WEBHOOK_SECRET = "clave-secreta-de-prueba"
MP_ORDER_ID = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3"
CHECKOUT_URL = "https://www.mercadopago.com.pe/checkout/v1/redirect?order_id=ORD01JQ4S4KY8HWQ6NA5PXB65B3D3"

BUYER = BuyerData(email="comprador@test.pe", full_name="Comprador Test")


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def mercadopago_settings(settings):
    settings.PAYMENT_GATEWAY = "mercadopago"
    settings.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-token-de-prueba"
    settings.MERCADOPAGO_WEBHOOK_SECRET = WEBHOOK_SECRET
    settings.MERCADOPAGO_API_BASE_URL = "https://api.mercadopago.com"
    settings.FRONTEND_STORE_URL = "https://clubrave.pe"
    return settings


@pytest.fixture
def pending_order(published_event, ticket_type):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=2)],
        buyer=BUYER,
        terms_accepted=True,
    )
    order.gateway = "mercadopago"
    order.gateway_order_id = MP_ORDER_ID
    order.save(update_fields=["gateway", "gateway_order_id"])
    return order


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


def mp_order_payload(
    order, *, status="processed", status_detail="accredited", total=None, currency="PEN"
):
    return {
        "id": MP_ORDER_ID,
        "status": status,
        "status_detail": status_detail,
        "external_reference": order.code,
        "total_amount": total if total is not None else str(order.total),
        "currency": currency,
        "checkout_url": CHECKOUT_URL,
        "transactions": {"payments": [{"id": "1234567890"}]},
    }


@pytest.fixture
def mp_api(monkeypatch):
    """Intercepta las llamadas HTTP a Mercado Pago y registra las solicitudes."""

    calls = []
    responses = {"POST": None, "GET": None}

    def fake_request(method, url, json=None, headers=None, timeout=None):
        calls.append({"method": method, "url": url, "body": json, "headers": headers or {}})
        payload = responses[method]
        if isinstance(payload, Exception):
            raise payload
        if isinstance(payload, FakeResponse):
            return payload
        return FakeResponse(payload)

    monkeypatch.setattr(mp_module.requests, "request", fake_request)
    return {"calls": calls, "responses": responses}


def signed_webhook_headers(data_id, *, secret=WEBHOOK_SECRET, request_id="req-abc"):
    ts = "1742505638683"
    manifest = build_signature_manifest(data_id=data_id, request_id=request_id, ts=ts)
    v1 = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return {"HTTP_X_SIGNATURE": f"ts={ts},v1={v1}", "HTTP_X_REQUEST_ID": request_id}


def post_webhook(client, data_id, *, headers=None, body=None):
    headers = headers if headers is not None else signed_webhook_headers(data_id)
    if body is None:
        body = {"action": "order.processed", "type": "order", "data": {"id": data_id}}
    return client.post(
        f"/api/webhooks/mercadopago/?data.id={data_id}&type=order",
        data=json.dumps(body),
        content_type="application/json",
        **headers,
    )


# ── Firma del webhook ────────────────────────────────────────────────────────


def test_manifest_lowercases_the_order_id():
    """Los ids de la Orders API llegan en mayúsculas y el manifest los exige
    en minúsculas: confundirse aquí invalida todas las notificaciones."""
    manifest = build_signature_manifest(data_id=MP_ORDER_ID, request_id="req-1", ts="123")
    assert manifest == f"id:{MP_ORDER_ID.lower()};request-id:req-1;ts:123;"


def test_manifest_omits_missing_components():
    assert build_signature_manifest(data_id="", request_id="req-1", ts="123") == "request-id:req-1;ts:123;"


def test_webhook_with_invalid_signature_is_rejected(client, pending_order, mp_api):
    response = post_webhook(client, MP_ORDER_ID, headers=signed_webhook_headers(MP_ORDER_ID, secret="otra"))

    assert response.status_code == 401
    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PENDING
    # Con firma inválida ni se consulta a Mercado Pago.
    assert mp_api["calls"] == []


def test_webhook_without_signature_header_is_rejected(client, pending_order, mp_api):
    response = post_webhook(client, MP_ORDER_ID, headers={})

    assert response.status_code == 401
    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PENDING


def test_webhook_is_rejected_when_the_secret_is_not_configured(client, pending_order, mp_api, settings):
    """Falla cerrado: sin clave secreta no se procesa nada."""
    settings.MERCADOPAGO_WEBHOOK_SECRET = ""
    response = post_webhook(client, MP_ORDER_ID)

    assert response.status_code == 401
    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PENDING


# ── Aplicación del resultado ─────────────────────────────────────────────────


def test_processed_webhook_marks_order_paid_and_issues_tickets(client, pending_order, ticket_type, mp_api):
    mp_api["responses"]["GET"] = mp_order_payload(pending_order)

    response = post_webhook(client, MP_ORDER_ID)
    assert response.status_code == 200

    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PAID
    assert pending_order.gateway_reference == "1234567890"
    assert Ticket.objects.filter(order=pending_order).count() == 2

    ticket_type.refresh_from_db()
    assert ticket_type.quantity_sold == 2

    # El estado salió de consultar la order, no del cuerpo de la notificación.
    assert mp_api["calls"][0]["method"] == "GET"
    assert mp_api["calls"][0]["url"].endswith(f"/v1/orders/{MP_ORDER_ID}")


def test_webhook_body_claiming_success_cannot_pay_a_rejected_order(
    client, pending_order, ticket_type, mp_api
):
    """El cuerpo de la notificación no es la fuente de verdad: aunque diga
    `order.processed`, manda lo que responde la consulta de la order."""
    mp_api["responses"]["GET"] = mp_order_payload(pending_order, status="failed", status_detail="failed")

    response = post_webhook(client, MP_ORDER_ID)
    assert response.status_code == 200

    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.FAILED
    assert Ticket.objects.filter(order=pending_order).count() == 0

    ticket_type.refresh_from_db()
    assert ticket_type.quantity_reserved == 0  # inventario liberado


@pytest.mark.parametrize(
    "status,status_detail",
    [
        ("created", "created"),
        ("processing", "in_process"),
        ("action_required", "waiting_payment"),
        ("action_required", "waiting_capture"),
    ],
)
def test_pending_webhook_leaves_the_order_untouched(
    client, pending_order, ticket_type, mp_api, status, status_detail
):
    """Yape o efectivo sin pagar, o un cobro autorizado sin capturar: no se
    emiten entradas pero tampoco se libera la retención de inventario."""
    mp_api["responses"]["GET"] = mp_order_payload(pending_order, status=status, status_detail=status_detail)

    response = post_webhook(client, MP_ORDER_ID)
    assert response.status_code == 200

    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PENDING
    assert Ticket.objects.filter(order=pending_order).count() == 0

    ticket_type.refresh_from_db()
    assert ticket_type.quantity_reserved == 2


def test_webhook_with_mismatched_amount_is_rejected(client, pending_order, mp_api):
    mp_api["responses"]["GET"] = mp_order_payload(pending_order, total="1.00")

    response = post_webhook(client, MP_ORDER_ID)
    assert response.status_code == 400

    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PENDING


def test_duplicate_webhook_does_not_duplicate_tickets(client, pending_order, mp_api):
    mp_api["responses"]["GET"] = mp_order_payload(pending_order)

    assert post_webhook(client, MP_ORDER_ID).status_code == 200
    assert post_webhook(client, MP_ORDER_ID).status_code == 200

    assert Ticket.objects.filter(order=pending_order).count() == 2
    assert PaymentEvent.objects.filter(order=pending_order, kind=PaymentEvent.Kind.IPN).count() == 1


def test_webhook_for_unknown_order_is_acknowledged(client, published_event, mp_api):
    """Firma válida pero la orden no es nuestra: 200 para que Mercado Pago no
    reintente indefinidamente algo que nunca vamos a poder procesar."""
    mp_api["responses"]["GET"] = {
        "id": MP_ORDER_ID,
        "status": "processed",
        "status_detail": "accredited",
        "external_reference": "TK-NOEXISTE",
        "total_amount": "100.00",
        "currency": "PEN",
        "checkout_url": CHECKOUT_URL,
    }
    assert post_webhook(client, MP_ORDER_ID).status_code == 200


def test_webhook_returns_503_when_mercadopago_is_unreachable(client, pending_order, mp_api):
    """Sin poder consultar la order no se da la notificación por procesada:
    503 hace que Mercado Pago reintente."""
    mp_api["responses"]["GET"] = mp_module.requests.RequestException("timeout")

    response = post_webhook(client, MP_ORDER_ID)
    assert response.status_code == 503

    pending_order.refresh_from_db()
    assert pending_order.status == Order.Status.PENDING


# ── Creación de la sesión de pago ────────────────────────────────────────────


def test_checkout_creates_a_mercadopago_order_and_returns_the_checkout_url(
    client, published_event, ticket_type, mp_api
):
    mp_api["responses"]["POST"] = {
        "id": MP_ORDER_ID,
        "status": "created",
        "status_detail": "created",
        "external_reference": "se-ignora",
        "total_amount": "50.00",
        "currency": "PEN",
        "checkout_url": CHECKOUT_URL,
    }

    response = client.post(
        "/api/checkout/orders/",
        data={
            "event_id": str(published_event.id),
            "items": [{"ticket_type_id": str(ticket_type.id), "quantity": 1}],
            "buyer": {"email": "a@test.pe", "full_name": "A"},
            "terms_accepted": True,
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["payment"]["gateway"] == "mercadopago"
    assert body["payment"]["checkout_url"] == CHECKOUT_URL

    order = Order.objects.get(code=body["order"]["code"])
    assert order.gateway_order_id == MP_ORDER_ID

    sent = mp_api["calls"][0]
    assert sent["method"] == "POST"
    assert sent["url"].endswith("/v1/orders")
    # Idempotencia: la clave está atada al código de orden, así que repetir la
    # llamada reusa la order en lugar de abrir un segundo cobro.
    assert sent["headers"]["X-Idempotency-Key"] == f"clubrave-order-{order.code}"
    assert sent["body"]["external_reference"] == order.code
    assert sent["body"]["total_amount"] == "50.00"
    # Para Checkout Pro la documentación sólo admite `manual`.
    assert sent["body"]["processing_mode"] == "manual"
    # La order de Mercado Pago vence con la nuestra, no al día siguiente.
    assert sent["body"]["expiration_time"] == "PT15M"
    assert sent["body"]["config"]["online"]["success_url"] == (
        f"https://clubrave.pe/checkout/{order.code}/pay?mp=success"
    )
    assert sent["body"]["config"]["online"]["auto_return"] == "all"


def test_items_sum_matches_the_order_total(published_event, ticket_type, mp_api):
    """Mercado Pago exige que `total_amount` sea exactamente la suma de los
    ítems; si no cuadra, rechaza la creación de la order."""
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=3)],
        buyer=BUYER,
        terms_accepted=True,
    )
    items = MercadoPagoGateway()._items(order)
    total = sum(float(item["total_amount"]) for item in items)
    assert total == float(order.total)


def test_checkout_fails_closed_when_mercadopago_rejects_the_order(
    client, published_event, ticket_type, mp_api
):
    mp_api["responses"]["POST"] = mp_module.requests.RequestException("boom")

    response = client.post(
        "/api/checkout/orders/",
        data={
            "event_id": str(published_event.id),
            "items": [{"ticket_type_id": str(ticket_type.id), "quantity": 1}],
            "buyer": {"email": "a@test.pe", "full_name": "A"},
            "terms_accepted": True,
        },
        format="json",
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PAYMENT_UNAVAILABLE"
    assert not Ticket.objects.exists()


# ── Retorno del navegador ────────────────────────────────────────────────────


def test_browser_return_reads_the_real_status_from_mercadopago(client, pending_order, mp_api):
    mp_api["responses"]["GET"] = mp_order_payload(pending_order)

    response = client.post(f"/api/checkout/orders/{pending_order.code}/confirm/", data={}, format="json")

    assert response.status_code == 200
    assert response.json()["status"] == "PAID"
    assert Ticket.objects.filter(order=pending_order).count() == 2


def test_browser_return_cannot_fake_a_payment(client, pending_order, mp_api):
    """Aunque el navegador llegue diciendo `approved`, el estado sale de la
    consulta a Mercado Pago (requisito: no confiar en `success_url`)."""
    mp_api["responses"]["GET"] = mp_order_payload(pending_order, status="failed", status_detail="failed")

    response = client.post(
        f"/api/checkout/orders/{pending_order.code}/confirm/",
        data={"approved": True, "status": "approved"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["status"] == "FAILED"
    assert Ticket.objects.filter(order=pending_order).count() == 0


def test_browser_return_without_a_payment_session_changes_nothing(
    client, published_event, ticket_type, mp_api
):
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BUYER,
        terms_accepted=True,
    )
    response = client.post(f"/api/checkout/orders/{order.code}/confirm/", data={}, format="json")

    assert response.status_code == 200
    assert response.json()["status"] == "PENDING"
    assert mp_api["calls"] == []


def test_http_error_from_mercadopago_surfaces_as_an_error(mp_api):
    mp_api["responses"]["GET"] = FakeResponse({"message": "order not found"}, status_code=404)

    with pytest.raises(MercadoPagoError, match="order not found"):
        MercadoPagoGateway().client.get_order("x")


def test_error_list_shape_keeps_the_provider_message(mp_api):
    """Mercado Pago usa `errors[]` en algunos endpoints; perder ese texto deja
    el diagnóstico a ciegas justo cuando se está saliendo a producción."""
    mp_api["responses"]["GET"] = FakeResponse(
        {"errors": [{"code": "invalid_credentials", "message": "Test credentials are not supported"}]},
        status_code=401,
    )

    with pytest.raises(MercadoPagoError, match="invalid_credentials: Test credentials"):
        MercadoPagoGateway().client.get_order("x")
