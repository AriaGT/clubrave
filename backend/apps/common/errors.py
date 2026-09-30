"""Formato de error único de la API.

Toda respuesta de error tiene la forma:

    {"error": {"code": "SOLD_OUT", "message": "...", "details": {...}}}

`code` es un enum estable apto para lógica en el frontend; `message` es texto
listo para mostrar; `details` es opcional y específico del caso.
"""

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler

# Códigos de error del dominio (ver §5.3 del plan).
VALIDATION_ERROR = "VALIDATION_ERROR"
NOT_FOUND = "NOT_FOUND"
FORBIDDEN = "FORBIDDEN"
UNAUTHENTICATED = "UNAUTHENTICATED"
SOLD_OUT = "SOLD_OUT"
SALES_CLOSED = "SALES_CLOSED"
SALES_PAUSED = "SALES_PAUSED"
EVENT_NOT_PUBLISHED = "EVENT_NOT_PUBLISHED"
EVENT_CANCELLED = "EVENT_CANCELLED"
EVENT_HAS_SALES = "EVENT_HAS_SALES"
LAST_IMAGE = "LAST_IMAGE"
ORDER_EXPIRED = "ORDER_EXPIRED"
ORDER_ALREADY_PAID = "ORDER_ALREADY_PAID"
PAYMENT_REJECTED = "PAYMENT_REJECTED"
PAYMENT_UNAVAILABLE = "PAYMENT_UNAVAILABLE"
TICKET_ALREADY_USED = "TICKET_ALREADY_USED"
TICKET_INVALID = "TICKET_INVALID"
TICKET_WRONG_EVENT = "TICKET_WRONG_EVENT"
TICKET_NOT_VOIDABLE = "TICKET_NOT_VOIDABLE"
ORDER_NOT_VOIDABLE = "ORDER_NOT_VOIDABLE"
CHECKIN_NOT_UNDOABLE = "CHECKIN_NOT_UNDOABLE"
RATE_LIMITED = "RATE_LIMITED"

_STATUS_BY_CODE = {
    VALIDATION_ERROR: status.HTTP_400_BAD_REQUEST,
    NOT_FOUND: status.HTTP_404_NOT_FOUND,
    FORBIDDEN: status.HTTP_403_FORBIDDEN,
    UNAUTHENTICATED: status.HTTP_401_UNAUTHORIZED,
    SOLD_OUT: status.HTTP_409_CONFLICT,
    SALES_CLOSED: status.HTTP_409_CONFLICT,
    SALES_PAUSED: status.HTTP_409_CONFLICT,
    EVENT_NOT_PUBLISHED: status.HTTP_409_CONFLICT,
    EVENT_CANCELLED: status.HTTP_409_CONFLICT,
    EVENT_HAS_SALES: status.HTTP_409_CONFLICT,
    LAST_IMAGE: status.HTTP_409_CONFLICT,
    ORDER_EXPIRED: status.HTTP_409_CONFLICT,
    ORDER_ALREADY_PAID: status.HTTP_409_CONFLICT,
    PAYMENT_REJECTED: status.HTTP_402_PAYMENT_REQUIRED,
    PAYMENT_UNAVAILABLE: status.HTTP_503_SERVICE_UNAVAILABLE,
    TICKET_ALREADY_USED: status.HTTP_409_CONFLICT,
    TICKET_INVALID: status.HTTP_404_NOT_FOUND,
    TICKET_WRONG_EVENT: status.HTTP_409_CONFLICT,
    TICKET_NOT_VOIDABLE: status.HTTP_409_CONFLICT,
    ORDER_NOT_VOIDABLE: status.HTTP_409_CONFLICT,
    CHECKIN_NOT_UNDOABLE: status.HTTP_409_CONFLICT,
    RATE_LIMITED: status.HTTP_429_TOO_MANY_REQUESTS,
}

_DEFAULT_MESSAGES = {
    VALIDATION_ERROR: "Los datos enviados no son válidos.",
    NOT_FOUND: "No se encontró el recurso solicitado.",
    FORBIDDEN: "No tienes permiso para realizar esta acción.",
    UNAUTHENTICATED: "Debes iniciar sesión.",
    SOLD_OUT: "No quedan entradas suficientes.",
    SALES_CLOSED: "La venta de este tipo de entrada no está abierta.",
    SALES_PAUSED: "La venta de este evento está pausada temporalmente.",
    EVENT_NOT_PUBLISHED: "Este evento no está publicado.",
    EVENT_CANCELLED: "Este evento fue cancelado y no se puede modificar.",
    EVENT_HAS_SALES: "Este evento ya tiene ventas.",
    LAST_IMAGE: "Un evento publicado necesita al menos un flyer.",
    ORDER_EXPIRED: "La orden venció.",
    ORDER_ALREADY_PAID: "La orden ya fue pagada.",
    PAYMENT_REJECTED: "El pago fue rechazado.",
    PAYMENT_UNAVAILABLE: "La pasarela de pago no está disponible.",
    TICKET_ALREADY_USED: "Esta entrada ya fue utilizada.",
    TICKET_INVALID: "Entrada inválida.",
    TICKET_WRONG_EVENT: "Esta entrada corresponde a otro evento.",
    TICKET_NOT_VOIDABLE: "Esta entrada no se puede anular.",
    ORDER_NOT_VOIDABLE: "Esta orden no se puede anular.",
    CHECKIN_NOT_UNDOABLE: "Este ingreso no se puede deshacer.",
    RATE_LIMITED: "Demasiadas solicitudes. Intenta de nuevo más tarde.",
}


class DomainError(APIException):
    """Error de negocio con código estable, mensaje y detalles opcionales."""

    def __init__(self, code: str, message: str | None = None, details: dict | None = None):
        self.code = code
        self.message = message or _DEFAULT_MESSAGES.get(code, "Ocurrió un error.")
        self.details = details or {}
        self.status_code = _STATUS_BY_CODE.get(code, status.HTTP_400_BAD_REQUEST)
        super().__init__(detail=self.message, code=code)

    def as_response(self) -> Response:
        return Response(
            {"error": {"code": self.code, "message": self.message, "details": self.details}},
            status=self.status_code,
        )


def api_exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return exc.as_response()

    response = exception_handler(exc, context)
    if response is None:
        return None

    # Homogeneiza las excepciones estándar de DRF al mismo `shape`.
    code = VALIDATION_ERROR
    if response.status_code == status.HTTP_404_NOT_FOUND:
        code = NOT_FOUND
    elif response.status_code == status.HTTP_403_FORBIDDEN:
        code = FORBIDDEN
    elif response.status_code == status.HTTP_401_UNAUTHORIZED:
        code = UNAUTHENTICATED
    elif response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        code = RATE_LIMITED

    message = _DEFAULT_MESSAGES.get(code, "Ocurrió un error.")
    details = response.data if isinstance(response.data, (dict, list)) else {}
    response.data = {"error": {"code": code, "message": message, "details": details}}
    return response
