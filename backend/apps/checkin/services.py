from dataclasses import dataclass
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.models import AuditLog
from apps.orders.models import Order, Ticket
from apps.orders.services.codes import verify_qr_payload

UNDO_REASON_CODES = ["MISTAKE", "DOUBLE_SCAN", "OTHER"]
UNDO_REASON_LABELS = {
    "MISTAKE": "Escaneo por error",
    "DOUBLE_SCAN": "Doble escaneo",
    "OTHER": "Otro",
}


@dataclass
class CheckInResult:
    ticket: Ticket
    just_checked_in: bool


def _resolve_code(*, qr_payload: str | None, manual_code: str | None) -> str:
    """El escáner manda `qr_payload` firmado; la entrada manual del código
    (§10.5: "cámaras rotas, pantallas rotas y baterías al 2% existen") manda
    el código de 22 caracteres tal cual, sin firma — es impracticable de
    teclear con la firma completa. La firma solo defiende contra un QR
    fotografiado o inventado; el personal que teclea ya se autenticó con su
    propio JWT de organizador, así que no hace falta exigírsela también al
    código."""
    if qr_payload:
        return verify_qr_payload(qr_payload)  # firma HMAC: rechaza sin tocar la base de datos
    if manual_code:
        return manual_code.strip().upper()
    raise DomainError("VALIDATION_ERROR", "Falta el código o el QR escaneado.")


@transaction.atomic
def check_in(
    *,
    qr_payload: str | None = None,
    manual_code: str | None = None,
    event_id: UUID,
    organization_id,
    actor,
) -> CheckInResult:
    code = _resolve_code(qr_payload=qr_payload, manual_code=manual_code)

    try:
        ticket = (
            Ticket.objects.select_for_update()
            .select_related("order", "ticket_type", "order__event")
            .get(code=code)
        )
    except Ticket.DoesNotExist:
        raise DomainError("TICKET_INVALID") from None

    event = ticket.order.event
    if str(event.organization_id) != str(organization_id):
        raise DomainError("TICKET_INVALID")  # mismo error que inexistente: no se filtra nada
    if str(event.id) != str(event_id):
        raise DomainError("TICKET_WRONG_EVENT", details={"event_title": event.title})
    if ticket.order.status != Order.Status.PAID or ticket.status == Ticket.Status.VOID:
        raise DomainError("TICKET_INVALID")
    if ticket.status == Ticket.Status.CHECKED_IN:
        raise DomainError(
            "TICKET_ALREADY_USED",
            details={
                "ticket_code": ticket.code,
                "checked_in_at": ticket.checked_in_at.isoformat() if ticket.checked_in_at else None,
                "checked_in_by": ticket.checked_in_by_email,
                "ticket_type_name": ticket.ticket_type.name,
                "is_guest": ticket.order.is_guest,
            },
        )

    ticket.status = Ticket.Status.CHECKED_IN
    ticket.checked_in_at = timezone.now()
    ticket.checked_in_by = actor
    ticket.save(update_fields=["status", "checked_in_at", "checked_in_by"])
    return CheckInResult(ticket=ticket, just_checked_in=True)


@transaction.atomic
def undo_check_in(*, ticket: Ticket, actor, reason_code: str = "", reason: str = "") -> dict:
    """Deshace un ingreso escaneado por error (H13).

    La entrada vuelve a `VALID` con `checked_in_at` y `checked_in_by` en
    blanco; el check-in anterior (hora y quién) queda guardado en la
    bitácora para que el dato no se pierda. Solo aplica sobre `CHECKED_IN`:
    deshacer algo que no ingresó no tiene sentido.
    """
    if reason_code not in UNDO_REASON_CODES:
        raise DomainError("VALIDATION_ERROR", "Debes elegir un motivo para deshacer el ingreso.")

    ticket = (
        Ticket.objects.select_for_update()
        .select_related("order__event__organization")
        .get(pk=ticket.pk)
    )

    if ticket.status != Ticket.Status.CHECKED_IN:
        raise DomainError("CHECKIN_NOT_UNDOABLE")

    previous = {
        "checked_in_at": ticket.checked_in_at.isoformat() if ticket.checked_in_at else None,
        "checked_in_by": ticket.checked_in_by_email,
    }

    ticket.status = Ticket.Status.VALID
    ticket.checked_in_at = None
    ticket.checked_in_by = None
    ticket.save(update_fields=["status", "checked_in_at", "checked_in_by", "updated_at"])

    record(
        actor=actor,
        organization=ticket.order.event.organization,
        action=AuditLog.Action.CHECKIN_UNDONE,
        target=ticket,
        event=ticket.order.event,
        reason=reason or UNDO_REASON_LABELS.get(reason_code, ""),
        order_code=ticket.order.code,
        previous_check_in=previous,
    )
    return {
        "ticket_code": ticket.code,
        "order_code": ticket.order.code,
        "status": Ticket.Status.VALID,
        "previous_check_in": previous,
    }


def lookup(
    *, qr_payload: str | None = None, manual_code: str | None = None, event_id: UUID, organization_id
) -> Ticket:
    """Consulta sin validar: verificar una entrada sin quemarla."""
    code = _resolve_code(qr_payload=qr_payload, manual_code=manual_code)
    try:
        ticket = Ticket.objects.select_related("order", "ticket_type", "order__event").get(code=code)
    except Ticket.DoesNotExist:
        raise DomainError("TICKET_INVALID") from None

    event = ticket.order.event
    if str(event.organization_id) != str(organization_id) or str(event.id) != str(event_id):
        raise DomainError("TICKET_INVALID")
    return ticket
