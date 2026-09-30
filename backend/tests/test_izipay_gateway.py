"""Pruebas de la parte de Izipay que no depende de credenciales reales: la
verificación de firmas (§8.4) y la creación de sesión (§8.3). Los nueve
escenarios de §8.8 que sí requieren el entorno de pruebas del proveedor se
verifican manualmente cuando lleguen las credenciales."""

import hashlib
import hmac
import json
from unittest.mock import Mock, patch

import pytest
import requests
from django.test import override_settings

from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.payments.gateways import IzipayGateway, PaymentUnavailable, amounts_match

IZIPAY_SETTINGS = dict(
    IZIPAY_SHOP_ID="12345678",
    IZIPAY_REST_PASSWORD="test-rest-password",
    IZIPAY_HMAC_SHA256_KEY="test-hmac-sha256-key",
    IZIPAY_PUBLIC_KEY="12345678:testpublickey_xxx",
    IZIPAY_JS_URL="https://static.example.pe/kr-payment-form.min.js",
)

BUYER = BuyerData(email="comprador@test.pe", full_name="Comprador Test")


@pytest.fixture(autouse=True)
def izipay_settings(settings):
    """`override_settings` como decorador de clase solo funciona sobre
    `TestCase`; este módulo usa clases de pytest simples para agrupar, así
    que se inyectan las credenciales de prueba vía el fixture `settings`."""
    for key, value in IZIPAY_SETTINGS.items():
        setattr(settings, key, value)


@pytest.fixture
def order(published_event, ticket_type):
    return create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=2)],
        buyer=BUYER,
        terms_accepted=True,
    )


def _sign(raw_answer: str, key: str) -> str:
    return hmac.new(key.encode(), raw_answer.encode("utf-8"), hashlib.sha256).hexdigest()


def _kr_answer(order_code: str, *, amount_cents: int, status: str = "PAID", currency: str = "PEN") -> str:
    # La cadena cruda importa: se firma tal cual, nunca el dict re-serializado.
    return json.dumps(
        {
            "orderStatus": status,
            "orderTotalAmount": amount_cents,
            "currency": currency,
            "orderDetails": {"orderId": order_code},
            "transactions": [{"uuid": "txn-abc-123"}],
        }
    )


class TestBrowserReturnSignature:
    def test_valid_signature_is_accepted(self, order):
        raw = _kr_answer(order.code, amount_cents=6000)
        payload = {
            "kr-answer": raw,
            "kr-hash": _sign(raw, "test-hmac-sha256-key"),
            "kr-hash-key": "sha256_hmac",
        }
        result = IzipayGateway().verify_browser_return(payload)
        assert result.signature_valid
        assert result.approved
        assert result.order_code == order.code
        assert result.amount_cents == 6000
        assert result.reference == "txn-abc-123"

    def test_tampered_answer_is_rejected(self, order):
        raw = _kr_answer(order.code, amount_cents=6000)
        payload = {
            "kr-answer": raw,
            "kr-hash": _sign(raw, "test-hmac-sha256-key"),
            "kr-hash-key": "sha256_hmac",
        }
        # Cambia un solo carácter tras firmar: simula un JSON re-serializado
        # o manipulado en tránsito.
        payload["kr-answer"] = raw.replace("PAID", "PAId")
        result = IzipayGateway().verify_browser_return(payload)
        assert not result.signature_valid

    def test_signed_with_the_wrong_channel_key_is_rejected(self, order):
        """Firmar con la clave del IPN (password) mandándolo como si fuera
        la respuesta al navegador no debe colarse."""
        raw = _kr_answer(order.code, amount_cents=6000)
        payload = {
            "kr-answer": raw,
            "kr-hash": _sign(raw, "test-rest-password"),
            "kr-hash-key": "sha256_hmac",  # miente sobre qué clave usó
        }
        result = IzipayGateway().verify_browser_return(payload)
        assert not result.signature_valid

    def test_hash_key_label_mismatch_is_rejected_even_with_correct_hmac(self, order):
        """El HMAC es correcto para la clave HMAC-SHA256, pero el payload
        declara kr-hash-key="password": no se confía en el canal declarado."""
        raw = _kr_answer(order.code, amount_cents=6000)
        payload = {
            "kr-answer": raw,
            "kr-hash": _sign(raw, "test-hmac-sha256-key"),
            "kr-hash-key": "password",
        }
        result = IzipayGateway().verify_browser_return(payload)
        assert not result.signature_valid


