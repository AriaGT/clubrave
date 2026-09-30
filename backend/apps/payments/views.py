import logging

from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order
from apps.orders.services.fulfillment import mark_failed, mark_paid

from .gateways import amounts_match, get_gateway
from .models import PaymentEvent

logger = logging.getLogger(__name__)


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
        gateway = get_gateway()
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

        if not amounts_match(order, result):
            logger.error("IPN con importe discordante en %s", order.code)
            return Response(status=400)

        if result.approved:
            mark_paid(order_id=order.id, gateway_reference=result.reference)
        else:
            mark_failed(order_id=order.id)

        return Response(status=200)


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["POST"])
@permission_classes([AllowAny])
def confirm_from_browser(request, code: str):
    """Retorno del navegador: feedback inmediato, NO autoritativo (§7.2)."""
    order = get_object_or_404(Order, code=code)
    gateway = get_gateway()
    result = gateway.verify_browser_return(request.data)

    PaymentEvent.objects.get_or_create(
        order=order,
        kind=PaymentEvent.Kind.BROWSER_RETURN,
        external_id=result.reference,
        defaults={"signature_valid": result.signature_valid, "raw_payload": result.raw},
    )

    if result.signature_valid and result.approved:
        mark_paid(order_id=order.id, gateway_reference=result.reference)

    order.refresh_from_db()
    return Response({"status": order.status})
