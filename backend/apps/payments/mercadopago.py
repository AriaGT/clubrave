"""Cliente de Mercado Pago — Checkout Pro sobre la Orders API.

Este módulo habla HTTP con Mercado Pago y valida firmas de webhook. No conoce
Django ni los modelos del proyecto: recibe y devuelve tipos planos. Es la
pieza pensada para extraerse tal cual a `@arialabs/payments`; el acoplamiento
con la ticketera vive en `gateways.MercadoPagoGateway`.

Referencias (documentación oficial, consultada el 2026-10-01):
- Crear order:      /developers/es/docs/checkout-pro-orders/create-order
- URLs de retorno:  /developers/es/docs/checkout-pro-orders/web-integration/configure-back-urls
- Notificaciones:   /developers/es/docs/checkout-pro-orders/notifications
- Estados:          /developers/es/docs/checkout-api-orders/payment-management/status/order-status
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass, field
from decimal import Decimal

import requests

logger = logging.getLogger(__name__)

API_BASE_URL = "https://api.mercadopago.com"

# `status` de una order que significan "el dinero entró".
PAID_STATUSES = frozenset({"processed"})

# Todavía no hay resultado: no se emiten entradas ni se libera el inventario.
# `action_required` incluye `waiting_payment` (efectivo/Yape pendiente) y
# `waiting_capture` (autorizado sin capturar): ninguno es un cobro cerrado.
PENDING_STATUSES = frozenset({"created", "processing", "action_required"})

# El cobro no va a ocurrir: se libera el inventario retenido.
FAILED_STATUSES = frozenset({"canceled", "expired", "failed"})

# `refunded` y `charged_back` no son el resultado de un cobro nuevo: la orden
# ya estaba pagada y el dinero se mueve después. No tocan el estado de la
# venta (el reembolso se registra aparte, ver H09).


class MercadoPagoError(Exception):
    """Mercado Pago no respondió, o respondió algo que no sabemos leer."""


@dataclass(frozen=True)
class MercadoPagoOrder:
    """Lo que nos interesa de una order de Mercado Pago."""

    id: str
    status: str
    status_detail: str
    external_reference: str
    total_amount: Decimal | None
    currency: str
    checkout_url: str
    payment_reference: str | None
    # Cuenta de Mercado Pago que cobra. Sirve para confirmar que el dinero va
    # a la cuenta del organizador y no a la del integrador.
    user_id: str = ""
    raw: dict = field(default_factory=dict)

    @property
    def is_paid(self) -> bool:
        return self.status in PAID_STATUSES

    @property
    def is_pending(self) -> bool:
        return self.status in PENDING_STATUSES

    @property
    def is_failed(self) -> bool:
        return self.status in FAILED_STATUSES


def _decimal_or_none(value) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (ArithmeticError, ValueError):
        return None


def _first_payment_id(data: dict) -> str | None:
    """`transactions.payments[].id` — la referencia que el organizador cruza
    contra el reporte de Mercado Pago."""
    payments = (data.get("transactions") or {}).get("payments") or []
    for payment in payments:
        if payment.get("id"):
            return str(payment["id"])
    return None


def _error_detail(data: dict) -> str:
    """Mercado Pago devuelve los errores en dos formas según el endpoint: un
    `message` suelto o una lista en `errors`. Perder este texto convierte un
    diagnóstico de un minuto en una tarde de pruebas a ciegas."""
    errors = data.get("errors")
    if isinstance(errors, list) and errors:
        first = errors[0] if isinstance(errors[0], dict) else {}
        code = first.get("code")
        message = first.get("message") or ""
        return f"{code}: {message}".strip(": ") if code else message or "sin detalle"
    return data.get("message") or data.get("error") or "sin detalle"


def parse_order(data: dict) -> MercadoPagoOrder:
    return MercadoPagoOrder(
        id=str(data.get("id") or ""),
        status=data.get("status") or "",
        status_detail=data.get("status_detail") or "",
        external_reference=data.get("external_reference") or "",
        total_amount=_decimal_or_none(data.get("total_amount")),
        currency=data.get("currency") or data.get("currency_id") or "",
        checkout_url=data.get("checkout_url") or "",
        payment_reference=_first_payment_id(data),
        user_id=str(data.get("user_id") or ""),
        raw=data,
    )


def build_signature_manifest(*, data_id: str, request_id: str, ts: str) -> str:
    """Plantilla `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.

    Dos reglas de la documentación que son fáciles de pasar por alto y rompen
    la validación en silencio: el `data.id` va en minúsculas (los ids de la
    Orders API vienen como `ORD01...`), y cualquier componente ausente se
    **omite** del manifest en lugar de quedar vacío.
    """
    parts = []
    if data_id:
        parts.append(f"id:{data_id.lower()};")
    if request_id:
        parts.append(f"request-id:{request_id};")
    if ts:
        parts.append(f"ts:{ts};")
    return "".join(parts)


def parse_signature_header(x_signature: str) -> tuple[str, str]:
    """Devuelve `(ts, v1)` del header `x-signature`: `ts=...,v1=...`."""
    ts = received = ""
    for chunk in (x_signature or "").split(","):
        key, _, value = chunk.partition("=")
        key, value = key.strip(), value.strip()
        if key == "ts":
            ts = value
        elif key == "v1":
            received = value
    return ts, received


class MercadoPagoClient:
    def __init__(
        self,
        *,
        access_token: str,
        webhook_secret: str = "",
        api_base_url: str = API_BASE_URL,
        timeout: tuple[int, int] = (5, 15),
    ):
        self.access_token = access_token
        self.webhook_secret = webhook_secret
        self.api_base_url = api_base_url.rstrip("/")
        self.timeout = timeout  # conectar / leer: nunca sin timeout

    def _request(
        self, method: str, path: str, *, json_body: dict | None = None, idempotency_key: str = ""
    ) -> dict:
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if idempotency_key:
            headers["X-Idempotency-Key"] = idempotency_key

        try:
            response = requests.request(
                method, f"{self.api_base_url}{path}", json=json_body, headers=headers, timeout=self.timeout
            )
        except requests.RequestException as exc:
            raise MercadoPagoError(f"No se pudo contactar a Mercado Pago: {exc}") from exc

        try:
            data = response.json()
        except ValueError:
            data = {}

        if response.status_code >= 400:
            # Se expone el motivo pero nunca el cuerpo completo ni el token.
            raise MercadoPagoError(
                f"Mercado Pago rechazó la solicitud ({response.status_code}): {_error_detail(data)}"
            )

        return data if isinstance(data, dict) else {}

    def create_order(self, payload: dict, *, idempotency_key: str) -> MercadoPagoOrder:
        """`POST /v1/orders`. La clave de idempotencia hace que reintentar
        esta llamada para la misma orden devuelva la order ya creada en lugar
        de abrir un segundo cobro."""
        data = self._request("POST", "/v1/orders", json_body=payload, idempotency_key=idempotency_key)
        order = parse_order(data)
        if not order.id or not order.checkout_url:
            raise MercadoPagoError("La respuesta de Mercado Pago no trae `id` o `checkout_url`.")
        return order

    def get_order(self, order_id: str) -> MercadoPagoOrder:
        """`GET /v1/orders/{id}` — la única fuente de verdad del cobro.

        Ni el retorno del navegador ni el cuerpo del webhook deciden si una
        orden está pagada: los dos caminos terminan preguntando aquí.
        """
        return parse_order(self._request("GET", f"/v1/orders/{order_id}"))

    def validate_webhook_signature(self, *, x_signature: str, x_request_id: str, data_id: str) -> bool:
        """HMAC-SHA256 del manifest con la clave secreta de la aplicación.

        No se valida la antigüedad del `ts`: Mercado Pago reintenta una
        notificación hasta 96 horas y descartar un reintento legítimo dejaría
        la venta sin cerrar. La defensa contra la repetición no es el reloj
        sino que procesar dos veces es inocuo — se vuelve a consultar la order
        y `mark_paid` es idempotente.
        """
        if not self.webhook_secret:
            logger.error("MERCADOPAGO_WEBHOOK_SECRET vacío: no se puede validar el webhook.")
            return False  # falla cerrado

        ts, received = parse_signature_header(x_signature)
        if not (ts and received):
            return False

        manifest = build_signature_manifest(data_id=data_id, request_id=x_request_id, ts=ts)
        expected = hmac.new(
            self.webhook_secret.encode(), manifest.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, received)
