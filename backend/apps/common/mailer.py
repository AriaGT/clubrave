"""Interfaz mínima de envío de correo: `send(to, subject, html, attachments)`.

En dev usa el backend de consola de Django. En producción, si `RESEND_API_KEY`
está configurada, usa la API HTTP de Resend (puerto 443) en vez de SMTP: el
egress SMTP (puerto 587) de varios hostings gratuitos (Render incluido) es
intermitente y sin `EMAIL_TIMEOUT` cuelga el hilo del request 1-2 minutos por
intento fallido — visto en vivo el 2026-09-22 (`TimeoutError: [Errno 110]
Connection timed out` contra smtp.resend.com). Sin `RESEND_API_KEY`, cae al
backend SMTP/consola estándar de Django (dev, u otro proveedor).

El envío nunca tumba la petición que lo dispara (ver §5.8 del plan): quien
llama debe envolver en try/except si el envío ocurre en línea con la
respuesta al cliente.
"""

import base64
import logging

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_API_TIMEOUT = 10  # segundos — falla rápido en vez de colgar el worker


def _send_via_resend_api(
    *,
    to: str,
    subject: str,
    html: str,
    attachments: list[tuple[str, bytes, str]] | None,
    reply_to: str | None,
) -> bool:
    payload: dict = {
        "from": settings.DEFAULT_FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        payload["reply_to"] = [reply_to]
    if attachments:
        payload["attachments"] = [
            {"filename": filename, "content": base64.b64encode(content).decode("ascii")}
            for filename, content, _mimetype in attachments
        ]
    try:
        response = requests.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json=payload,
            timeout=RESEND_API_TIMEOUT,
        )
        response.raise_for_status()
        return True
    except requests.RequestException:
        logger.exception("Fallo al enviar email (Resend API) a %s (asunto: %s)", to, subject)
        return False


def _send_via_smtp(
    *,
    to: str,
    subject: str,
    html: str,
    attachments: list[tuple[str, bytes, str]] | None,
    reply_to: str | None,
) -> bool:
    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=html,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[to],
        )
        if reply_to:
            message.reply_to = [reply_to]
        message.attach_alternative(html, "text/html")
        for filename, content, mimetype in attachments or []:
            message.attach(filename, content, mimetype)
        message.send(fail_silently=False)
        return True
    except Exception:
        logger.exception("Fallo al enviar email (SMTP) a %s (asunto: %s)", to, subject)
        return False


def send(
    *,
    to: str,
    subject: str,
    html: str,
    attachments: list[tuple[str, bytes, str]] | None = None,
    reply_to: str | None = None,
) -> bool:
    """Envía un correo HTML. Devuelve True si se envió, False si falló.

    `attachments`: lista de (nombre_archivo, contenido_bytes, mimetype).
    `reply_to`: dirección de respuesta para comunicados y cancelaciones
    (apunta al `contact_email` de la organización).
    """
    if getattr(settings, "RESEND_API_KEY", ""):
        return _send_via_resend_api(
            to=to, subject=subject, html=html, attachments=attachments, reply_to=reply_to
        )
    return _send_via_smtp(to=to, subject=subject, html=html, attachments=attachments, reply_to=reply_to)
