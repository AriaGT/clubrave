"""Email de confirmación de compra con un QR por entrada.

Fiabilidad sin broker (ver §5.8): se llama en `transaction.on_commit`, nunca
tumba la petición, y el comando `resend_pending_ticket_emails` reintenta lo
que quedó sin enviar.
"""

from uuid import UUID

import segno
from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.mailer import send as send_email
from apps.common.models import AuditLog

from ..models import Order
from .codes import sign_ticket_code

MAX_RESENDS_PER_ORDER_PER_DAY = 5


def _qr_png(payload: str) -> bytes:
    import io

    buffer = io.BytesIO()
    segno.make(payload, error="q").save(buffer, kind="png", scale=6, border=2)
    return buffer.getvalue()


def send_tickets_email(order_id: UUID) -> bool:
    order = Order.objects.select_related("event").prefetch_related("tickets__ticket_type").get(id=order_id)
    if order.status != Order.Status.PAID:
        return False

    tickets = list(order.tickets.select_related("ticket_type").all())
    attachments = []
    ticket_rows = []
    for index, ticket in enumerate(tickets):
        payload = sign_ticket_code(ticket.code)
        filename = f"entrada-{index + 1}.png"
        attachments.append((filename, _qr_png(payload), "image/png"))
        ticket_rows.append({"ticket": ticket, "qr_filename": filename})

    html = render_to_string(
        "orders/tickets_email.html",
        {
            "order": order,
            "event": order.event,
            "ticket_rows": ticket_rows,
            "account_url": f"{settings.FRONTEND_STORE_URL}/cuenta/entradas",
        },
    )

    sent = send_email(
        to=order.buyer_email,
        subject=(
            f"Tu entrada de invitado para {order.event.title}"
            if order.is_guest
            else f"Tus entradas para {order.event.title}"
        ),
        html=html,
        attachments=attachments,
    )
    if sent:
        order.tickets_email_sent_at = timezone.now()
        order.save(update_fields=["tickets_email_sent_at"])
    return sent


def resends_today(order_id: UUID) -> int:
    """Reenvíos ya contados hoy para esa orden (bitácora `TICKETS_RESENT`)."""
    start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return AuditLog.objects.filter(
        target_type="order", target_id=order_id, action=AuditLog.Action.TICKETS_RESENT,
        created_at__gte=start,
    ).count()


def resend_tickets_email(*, order: Order, actor, email: str = "") -> dict:
    """Reenviar el email de entradas de una orden pagada (H10).

    Solo aplica sobre `PAID` (un QR de otra orden jamás sale al correo), siempre
    al `buyer_email` original — sin campos para cambiarlo, que esa sería una
    vía de fuga de entradas — y con un tope de 5 reenvíos por orden por día.
    """
    if order.status != Order.Status.PAID:
        raise DomainError("VALIDATION_ERROR", "Esta orden no tiene entradas emitidas.")

    if not order.buyer_email:
        # Venta manual registrada sin correo: se puede agregar una sola vez.
        if not email:
            raise DomainError("VALIDATION_ERROR", "Esta venta no tiene correo: escribe a cuál enviarla.")
        order.buyer_email = email.lower()
        order.save(update_fields=["buyer_email", "updated_at"])

    if resends_today(order.id) >= MAX_RESENDS_PER_ORDER_PER_DAY:
        raise DomainError(
            "RATE_LIMITED", "Llegaste al máximo de 5 reenvíos de entradas por orden por día."
        )

    sent = send_tickets_email(order.id)
    if not sent:
        raise DomainError("VALIDATION_ERROR", "No se pudo enviar el email. Intenta de nuevo.")

    record(
        actor=actor,
        organization=order.event.organization,
        action=AuditLog.Action.TICKETS_RESENT,
        target=order,
        email=order.buyer_email,
    )
    order.refresh_from_db(fields=["tickets_email_sent_at"])
    return {
        "sent": True,
        "sent_at": order.tickets_email_sent_at.isoformat() if order.tickets_email_sent_at else None,
        "resends_today": resends_today(order.id),
    }
