"""Medios de pago configurables desde el panel: credenciales cifradas de solo
escritura, varios medios a la vez y elección del comprador en el checkout."""

import hashlib
import hmac
import json
from unittest.mock import Mock, patch

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Membership, User
from apps.common.models import AuditLog
from apps.orders.models import Order
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.payments.crypto import CredentialsUnreadable, decrypt_credentials, encrypt_credentials
from apps.payments.models import PaymentProvider, PaymentSettings
from apps.payments.providers import checkout_methods, credentials_of

IZIPAY_TEST = {
    "shop_id": "43564905",
    "public_key": "43564905:testpublickey_abc123",
    "rest_password": "testpassword_SECRET9876",
    "hmac_key": "HMACSECRET5555",
}
MP_CREDS = {"access_token": "APP_USR-token-SECRET1111", "webhook_secret": "WEBHOOKSECRET2222"}
SECRETS = ["testpassword_SECRET9876", "HMACSECRET5555", "APP_USR-token-SECRET1111", "WEBHOOKSECRET2222"]


def _client_for(user, organization) -> APIClient:
    access = RefreshToken.for_user(user).access_token
    access["scope"] = "org"
    access["organization_id"] = str(organization.id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@pytest.fixture
def owner_client(organizer_user, organization):
    return _client_for(organizer_user, organization)


@pytest.fixture
def staff_client(db, organization):
    user = User.objects.create_user(email="puerta@test.pe", password="clave12345", role=User.Role.STAFF)
    Membership.objects.create(user=user, organization=organization, role=Membership.Role.STAFF)
    return _client_for(user, organization)


def _sdk_test_ok():
    response = Mock()
    response.json.return_value = {"status": "SUCCESS", "answer": {"value": "clubrave"}}
    return patch("apps.payments.providers.requests.post", return_value=response)


def _mp_users_me(status_code=200):
    return patch("apps.payments.providers.requests.get", return_value=Mock(status_code=status_code))


# ── Cifrado ─────────────────────────────────────────────────────────────────


def test_credentials_round_trip_and_are_not_stored_in_clear(settings):
    settings.PAYMENT_CREDENTIALS_KEY = "una-clave-larga-de-prueba"
    token = encrypt_credentials(IZIPAY_TEST)
    assert "testpassword_SECRET9876" not in token
    assert decrypt_credentials(token) == IZIPAY_TEST


def test_credentials_are_unreadable_with_another_key(settings):
    settings.PAYMENT_CREDENTIALS_KEY = "clave-a"
    token = encrypt_credentials(IZIPAY_TEST)
    settings.PAYMENT_CREDENTIALS_KEY = "clave-b"
    with pytest.raises(CredentialsUnreadable):
        decrypt_credentials(token)


# ── Importación única desde el entorno ───────────────────────────────────────


def test_first_load_imports_the_legacy_environment(db, settings):
    PaymentSettings.objects.all().delete()  # como un despliegue que aún no la tiene
    settings.PAYMENT_GATEWAY = "izipay"
    settings.IZIPAY_MODE = "production"
    settings.IZIPAY_SHOP_ID = IZIPAY_TEST["shop_id"]
    settings.IZIPAY_PUBLIC_KEY = IZIPAY_TEST["public_key"]
    settings.IZIPAY_REST_PASSWORD = IZIPAY_TEST["rest_password"]
    settings.IZIPAY_HMAC_SHA256_KEY = IZIPAY_TEST["hmac_key"]
    settings.MERCADOPAGO_ACCESS_TOKEN = ""

    assert PaymentSettings.load().mode == PaymentSettings.Mode.LIVE
    row = PaymentProvider.objects.get(provider="izipay")
    assert row.enabled and row.environment == "production"
    assert credentials_of(row) == IZIPAY_TEST
    assert row.hints["rest_password"] == "••••9876"
    assert row.hints["shop_id"] == "43564905"
    assert checkout_methods() == ["izipay"]
    assert not PaymentProvider.objects.filter(provider="mercadopago").exists()


def test_import_runs_only_once(db, settings):
    settings.PAYMENT_GATEWAY = "izipay"  # ya hay configuración (modo simulador del conftest)
    assert PaymentSettings.load().mode == PaymentSettings.Mode.FAKE


# ── API del panel ────────────────────────────────────────────────────────────


def test_only_owners_can_read_payment_settings(staff_client):
    assert staff_client.get("/api/org/payments/").status_code == 403


def test_saving_credentials_validates_them_and_never_returns_them(owner_client):
    with _sdk_test_ok() as sdk_test:
        response = owner_client.patch(
            "/api/org/payments/",
            {"mode": "live", "providers": {"izipay": {"enabled": True, "credentials": IZIPAY_TEST}}},
            format="json",
        )
    assert response.status_code == 200, response.json()
    assert sdk_test.call_args.args[0].endswith("/Charge/SDKTest")

    body = json.dumps(response.json())
    for secret in SECRETS:
        assert secret not in body
    izipay = next(p for p in response.json()["providers"] if p["id"] == "izipay")
    assert izipay["configured"] and izipay["enabled"] and izipay["verified_at"]
    assert izipay["hints"] == {
        "shop_id": "43564905",
        "public_key": "43564905:testpublickey_abc123",
        "rest_password": "••••9876",
        "hmac_key": "••••5555",
    }
    assert izipay["webhook_url"].endswith("/api/webhooks/izipay/")

    # Ni la lectura posterior ni la base guardan nada en claro.
    assert all(s not in json.dumps(owner_client.get("/api/org/payments/").json()) for s in SECRETS)
    assert "testpassword_SECRET9876" not in PaymentProvider.objects.get(provider="izipay").credentials

    log = AuditLog.objects.get(action=AuditLog.Action.PAYMENT_SETTINGS_UPDATED)
    assert log.metadata == {"mode": "live", "enabled": ["izipay"], "credentials_changed": ["izipay"]}


IZIPAY_PROD = {
    "shop_id": "43564905",
    "public_key": "43564905:publickey_fyYbfSOtt8",  # la de producción no lleva prefijo de entorno
    "rest_password": "prodpassword_SECRET0000",
    "hmac_key": "HMACPROD7777",
}


def test_production_credentials_are_accepted_in_production(owner_client):
    with _sdk_test_ok() as sdk_test:
        response = owner_client.patch(
            "/api/org/payments/",
            {
                "mode": "live",
                "providers": {
                    "izipay": {"enabled": True, "environment": "production", "credentials": IZIPAY_PROD}
                },
            },
            format="json",
        )
    assert response.status_code == 200, response.json()
    sdk_test.assert_called_once()
    assert PaymentProvider.objects.get(provider="izipay").environment == "production"


def test_izipay_decides_whether_the_credentials_are_valid(owner_client):
    """Sin reglas de formato propias: lo que Izipay rechaza, se rechaza con su mensaje."""
    refused = Mock()
    refused.json.return_value = {"status": "ERROR", "answer": {"errorMessage": "Authentication failed"}}
    with patch("apps.payments.providers.requests.post", return_value=refused):
        response = owner_client.patch(
            "/api/org/payments/",
            {"mode": "live", "providers": {"izipay": {"enabled": True, "credentials": IZIPAY_TEST}}},
            format="json",
        )
    assert response.status_code == 400
    assert "Authentication failed" in str(response.json()["error"]["details"]["providers"]["izipay"])
    assert not PaymentProvider.objects.exists()


def test_nothing_is_saved_when_one_provider_rejects_its_credentials(owner_client):
    with _sdk_test_ok(), _mp_users_me(status_code=401):
        response = owner_client.patch(
            "/api/org/payments/",
            {
                "mode": "live",
                "providers": {
                    "izipay": {"enabled": True, "credentials": IZIPAY_TEST},
                    "mercadopago": {"enabled": True, "credentials": MP_CREDS},
                },
            },
            format="json",
        )
    assert response.status_code == 400
    assert "mercadopago" in response.json()["error"]["details"]["providers"]
    assert not PaymentProvider.objects.exists()
    assert PaymentSettings.load().mode == PaymentSettings.Mode.FAKE


def test_live_mode_needs_at_least_one_enabled_provider(owner_client):
    response = owner_client.patch("/api/org/payments/", {"mode": "live"}, format="json")
    assert response.status_code == 400


def test_blank_secret_fields_keep_the_stored_value(owner_client, configure_provider):
    configure_provider("izipay", IZIPAY_TEST)
    PaymentProvider.objects.filter(provider="izipay").update(verified_at="2026-01-01T00:00:00Z")
    with _sdk_test_ok():
        response = owner_client.patch(
            "/api/org/payments/",
            {"providers": {"izipay": {"credentials": {"hmac_key": "NUEVAHMAC7777", "rest_password": ""}}}},
            format="json",
        )
    assert response.status_code == 200
    stored = credentials_of(PaymentProvider.objects.get(provider="izipay"))
    assert stored == {**IZIPAY_TEST, "hmac_key": "NUEVAHMAC7777"}


def test_switching_environment_requires_all_credentials_again(owner_client, configure_provider):
    configure_provider("izipay", IZIPAY_TEST)
    response = owner_client.patch(
        "/api/org/payments/",
        {"providers": {"izipay": {"environment": "production"}}},
        format="json",
    )
    assert response.status_code == 400


def test_fake_mode_offers_only_the_simulator(configure_provider):
    configure_provider("izipay", IZIPAY_TEST, mode="fake")
    assert checkout_methods() == ["fake"]


# ── Checkout con varios medios ───────────────────────────────────────────────


def _checkout(client, event, ticket_type):
    return client.post(
        "/api/checkout/orders/",
        data={
            "event_id": str(event.id),
            "items": [{"ticket_type_id": str(ticket_type.id), "quantity": 1}],
            "buyer": {"email": "a@test.pe", "full_name": "Ana Pérez", "document_id": "12345678"},
            "terms_accepted": True,
        },
        format="json",
    )


def test_with_several_methods_the_buyer_chooses_on_the_pay_screen(
    published_event, ticket_type, configure_provider
):
    configure_provider("izipay", IZIPAY_TEST)
    configure_provider("mercadopago", MP_CREDS)
    client = APIClient()

    assert client.get("/api/checkout/payment-methods/").json()["methods"] == [
        {"id": "izipay", "label": "Tarjeta de crédito o débito"},
        {"id": "mercadopago", "label": "Mercado Pago"},
    ]

    created = _checkout(client, published_event, ticket_type)
    assert created.status_code == 201
    assert created.json()["payment"] is None
    assert [m["id"] for m in created.json()["payment_methods"]] == ["izipay", "mercadopago"]
    code = created.json()["order"]["code"]

    izipay_answer = Mock()
    izipay_answer.json.return_value = {"status": "SUCCESS", "answer": {"formToken": "tok_123"}}
    with patch("apps.payments.gateways.requests.post", return_value=izipay_answer):
        session = client.post(f"/api/checkout/orders/{code}/session/", {"method": "izipay"}, format="json")
    assert session.status_code == 200
    assert session.json()["gateway"] == "izipay"
    assert session.json()["public_key"] == IZIPAY_TEST["public_key"]
    assert Order.objects.get(code=code).gateway == "izipay"


def test_with_a_single_method_the_session_opens_right_away(published_event, ticket_type, configure_provider):
    configure_provider("izipay", IZIPAY_TEST)
    izipay_answer = Mock()
    izipay_answer.json.return_value = {"status": "SUCCESS", "answer": {"formToken": "tok_123"}}
    with patch("apps.payments.gateways.requests.post", return_value=izipay_answer):
        created = _checkout(APIClient(), published_event, ticket_type)
    assert created.json()["payment"]["form_token"] == "tok_123"


def test_a_disabled_method_cannot_open_a_session(published_event, ticket_type, configure_provider):
    configure_provider("izipay", IZIPAY_TEST)
    configure_provider("mercadopago", MP_CREDS, enabled=False)
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BuyerData(email="a@test.pe", full_name="Ana"),
        terms_accepted=True,
    )
    response = APIClient().post(
        f"/api/checkout/orders/{order.code}/session/", {"method": "mercadopago"}, format="json"
    )
    assert response.status_code == 503


