"""Códigos de invitado: generar en lote, validar, redimir y anular.

Decisión de inventario (documentada también en `GuestCode`): generar un
código **retiene** una unidad de cupo del tipo de entrada
(`quantity_reserved`), sin vencimiento. Redimir la pasa a vendida
(`quantity_sold`) y anular un código disponible la libera. Las
`CheckConstraint` de `TicketType` siguen siendo la red final: nunca hay más
entradas comprometidas que aforo.

Redimir emite una orden de cortesía (`Order.is_guest=True`, total 0,
`gateway="guest"`) ya `PAID`, con su entrada y el mismo email de entradas que
una compra. La orden de monto 0 reutiliza tal cual el QR, "Mi cuenta", el PDF,
el reenvío y el escáner; los ingresos la excluyen por `is_guest`.
"""

import secrets
import uuid
from dataclasses import dataclass

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.models import AuditLog
from apps.events.models import Event, TicketType

from ..models import GuestCode, Order, OrderItem, Ticket
from .checkout import BuyerData
from .codes import ALPHABET, generate_order_code, generate_ticket_code

GUEST_CODE_LENGTH = 12  # 31^12 ≈ 2^59: imposible de enumerar con el throttle público
MAX_CODES_PER_BATCH = 500


def generate_guest_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(GUEST_CODE_LENGTH))


def normalize_guest_code(raw: str) -> str:
    """Acepta el código como lo teclee o pegue la persona: con guiones,
    espacios o en minúsculas (`k7m3-qpxr-2nd4` → `K7M3QPXR2ND4`)."""
    return "".join(ch for ch in (raw or "").upper() if ch.isalnum())


def format_guest_code(code: str) -> str:
    """Bloques de 4 para dictarlo o copiarlo sin errores."""
    return "-".join(code[i : i + 4] for i in range(0, len(code), 4))


@transaction.atomic
def generate_guest_codes(
    *, event: Event, ticket_type_id, quantity: int, actor, label: str = ""
) -> list[GuestCode]:
    if event.status == Event.Status.CANCELLED:
        raise DomainError("EVENT_CANCELLED", "Un evento cancelado no admite códigos de invitado.")
    if quantity < 1 or quantity > MAX_CODES_PER_BATCH:
        raise DomainError(
            "VALIDATION_ERROR", f"Puedes generar entre 1 y {MAX_CODES_PER_BATCH} códigos por lote."
        )

    ticket_type = (
        TicketType.objects.select_for_update().filter(id=ticket_type_id, event=event).first()
    )
    if ticket_type is None:
        raise DomainError("VALIDATION_ERROR", "Elige un tipo de entrada de este evento.")
    if quantity > ticket_type.available:
        raise DomainError(
            "SOLD_OUT",
            f"Solo quedan {ticket_type.available} cupos libres en {ticket_type.name}.",
            details={"ticket_type_id": str(ticket_type.id), "available": ticket_type.available},
        )

    ticket_type.quantity_reserved = F("quantity_reserved") + quantity
    ticket_type.save(update_fields=["quantity_reserved"])

    codes: set[str] = set()
    while len(codes) < quantity:
        candidates = {generate_guest_code() for _ in range(quantity - len(codes))}
        taken = set(GuestCode.objects.filter(code__in=candidates).values_list("code", flat=True))
        codes |= candidates - taken

    batch_id = uuid.uuid4()
    created = GuestCode.objects.bulk_create(
        [
            GuestCode(
                event=event,
                ticket_type=ticket_type,
                code=code,
                batch_id=batch_id,
                label=label[:80],
                created_by=actor,
            )
            for code in sorted(codes)
        ]
    )

    record(
        actor=actor,
        organization=event.organization,
        action=AuditLog.Action.GUEST_CODES_GENERATED,
        target=event,
        quantity=quantity,
        ticket_type=ticket_type.name,
        batch_id=str(batch_id),
        label=label,
    )
    return created


def _get_code_for_event(*, raw_code: str, event_id, lock: bool) -> GuestCode:
    code = normalize_guest_code(raw_code)
    if not code:
        raise DomainError("GUEST_CODE_INVALID")
    qs = GuestCode.objects.select_related("event", "ticket_type", "event__organization")
    if lock:
        qs = qs.select_for_update(of=("self",))
    guest_code = qs.filter(code=code).first()
    # Un código de otro evento se contesta igual que uno inexistente: no se
    # puede sondear qué códigos existen en otros eventos.
    if guest_code is None or str(guest_code.event_id) != str(event_id):
        raise DomainError("GUEST_CODE_INVALID")
    return guest_code


def _ensure_redeemable(guest_code: GuestCode) -> None:
    event = guest_code.event
    if guest_code.status == GuestCode.Status.REDEEMED:
        raise DomainError("GUEST_CODE_ALREADY_USED")
    if guest_code.status == GuestCode.Status.VOIDED:
        raise DomainError("GUEST_CODE_INVALID", "Este código fue anulado por el organizador.")
    if event.status == Event.Status.CANCELLED:
        raise DomainError("EVENT_CANCELLED", "Este evento fue cancelado.")
    if event.status != Event.Status.PUBLISHED:
        raise DomainError("EVENT_NOT_PUBLISHED")
    if event.is_finished:
        raise DomainError("GUEST_CODE_INVALID", "Este evento ya terminó.")


