"""La pasarela de pago es un detalle reemplazable detrás de una interfaz
(regla A4). Dos implementaciones desde el día uno: `IzipayGateway` para
staging/producción y `FakeGateway` para desarrollo y tests — ambas ejercitan
exactamente el mismo camino de código (ver §8.2 del plan)."""

import base64
import hashlib
import hmac
import json
import logging
from dataclasses import dataclass, field
from typing import Protocol

import requests
from django.conf import settings
from django.http import HttpRequest

logger = logging.getLogger(__name__)


class PaymentUnavailable(Exception):
    """La pasarela no respondió o no está configurada. Nunca se crea una
    orden pagada sin cobro real: se traduce a 503 PAYMENT_UNAVAILABLE."""


@dataclass(frozen=True)
class PaymentSession:
    form_token: str
    public_key: str
    js_url: str
    gateway: str


@dataclass(frozen=True)
class PaymentResult:
    order_code: str
    approved: bool
    amount_cents: int
    currency: str
    reference: str | None
    signature_valid: bool
    raw: dict = field(default_factory=dict)


class PaymentGateway(Protocol):
    name: str

    def create_session(self, order) -> PaymentSession:
        """Pide al proveedor una sesión de pago para esta orden."""

    def verify_browser_return(self, payload: dict) -> PaymentResult:
        """Verifica la respuesta que trae el navegador. NO confirma la orden."""

    def verify_ipn(self, request: HttpRequest) -> PaymentResult:
        """Verifica la notificación servidor-a-servidor. Fuente de verdad."""


class FakeGateway:
    """Aprueba o rechaza según `order.buyer_document`: el valor mágico
    `"00000000"` simula un rechazo; cualquier otro, una aprobación. Sirve
    para desarrollo local y para las pruebas automatizadas de los cinco
    primeros escenarios de §8.8."""

    name = "fake"

    def create_session(self, order) -> PaymentSession:
        return PaymentSession(
            form_token=f"fake-token-{order.code}",
            public_key="fake-public-key",
            js_url="",
            gateway=self.name,
        )

    def _approved_for(self, order) -> bool:
        return order.buyer_document != "00000000"

    def verify_browser_return(self, payload: dict) -> PaymentResult:
        order_code = payload.get("order_code", "")
        approved = payload.get("approved", True)
        return PaymentResult(
            order_code=order_code,
            approved=approved,
            amount_cents=0,
            currency="PEN",
            reference=f"fake-ref-{order_code}",
            signature_valid=True,
            raw=payload,
        )

    def verify_ipn(self, request: HttpRequest) -> PaymentResult:
        payload = json.loads(request.body.decode("utf-8") or "{}")
        order_code = payload.get("order_code", "")
        return PaymentResult(
            order_code=order_code,
            approved=payload.get("approved", True),
            amount_cents=payload.get("amount_cents", 0),
            currency=payload.get("currency", "PEN"),
            reference=payload.get("reference") or f"fake-ref-{order_code}",
            signature_valid=True,
            raw=payload,
        )


