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
from decimal import Decimal
from typing import Protocol

import requests
from django.conf import settings
from django.http import HttpRequest

from .mercadopago import MercadoPagoClient, MercadoPagoError

logger = logging.getLogger(__name__)


class PaymentUnavailable(Exception):
    """La pasarela no respondió o no está configurada. Nunca se crea una
    orden pagada sin cobro real: se traduce a 503 PAYMENT_UNAVAILABLE."""


@dataclass(frozen=True)
class PaymentSession:
    """Lo que el navegador necesita para pagar. Según el proveedor se llena
    una de las dos mitades: el formulario incrustado (Izipay) o la URL a la
    que redirigir (Mercado Pago Checkout Pro)."""

    gateway: str
    form_token: str = ""
    public_key: str = ""
    js_url: str = ""
    checkout_url: str = ""
    # Id de la orden del lado del proveedor. Se persiste en la orden para
    # poder volver a consultarle el resultado; nunca se expone por la API.
    provider_order_id: str = ""


@dataclass(frozen=True)
class PaymentResult:
    order_code: str
    approved: bool
    amount_cents: int
    currency: str
    reference: str | None
    signature_valid: bool
    raw: dict = field(default_factory=dict)
    # Todavía sin resultado (efectivo o Yape sin pagar, captura pendiente): no
    # se emiten entradas, pero tampoco se libera el inventario retenido.
    pending: bool = False


