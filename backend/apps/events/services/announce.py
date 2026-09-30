"""Comunicados a compradores de un evento (H02).

El destinatario es el `buyer_email` de las órdenes **pagadas** de ese evento,
deduplicado — nunca canceladas ni vencidas. El email sale con el nombre del
evento en el asunto y el `contact_email` de la organización como respuesta. El
límite de 3 por evento por día se deriva de la propia bitácora: un registro se
reserva dentro de la transacción, así que el contador no se puede saltar con
peticiones concurrentes ni editar después. Todo queda en la bitácora: quién,
cuándo, a cuántos y el texto enviado.
"""

from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from apps.accounts.models import User
from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.mailer import send as send_email
from apps.common.models import AuditLog
from apps.events.models import Event
from apps.orders.models import Order

MAX_ANNOUNCEMENTS_PER_DAY = 3


def _announcements_sent_today(event: Event) -> int:
    today = timezone.localdate()
    return AuditLog.objects.filter(
        event=event, action=AuditLog.Action.EVENT_ANNOUNCED, created_at__date=today
    ).count()


def _recipients(event: Event) -> list[str]:
    return list(
        Order.objects.filter(event=event, status=Order.Status.PAID)
        .values_list("buyer_email", flat=True)
        .distinct()
        .order_by("buyer_email")
    )


def _send_announcement(event: Event, subject: str, message: str, recipients: list[str]) -> None:
    html = render_to_string(
        "events/announcement_email.html",
        {"event": event, "subject": subject, "message": message},
    )
    full_subject = f"{event.title}: {subject}"
    for email in recipients:
        send_email(
            to=email,
            subject=full_subject,
            html=html,
            reply_to=event.organization.contact_email,
        )


@transaction.atomic
def announce(*, event: Event, actor: User | None, subject: str, message: str) -> dict:
    if _announcements_sent_today(event) >= MAX_ANNOUNCEMENTS_PER_DAY:
        raise DomainError(
            "RATE_LIMITED",
            f"Límite alcanzado: se permiten {MAX_ANNOUNCEMENTS_PER_DAY} comunicados por evento al día.",
        )

    subject = subject.strip()
    message = message.strip()
    if not subject:
        raise DomainError("VALIDATION_ERROR", "El asunto no puede estar vacío.")
    if not message:
        raise DomainError("VALIDATION_ERROR", "El mensaje no puede estar vacío.")

    recipients = _recipients(event)
    if not recipients:
        raise DomainError("VALIDATION_ERROR", "Este evento no tiene compradores a quienes avisar.")

    record(
        actor=actor,
        organization=event.organization,
        action=AuditLog.Action.EVENT_ANNOUNCED,
        target=event,
        metadata={"subject": subject, "message": message, "recipients": len(recipients)},
    )

    transaction.on_commit(lambda: _send_announcement(event, subject, message, recipients))
    return {"recipients": len(recipients), "subject": subject, "message": message}