class IzipayGateway:
    """Formulario incrustado + IPN firmado (ver §8.3-8.4 del plan)."""

    name = "izipay"

    def __init__(self):
        self.shop_id = settings.IZIPAY_SHOP_ID
        self.rest_password = settings.IZIPAY_REST_PASSWORD
        self.public_key = settings.IZIPAY_PUBLIC_KEY
        self.hmac_key = settings.IZIPAY_HMAC_SHA256_KEY
        self.rest_url = settings.IZIPAY_REST_URL
        self.js_url = settings.IZIPAY_JS_URL

    def create_session(self, order) -> PaymentSession:
        if not (self.shop_id and self.rest_password and self.public_key and self.hmac_key and self.js_url):
            raise PaymentUnavailable("Izipay no está configurado (faltan credenciales).")

        auth = base64.b64encode(f"{self.shop_id}:{self.rest_password}".encode()).decode()
        body = {
            "amount": int((order.total * 100).to_integral_value()),  # céntimos enteros
            "currency": order.currency,
            "orderId": order.code,
            "customer": {"email": order.buyer_email},
        }
        try:
            response = requests.post(
                self.rest_url,
                json=body,
                headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
                timeout=(5, 15),  # conectar / leer: nunca sin timeout
            )
            data = response.json()
        except requests.RequestException as exc:
            raise PaymentUnavailable(str(exc)) from exc

        if data.get("status") != "SUCCESS" or not data.get("answer", {}).get("formToken"):
            raise PaymentUnavailable(data.get("errorMessage") or "Respuesta inesperada de Izipay.")

        return PaymentSession(
            form_token=data["answer"]["formToken"],
            public_key=self.public_key,
            js_url=self.js_url,
            gateway=self.name,
        )

    @staticmethod
    def _verify_hash(raw_answer: str, received_hash: str, key: str) -> bool:
        expected = hmac.new(key.encode(), raw_answer.encode("utf-8"), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, received_hash)

    def _parse_signed_payload(self, body: dict, *, key: str, expected_hash_key: str) -> PaymentResult:
        raw_answer = body.get("kr-answer", "")
        received_hash = body.get("kr-hash", "")
        hash_key_label = body.get("kr-hash-key", "")

        # Confundir las dos claves es "el error clásico de esta integración"
        # (§8.4): si el proveedor dice que firmó con una clave distinta a la
        # que este canal espera, no confiamos en el resultado aunque el HMAC
        # coincidiera por casualidad con la clave equivocada.
        signature_valid = (
            bool(raw_answer and received_hash)
            and hash_key_label == expected_hash_key
            and self._verify_hash(raw_answer, received_hash, key)
        )

        answer = json.loads(raw_answer) if raw_answer else {}
        order_details = answer.get("orderDetails", {})
        transactions = answer.get("transactions", [{}])
        transaction = transactions[0] if transactions else {}

        return PaymentResult(
            order_code=order_details.get("orderId", ""),
            approved=answer.get("orderStatus") == "PAID",
            amount_cents=answer.get("orderTotalAmount", 0),
            currency=answer.get("currency", "PEN"),
            reference=transaction.get("uuid"),
            signature_valid=signature_valid,
            raw=answer,
        )

    def verify_browser_return(self, payload: dict) -> PaymentResult:
        # Regla de oro (§8.4): la firma se verifica sobre la cadena cruda de
        # `kr-answer` tal cual llegó, nunca sobre el JSON re-serializado.
        return self._parse_signed_payload(payload, key=self.hmac_key, expected_hash_key="sha256_hmac")

    def verify_ipn(self, request: HttpRequest) -> PaymentResult:
        raw = request.body.decode("utf-8")
        try:
            body = json.loads(raw)
        except ValueError:
            body = dict(request.POST)
        # El IPN servidor-a-servidor se firma con el password de la API REST,
        # no con la clave HMAC-SHA256 del navegador (ver tabla §8.4).
        return self._parse_signed_payload(body, key=self.rest_password, expected_hash_key="password")


def payments_disabled() -> bool:
    """`PAYMENT_GATEWAY=disabled`: la tienda no cobra ni crea órdenes. Sirve
    para publicar el sitio antes de tener la pasarela habilitada."""
    return settings.PAYMENT_GATEWAY == "disabled"


def get_gateway() -> PaymentGateway:
    if payments_disabled():
        # Falla cerrado: nunca caer en FakeGateway, que aprueba cualquier cosa.
        raise PaymentUnavailable("Los pagos están deshabilitados temporalmente.")
    if settings.PAYMENT_GATEWAY == "izipay":
        return IzipayGateway()
    return FakeGateway()


def amounts_match(order, result: PaymentResult) -> bool:
    expected_cents = int((order.total * 100).to_integral_value())
    return result.amount_cents == expected_cents and result.currency == order.currency