def validate_guest_code(*, raw_code: str, event_id) -> GuestCode:
    """Consulta sin redimir: la tienda muestra qué entrada/zona otorga."""
    guest_code = _get_code_for_event(raw_code=raw_code, event_id=event_id, lock=False)
    _ensure_redeemable(guest_code)
    return guest_code


@dataclass
class RedeemResult:
    order: Order
    guest_code: GuestCode


@transaction.atomic
def redeem_guest_code(
    *, raw_code: str, event_id, buyer: BuyerData, customer=None, terms_accepted: bool
) -> RedeemResult:
    if not terms_accepted:
        raise DomainError("VALIDATION_ERROR", "Debes aceptar los términos.")

    # Bloqueo de fila del código: dos redenciones simultáneas del mismo código
    # se serializan aquí y la segunda ve `REDEEMED` (nunca dos entradas).
    guest_code = _get_code_for_event(raw_code=raw_code, event_id=event_id, lock=True)
    _ensure_redeemable(guest_code)
    event = guest_code.event

    ticket_type = TicketType.objects.select_for_update().get(id=guest_code.ticket_type_id)
    # La retención hecha al generar el código pasa a vendida.
    ticket_type.quantity_reserved = F("quantity_reserved") - 1
    ticket_type.quantity_sold = F("quantity_sold") + 1
    ticket_type.save(update_fields=["quantity_reserved", "quantity_sold"])

    now = timezone.now()
    order = Order.objects.create(
        code=generate_order_code(),
        event=event,
        customer=customer,
        status=Order.Status.PAID,
        is_guest=True,
        subtotal=0,
        service_fee=0,
        total=0,
        currency=event.currency,
        buyer_email=buyer.email.lower(),
        buyer_name=buyer.full_name,
        buyer_phone=buyer.phone,
        buyer_document_type=buyer.document_type,
        buyer_document=buyer.document_id,
        expires_at=now,
        paid_at=now,
        terms_accepted_at=now,
        terms_version=settings.TERMS_VERSION,
        gateway="guest",
        gateway_reference=guest_code.code,
    )
    OrderItem.objects.create(
        order=order,
        ticket_type=ticket_type,
        ticket_type_name=ticket_type.name,
        unit_price=0,
        quantity=1,
        subtotal=0,
    )
    Ticket.objects.create(
        order=order,
        ticket_type=ticket_type,
        code=generate_ticket_code(),
        holder_name=buyer.full_name,
    )

    guest_code.status = GuestCode.Status.REDEEMED
    guest_code.order = order
    guest_code.redeemed_at = now
    guest_code.save(update_fields=["status", "order", "redeemed_at", "updated_at"])

    record(
        actor=customer,
        organization=event.organization,
        action=AuditLog.Action.GUEST_CODE_REDEEMED,
        target=guest_code,
        event=event,
        order_code=order.code,
        email=order.buyer_email,
        ticket_type=ticket_type.name,
    )

    transaction.on_commit(lambda: _send_tickets_email_safely(order.id))
    return RedeemResult(order=order, guest_code=guest_code)


def _send_tickets_email_safely(order_id) -> None:
    from .tickets_email import send_tickets_email

    send_tickets_email(order_id)


@transaction.atomic
def void_guest_code(*, guest_code: GuestCode, actor, reason: str = "") -> GuestCode:
    """Anula un código **disponible** y devuelve su cupo retenido a la venta.

    Un código ya redimido no se anula aquí: su entrada existe y se gestiona
    como cualquier otra (Asistentes → Anular entrada).
    """
    guest_code = (
        GuestCode.objects.select_for_update(of=("self",))
        .select_related("event__organization", "ticket_type")
        .get(pk=guest_code.pk)
    )
    if guest_code.status != GuestCode.Status.AVAILABLE:
        raise DomainError("GUEST_CODE_NOT_VOIDABLE")

    TicketType.objects.filter(id=guest_code.ticket_type_id).update(
        quantity_reserved=F("quantity_reserved") - 1
    )
    guest_code.status = GuestCode.Status.VOIDED
    guest_code.voided_at = timezone.now()
    guest_code.save(update_fields=["status", "voided_at", "updated_at"])

    record(
        actor=actor,
        organization=guest_code.event.organization,
        action=AuditLog.Action.GUEST_CODE_VOIDED,
        target=guest_code,
        event=guest_code.event,
        reason=reason,
        ticket_type=guest_code.ticket_type.name,
    )
    return guest_code


def void_available_codes_for_event(*, event: Event) -> int:
    """Al cancelar un evento: los códigos sin usar se anulan y liberan su
    retención (misma regla D1 que las órdenes `PENDING`). Se llama dentro de
    la transacción de `cancel_event`."""
    pending = list(
        GuestCode.objects.select_for_update().filter(event=event, status=GuestCode.Status.AVAILABLE)
    )
    per_type: dict = {}
    for guest_code in pending:
        per_type[guest_code.ticket_type_id] = per_type.get(guest_code.ticket_type_id, 0) + 1
    for ticket_type_id, count in per_type.items():
        TicketType.objects.filter(id=ticket_type_id).update(
            quantity_reserved=F("quantity_reserved") - count
        )
    GuestCode.objects.filter(id__in=[g.id for g in pending]).update(
        status=GuestCode.Status.VOIDED, voided_at=timezone.now()
    )
    return len(pending)
