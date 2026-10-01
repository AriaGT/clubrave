import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import DomainError
from apps.orders.models import Order
from apps.orders.services.fulfillment import mark_failed, mark_paid

from .gateways import MercadoPagoGateway, PaymentUnavailable, amounts_match, get_gateway
from .mercadopago import MercadoPagoError
from .models import PaymentEvent

logger = logging.getLogger(__name__)


def _apply_verified_result(order: Order, result) -> int:
    """Aplica un resultado **ya verificado** a la orden y devuelve el status
    HTTP con el que responderle a la pasarela.

    Se comparte entre todas las notificaciones servidor-a-servidor: lo único
    que cambia por proveedor es cómo se llega a un `PaymentResult` confiable.
    """
    if result.pending:
        # Efectivo o Yape sin pagar todavía, o un cobro autorizado sin
        # capturar: no se emiten entradas ni se libera la retención. Llegará
        # otra notificación cuando haya resultado.
        return 200

    if not amounts_match(order, result):
        logger.error("Notificación con importe discordante en %s", order.code)
        return 400

    try:
        if result.approved:
            mark_paid(order_id=order.id, gateway_reference=result.reference)
        else:
            mark_failed(order_id=order.id)
    except DomainError as exc:
        # Reglas de negocio (orden vencida sin cupo, estado no transicionable):
        # reintentar no cambiaría nada, así que se acusa recibo y se registra.
        logger.warning("No se pudo aplicar el pago de %s: %s", order.code, exc.code)

    return 200


class IzipayWebhookView(APIView):
    """IPN servidor-a-servidor: la fuente de verdad del pago (§8.4).

    Exento de autenticación por token: su autenticación **es** la firma.
    Devuelve 200 lo antes posible para cortar los reintentos del proveedor.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @csrf_exempt
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    @extend_schema(request=OpenApiTypes.OBJECT, responses={200: None, 400: None})
    def post(self, request, *args, **kwargs):
        try:
            gateway = get_gateway()
        except PaymentUnavailable:
            return Response(status=503)  # el proveedor reintenta más tarde
        result = gateway.verify_ipn(request)

        order = Order.objects.filter(code=result.order_code).first()
        # `get_or_create`: un IPN reintentado con el mismo `external_id` no
        # debe romper por la restricción de unicidad (es, precisamente, la
        # defensa contra procesarlo dos veces).
        PaymentEvent.objects.get_or_create(
            order=order,
            kind=PaymentEvent.Kind.IPN,
            external_id=result.reference,
            defaults={"signature_valid": result.signature_valid, "raw_payload": result.raw},
        )

        if not result.signature_valid:
            logger.warning("IPN con firma inválida para %s", result.order_code)
            return Response(status=400)

        if order is None:
            logger.error("IPN para una orden inexistente: %s", result.order_code)
            return Response(status=400)

        return Response(status=_apply_verified_result(order, result))


class MercadoPagoWebhookView(APIView):
    """Notificaciones de Mercado Pago (tópico `order`) para Checkout Pro.

    Su autenticación **es** la firma `x-signature`, no un token de sesión. El
    cuerpo de la notificación solo se usa para saber *qué* order consultar: el
    resultado del cobro se lee preguntándole a Mercado Pago (ver
    `MercadoPagoGateway.verify_ipn`).

    Mercado Pago espera 200/201 antes de 22 segundos; si no, reintenta.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @csrf_exempt
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    @extend_schema(request=OpenApiTypes.OBJECT, responses={200: None, 401: None, 503: None})
    def post(self, request, *args, **kwargs):
        try:
            gateway = get_gateway()
        except PaymentUnavailable:
            return Response(status=503)  # pagos deshabilitados: que reintente

        if not isinstance(gateway, MercadoPagoGateway):
            logger.error(
                "Webhook de Mercado Pago recibido con PAYMENT_GATEWAY=%s", settings.PAYMENT_GATEWAY
            )
            return Response(status=503)

        try:
            result = gateway.verify_ipn(request)
        except MercadoPagoError as exc:
            # No se pudo consultar la order: 503 para que Mercado Pago
            # reintente en lugar de dar la notificación por procesada.
            logger.warning("No se pudo consultar la order en Mercado Pago: %s", exc)
            return Response(status=503)

        if not result.signature_valid:
            logger.warning("Webhook de Mercado Pago con firma inválida (ref %s)", result.reference)
            return Response(status=401)

        order = Order.objects.filter(code=result.order_code).first()
        PaymentEvent.objects.get_or_create(
            order=order,
            kind=PaymentEvent.Kind.IPN,
            external_id=result.reference,
            defaults={"signature_valid": True, "raw_payload": result.raw},
        )

        if order is None:
            # Firma válida pero la orden no es nuestra: se acusa recibo para
            # que Mercado Pago no reintente indefinidamente.
            logger.error("Webhook para una orden inexistente: %s", result.order_code)
            return Response(status=200)

        return Response(status=_apply_verified_result(order, result))


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["POST"])
@permission_classes([AllowAny])
def confirm_from_browser(request, code: str):
    """El comprador volvió del checkout. No es el navegador el que decide.

    Con Izipay el navegador trae una respuesta firmada; con Mercado Pago no
    trae nada y la pasarela vuelve a consultar la order. En ambos casos el
    estado final sale de `gateway`, nunca de lo que diga el cliente.
    """
    order = get_object_or_404(Order, code=code)
    try:
        gateway = get_gateway()
    except PaymentUnavailable as exc:
        raise DomainError("PAYMENT_DISABLED") from exc

    try:
        result = gateway.verify_browser_return(order, request.data)
    except MercadoPagoError as exc:
        # El webhook cerrará la orden igual; la pantalla sigue sondeando.
        raise DomainError("PAYMENT_UNAVAILABLE", str(exc)) from exc

    PaymentEvent.objects.get_or_create(
        order=order,
        kind=PaymentEvent.Kind.BROWSER_RETURN,
        external_id=result.reference,
        defaults={"signature_valid": result.signature_valid, "raw_payload": result.raw},
    )

    if result.signature_valid and not result.pending and amounts_match(order, result):
        if result.approved:
            try:
                mark_paid(order_id=order.id, gateway_reference=result.reference)
            except DomainError:
                logger.warning("Retorno del navegador no pudo confirmar %s", order.code)
        else:
            try:
                mark_failed(order_id=order.id)
            except DomainError:
                logger.warning("Retorno del navegador no pudo rechazar %s", order.code)

    order.refresh_from_db()
    return Response({"status": order.status})
