from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import CanScan, IsOrganizer
from apps.orders.models import Ticket
from apps.orders.serializers import TicketSerializer

from . import services
from .door import ensure_door_can_scan, record_door_check_in
from .serializers import CheckInRequestSerializer, CheckInResponseSerializer, UndoCheckInSerializer


class CheckInView(APIView):
    # Organizador o personal de seguridad (este último con ventana horaria y
    # eventos asignados: ver apps/checkin/door.py).
    permission_classes = [CanScan]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkin"

    @extend_schema(request=CheckInRequestSerializer, responses=CheckInResponseSerializer)
    @transaction.atomic  # el check-in y su línea de bitácora van juntos
    def post(self, request):
        ensure_door_can_scan(request, request.data.get("event_id"))
        result = services.check_in(
            qr_payload=request.data.get("qr_payload") or None,
            manual_code=request.data.get("manual_code") or None,
            event_id=request.data.get("event_id"),
            organization_id=request.auth["organization_id"],
            actor=request.user,
        )
        record_door_check_in(request, result.ticket, via="qr" if request.data.get("qr_payload") else "manual")
        return Response(
            {
                "result": "OK",
                "ticket": {
                    "code": result.ticket.code,
                    "ticket_type_name": result.ticket.ticket_type.name,
                    "holder_name": result.ticket.holder_name,
                    "order_code": result.ticket.order.code,
                    "checked_in_at": result.ticket.checked_in_at,
                    "is_guest": result.ticket.order.is_guest,
                },
            }
        )


class CheckInLookupView(APIView):
    permission_classes = [CanScan]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkin"

    @extend_schema(
        parameters=[
            OpenApiParameter("qr_payload", str, required=False),
            OpenApiParameter("manual_code", str, required=False),
            OpenApiParameter("event_id", str, required=True),
        ],
        responses=TicketSerializer,
    )
    def get(self, request):
        ensure_door_can_scan(request, request.query_params.get("event_id"))
        ticket = services.lookup(
            qr_payload=request.query_params.get("qr_payload") or None,
            manual_code=request.query_params.get("manual_code") or None,
            event_id=request.query_params.get("event_id"),
            organization_id=request.auth["organization_id"],
        )
        return Response(TicketSerializer(ticket).data)


class UndoCheckInView(APIView):
    """H13 — deshacer un ingreso escaneado por error (`CHECKED_IN` → `VALID`).

    Solo el organizador: el personal de seguridad no puede reabrir una
    entrada usada (evita que alguien en puerta la "recicle")."""

    permission_classes = [IsOrganizer]

    @extend_schema(request=UndoCheckInSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, code):
        ticket = get_object_or_404(
            Ticket.objects.select_related("order__event__organization").filter(
                order__event__organization_id=request.auth["organization_id"]
            ),
            code=code,
        )
        serializer = UndoCheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.undo_check_in(
            ticket=ticket, actor=request.user, **serializer.validated_data
        )
        return Response(result)