class PaymentGateway(Protocol):
    name: str

    def create_session(self, order) -> PaymentSession:
        """Pide al proveedor una sesión de pago para esta orden."""

    def verify_browser_return(self, order, payload: dict) -> PaymentResult:
        """Resuelve el resultado cuando el comprador vuelve a la tienda.

        Recibe la orden porque en los flujos con redirección el navegador no
        trae nada firmado: lo único confiable es volver a preguntarle al
        proveedor por la orden que nosotros creamos."""

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

    def verify_browser_return(self, order, payload: dict) -> PaymentResult:
        # El importe sale de la orden, no del payload: así el simulador pasa
        # la misma validación de importes que una pasarela real y el botón de
        # «rechazado» ejercita de verdad el camino de inventario liberado.
        return PaymentResult(
            order_code=order.code,
            approved=payload.get("approved", True),
            amount_cents=int((order.total * 100).to_integral_value()),
            currency=order.currency,
            reference=f"fake-ref-{order.code}",
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

    def __init__(self, credentials: dict[str, str]):
        # Credenciales descifradas de la configuración del panel (ver providers.py).
        self.shop_id = credentials.get("shop_id", "")
        self.rest_password = credentials.get("rest_password", "")
        self.public_key = credentials.get("public_key", "")
        self.hmac_key = credentials.get("hmac_key", "")
        self.rest_url = settings.IZIPAY_REST_URL
        self.js_url = settings.IZIPAY_JS_URL

    @staticmethod
    def _customer(order) -> dict:
        """Datos del comprador: 3-D Secure 2 los pide para autenticar la tarjeta."""
        first_name, _, last_name = order.buyer_name.strip().partition(" ")
        billing = {"firstName": first_name, "lastName": last_name or first_name, "country": "PE"}
        if order.buyer_phone:
            billing["phoneNumber"] = order.buyer_phone
        if order.buyer_document:
            billing["identityCode"] = order.buyer_document
        return {"email": order.buyer_email, "billingDetails": billing}

    def create_session(self, order) -> PaymentSession:
        if not (self.shop_id and self.rest_password and self.public_key and self.hmac_key and self.js_url):
            raise PaymentUnavailable("Izipay no está configurado (faltan credenciales).")

        auth = base64.b64encode(f"{self.shop_id}:{self.rest_password}".encode()).decode()
        body = {
            "amount": int((order.total * 100).to_integral_value()),  # céntimos enteros
            "currency": order.currency,
            "orderId": order.code,
            "customer": self._customer(order),
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

        approved = answer.get("orderStatus") == "PAID"
        # Importe y moneda viven dentro de `orderDetails` (objeto V4/Payment),
        # tanto en la respuesta al navegador como en el IPN.
        return PaymentResult(
            order_code=order_details.get("orderId", ""),
            approved=approved,
            amount_cents=order_details.get("orderTotalAmount", 0),
            currency=order_details.get("orderCurrency", ""),
            reference=transaction.get("uuid"),
            signature_valid=signature_valid,
            raw=answer,
            # Un rechazo con `orderCycle: OPEN` no es final: el formulario deja
            # reintentar con otra tarjeta. Tratarlo como FAILED liberaría la
            # retención y un segundo intento aprobado quedaría cobrado sin
            # entradas.
            pending=not approved and answer.get("orderCycle") == "OPEN",
        )

    @staticmethod
    def _browser_payload(payload: dict) -> dict:
        """El mismo resultado firmado llega con dos formas según quién lo envíe:
        el callback `KR.onSubmit` del formulario incrustado entrega
        `{rawClientAnswer, hash, hashKey}`, y el POST de `kr-post-url-success`
        entrega `{kr-answer, kr-hash, kr-hash-key}`. Se lleva todo a la segunda
        forma; la verificación posterior es idéntica para ambas."""
        if "rawClientAnswer" in payload:
            return {
                "kr-answer": payload.get("rawClientAnswer") or "",
                "kr-hash": payload.get("hash") or "",
                "kr-hash-key": payload.get("hashKey") or "",
            }
        return payload

    def verify_browser_return(self, order, payload: dict) -> PaymentResult:
        # Regla de oro (§8.4): la firma se verifica sobre la cadena cruda de
        # `kr-answer` tal cual llegó, nunca sobre el JSON re-serializado.
        return self._parse_signed_payload(
            self._browser_payload(payload), key=self.hmac_key, expected_hash_key="sha256_hmac"
        )

    def verify_ipn(self, request: HttpRequest) -> PaymentResult:
        raw = request.body.decode("utf-8")
        try:
            body = json.loads(raw)
        except ValueError:
            # Izipay envía el IPN como formulario. `.dict()` y no `dict(...)`:
            # este último deja cada valor como lista y la firma nunca valida.
            body = request.POST.dict()
        # El IPN servidor-a-servidor se firma con el password de la API REST,
        # no con la clave HMAC-SHA256 del navegador (ver tabla §8.4).
        return self._parse_signed_payload(body, key=self.rest_password, expected_hash_key="password")


class MercadoPagoGateway:
    """Checkout Pro con redirección, sobre la Orders API.

    La diferencia de fondo con Izipay: aquí el navegador no trae nada firmado
    al volver del checkout. Tanto el retorno del comprador como el webhook se
    resuelven volviendo a consultarle a Mercado Pago la order que nosotros
    creamos, así que el estado de la venta nunca depende de que el comprador
    haya aterrizado en `success_url` (ni de que haya vuelto en absoluto).
    """

    name = "mercadopago"

    def __init__(self, credentials: dict[str, str]):
        self.client = MercadoPagoClient(
            access_token=credentials.get("access_token", ""),
            webhook_secret=credentials.get("webhook_secret", ""),
            api_base_url=settings.MERCADOPAGO_API_BASE_URL,
        )

    @staticmethod
    def _money(value) -> str:
        """Mercado Pago espera importes como cadena con dos decimales."""
        return str(Decimal(value).quantize(Decimal("0.01")))

    def _items(self, order) -> list[dict]:
        """El `total_amount` de la order debe ser exactamente la suma de
        `unit_price × quantity` de los ítems, así que la comisión de servicio
        (hoy siempre 0, punto de extensión en `services/checkout.py`) viaja
        como una línea más y no como un ajuste aparte."""
        items = [
            {
                "title": item.ticket_type_name,
                "unit_price": self._money(item.unit_price),
                "quantity": item.quantity,
                "unit_measure": "unit",
                "total_amount": self._money(item.subtotal),
            }
            for item in order.items.all()
        ]
        if order.service_fee > 0:
            items.append(
                {
                    "title": "Cargo por servicio",
                    "unit_price": self._money(order.service_fee),
                    "quantity": 1,
                    "unit_measure": "unit",
                    "total_amount": self._money(order.service_fee),
                }
            )
        return items

    def create_session(self, order) -> PaymentSession:
        if not self.client.access_token:
            raise PaymentUnavailable("Mercado Pago no está configurado (falta el access token).")

        # Las tres URLs vuelven a la misma pantalla de pago con el resultado
        # como pista: esa pantalla pregunta al backend y el backend a Mercado
        # Pago, de modo que el parámetro de la URL no decide nada.
        base = f"{settings.FRONTEND_STORE_URL.rstrip('/')}/checkout/{order.code}/pay"
        payload = {
            "type": "online",
            "processing_mode": settings.MERCADOPAGO_PROCESSING_MODE,
            "total_amount": self._money(order.total),
            "external_reference": order.code,
            "description": order.event.title,
            # La order de Mercado Pago vence cuando vence la nuestra. Sin esto
            # su vigencia por defecto es de un día: el comprador podría pagar
            # horas después, con la retención de inventario ya liberada y el
            # cupo revendido.
            "expiration_time": f"PT{settings.ORDER_HOLD_MINUTES}M",
            "payer": {"email": order.buyer_email},
            "items": self._items(order),
            "config": {
                "online": {
                    "success_url": f"{base}?mp=success",
                    "failure_url": f"{base}?mp=failure",
                    "pending_url": f"{base}?mp=pending",
                    "auto_return": "all",
                }
            },
        }

        try:
            # Clave de idempotencia atada al código de orden: un doble clic en
            # «Pagar» reusa la order de Mercado Pago en lugar de abrir un
            # segundo cobro por lo mismo.
            mp_order = self.client.create_order(payload, idempotency_key=f"clubrave-order-{order.code}")
        except MercadoPagoError as exc:
            raise PaymentUnavailable(str(exc)) from exc

        return PaymentSession(
            gateway=self.name,
            checkout_url=mp_order.checkout_url,
            provider_order_id=mp_order.id,
        )

    def _result_from(self, mp_order, *, order_code: str, signature_valid: bool) -> PaymentResult:
        amount = mp_order.total_amount or Decimal("0")
        return PaymentResult(
            order_code=order_code or mp_order.external_reference,
            approved=mp_order.is_paid,
            pending=mp_order.is_pending,
            amount_cents=int((amount * 100).to_integral_value()),
            # Mercado Pago no siempre repite la moneda al consultar la order;
            # la cuenta es de un solo país, así que el respaldo es su moneda.
            currency=mp_order.currency or settings.MERCADOPAGO_CURRENCY,
            reference=mp_order.payment_reference or mp_order.id,
            signature_valid=signature_valid,
            raw=mp_order.raw,
        )

    def verify_browser_return(self, order, payload: dict) -> PaymentResult:
        """El `payload` del navegador se ignora a propósito: lo único que
        significa es «el comprador volvió». El resultado sale de consultar la
        order a Mercado Pago."""
        if not order.gateway_order_id:
            # Nunca se abrió sesión de pago con Mercado Pago para esta orden.
            return PaymentResult(
                order_code=order.code,
                approved=False,
                pending=True,
                amount_cents=0,
                currency=order.currency,
                reference=None,
                signature_valid=False,
            )

        mp_order = self.client.get_order(order.gateway_order_id)
        return self._result_from(mp_order, order_code=order.code, signature_valid=True)

    def verify_ipn(self, request: HttpRequest) -> PaymentResult:
        # El manifest de la firma se arma con el `data.id` de los *query
        # params*, no con el del cuerpo (ver mercadopago.build_signature_manifest).
        query_data_id = request.GET.get("data.id", "")
        signature_valid = self.client.validate_webhook_signature(
            x_signature=request.headers.get("x-signature", ""),
            x_request_id=request.headers.get("x-request-id", ""),
            data_id=query_data_id,
        )

        try:
            body = json.loads(request.body.decode("utf-8") or "{}")
        except ValueError:
            body = {}

        mp_order_id = query_data_id or str((body.get("data") or {}).get("id") or "")

        if not signature_valid:
            # Sin firma válida no se consulta nada: el view responde 401 y la
            # orden queda intacta.
            return PaymentResult(
                order_code="",
                approved=False,
                amount_cents=0,
                currency="",
                reference=mp_order_id or None,
                signature_valid=False,
                raw=body,
            )

        if not mp_order_id:
            # Firma válida pero no dice qué order consultar: no hay nada que
            # hacer y reintentar no cambiaría nada.
            logger.error("Notificación de Mercado Pago sin `data.id`.")
            return PaymentResult(
                order_code="",
                approved=False,
                amount_cents=0,
                currency="",
                reference=None,
                signature_valid=True,
                raw=body,
            )

        mp_order = self.client.get_order(mp_order_id)
        return self._result_from(mp_order, order_code=mp_order.external_reference, signature_valid=True)


def payments_disabled() -> bool:
    """No hay ningún medio con el que cobrar (modo «deshabilitado», o modo
    real sin pasarelas activas): la tienda no crea órdenes."""
    from .providers import checkout_methods

    return not checkout_methods()


GATEWAY_CLASSES = {"izipay": IzipayGateway, "mercadopago": MercadoPagoGateway}


def get_gateway(name: str, *, for_checkout: bool = False) -> PaymentGateway:
    """La pasarela `name` con sus credenciales guardadas.

    `for_checkout=True` exige que el medio esté habilitado ahora mismo (abrir
    una sesión de pago nueva). Sin él basta con que tenga credenciales: un
    IPN o un retorno tardío de una orden creada antes de desactivar el medio
    igual debe poder cerrarse.

    Falla cerrado: el simulador solo existe en modo «fake», nunca como
    respaldo de una pasarela real que falte o esté mal configurada.
    """
    from .crypto import CredentialsKeyMissing, CredentialsUnreadable
    from .models import PaymentProvider, PaymentSettings
    from .providers import FAKE, checkout_methods, credentials_of

    config = PaymentSettings.load()
    if config.mode == PaymentSettings.Mode.DISABLED:
        raise PaymentUnavailable("Los pagos están deshabilitados temporalmente.")
    if name == FAKE:
        if config.mode != PaymentSettings.Mode.FAKE:
            raise PaymentUnavailable("El simulador de pagos no está activo.")
        return FakeGateway()
    if name not in GATEWAY_CLASSES:
        raise PaymentUnavailable(f"Medio de pago desconocido: {name}.")
    if for_checkout and name not in checkout_methods():
        raise PaymentUnavailable(f"El medio de pago {name} no está habilitado.")

    row = PaymentProvider.objects.filter(provider=name).exclude(credentials="").first()
    if row is None:
        raise PaymentUnavailable(f"{name} no tiene credenciales configuradas.")
    try:
        credentials = credentials_of(row)
    except (CredentialsKeyMissing, CredentialsUnreadable) as exc:
        logger.error("No se pudieron leer las credenciales de %s: %s", name, exc)
        raise PaymentUnavailable(str(exc)) from exc
    return GATEWAY_CLASSES[name](credentials)


def amounts_match(order, result: PaymentResult) -> bool:
    expected_cents = int((order.total * 100).to_integral_value())
    return result.amount_cents == expected_cents and result.currency == order.currency