class TestIpnSignature:
    def test_valid_ipn_signature_is_accepted(self, order):
        raw = _kr_answer(order.code, amount_cents=6000)
        body = json.dumps(
            {
                "kr-answer": raw,
                "kr-hash": _sign(raw, "test-rest-password"),
                "kr-hash-key": "password",
            }
        ).encode("utf-8")
        request = Mock(body=body)
        result = IzipayGateway().verify_ipn(request)
        assert result.signature_valid
        assert result.approved

    def test_ipn_signed_with_browser_key_is_rejected(self, order):
        """El clásico error de confundir las dos claves (§8.4): si el IPN
        llega firmado con la clave HMAC-SHA256 del navegador en vez del
        password de la API REST, se rechaza."""
        raw = _kr_answer(order.code, amount_cents=6000)
        body = json.dumps(
            {
                "kr-answer": raw,
                "kr-hash": _sign(raw, "test-hmac-sha256-key"),
                "kr-hash-key": "password",  # declara el canal correcto...
            }
        ).encode("utf-8")  # ...pero el hash no corresponde al password real
        request = Mock(body=body)
        result = IzipayGateway().verify_ipn(request)
        assert not result.signature_valid

    def test_rejected_payment_is_not_approved(self, order):
        raw = _kr_answer(order.code, amount_cents=6000, status="UNPAID")
        body = json.dumps(
            {"kr-answer": raw, "kr-hash": _sign(raw, "test-rest-password"), "kr-hash-key": "password"}
        ).encode("utf-8")
        request = Mock(body=body)
        result = IzipayGateway().verify_ipn(request)
        assert result.signature_valid
        assert not result.approved


class TestCreateSession:
    def test_raises_payment_unavailable_when_provider_is_down(self, order):
        with patch("apps.payments.gateways.requests.post", side_effect=requests.ConnectionError("down")):
            with pytest.raises(PaymentUnavailable):
                IzipayGateway().create_session(order)

    def test_raises_payment_unavailable_on_provider_error_status(self, order):
        response = Mock()
        response.json.return_value = {"status": "ERROR", "errorMessage": "Comercio inválido"}
        with patch("apps.payments.gateways.requests.post", return_value=response):
            with pytest.raises(PaymentUnavailable):
                IzipayGateway().create_session(order)

    def test_amount_is_sent_in_integer_cents_from_decimal(self, order):
        response = Mock()
        response.json.return_value = {"status": "SUCCESS", "answer": {"formToken": "tok_abc"}}
        with patch("apps.payments.gateways.requests.post", return_value=response) as mock_post:
            session = IzipayGateway().create_session(order)

        assert session.form_token == "tok_abc"
        sent_body = mock_post.call_args.kwargs["json"]
        assert sent_body["amount"] == int(order.total * 100)
        assert isinstance(sent_body["amount"], int)
        assert sent_body["orderId"] == order.code

    def test_never_creates_a_session_without_configured_credentials(self, order):
        with override_settings(IZIPAY_SHOP_ID=""):
            with pytest.raises(PaymentUnavailable):
                IzipayGateway().create_session(order)


class TestAmountsMatch:
    def test_matching_amount_and_currency(self, order):
        from apps.payments.gateways import PaymentResult

        result = PaymentResult(
            order_code=order.code,
            approved=True,
            amount_cents=int(order.total * 100),
            currency=order.currency,
            reference="ref",
            signature_valid=True,
        )
        assert amounts_match(order, result)

    def test_mismatched_amount_is_rejected(self, order):
        from apps.payments.gateways import PaymentResult

        result = PaymentResult(
            order_code=order.code,
            approved=True,
            amount_cents=1,
            currency=order.currency,
            reference="ref",
            signature_valid=True,
        )
        assert not amounts_match(order, result)