# ── Rechazos que no deben anular el pago ─────────────────────────────────────


def _izipay_ipn(order, *, status: str, cycle: str) -> dict:
    raw = json.dumps(
        {
            "orderStatus": status,
            "orderCycle": cycle,
            "orderDetails": {
                "orderId": order.code,
                "orderTotalAmount": int(order.total * 100),
                "orderCurrency": "PEN",
            },
            "transactions": [{"uuid": f"txn-{status}-{cycle}"}],
        }
    )
    signature = hmac.new(IZIPAY_TEST["rest_password"].encode(), raw.encode(), hashlib.sha256).hexdigest()
    return {"kr-answer": raw, "kr-hash": signature, "kr-hash-key": "password"}


@pytest.fixture
def izipay_order(published_event, ticket_type, configure_provider):
    configure_provider("izipay", IZIPAY_TEST)
    configure_provider("mercadopago", MP_CREDS)
    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BuyerData(email="a@test.pe", full_name="Ana"),
        terms_accepted=True,
    )
    order.gateway = "izipay"
    order.save(update_fields=["gateway"])
    return order


def test_izipay_refusal_with_open_cycle_keeps_the_order_pending(izipay_order):
    """El formulario deja reintentar: el segundo intento aprobado debe emitir entradas."""
    client = APIClient()
    refused = client.post("/api/webhooks/izipay/", _izipay_ipn(izipay_order, status="UNPAID", cycle="OPEN"))
    assert refused.status_code == 200
    izipay_order.refresh_from_db()
    assert izipay_order.status == Order.Status.PENDING

    client.post("/api/webhooks/izipay/", _izipay_ipn(izipay_order, status="PAID", cycle="CLOSED"))
    izipay_order.refresh_from_db()
    assert izipay_order.status == Order.Status.PAID


def test_refusal_from_a_method_the_buyer_left_is_ignored(izipay_order):
    izipay_order.gateway = "mercadopago"  # cambió de medio en la pantalla de pago
    izipay_order.save(update_fields=["gateway"])
    response = APIClient().post(
        "/api/webhooks/izipay/", _izipay_ipn(izipay_order, status="UNPAID", cycle="CLOSED")
    )
    assert response.status_code == 200
    izipay_order.refresh_from_db()
    assert izipay_order.status == Order.Status.PENDING


def test_approval_from_the_method_the_buyer_left_still_pays_the_order(izipay_order):
    """Si el dinero entró por cualquier medio, la orden se paga."""
    izipay_order.gateway = "mercadopago"
    izipay_order.save(update_fields=["gateway"])
    APIClient().post("/api/webhooks/izipay/", _izipay_ipn(izipay_order, status="PAID", cycle="CLOSED"))
    izipay_order.refresh_from_db()
    assert izipay_order.status == Order.Status.PAID
