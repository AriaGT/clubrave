"""Código opaco de entrada (identidad) + firma HMAC sobre el QR (autenticidad).

Ver §5.6 del plan: el QR nunca lleva datos del comprador ni precios, solo un
payload firmado. `key_id` permite rotar la llave sin invalidar entradas ya
emitidas.
"""

import base64
import hashlib
import hmac
import secrets

from django.conf import settings

from apps.common.errors import DomainError

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sin I, L, O, 0, 1
QR_VERSION = "T1"


def generate_ticket_code() -> str:
    """22 caracteres ≈ 108 bits de entropía: no se adivina ni se enumera."""
    return "".join(secrets.choice(ALPHABET) for _ in range(22))


def generate_order_code() -> str:
    return "TK-" + "".join(secrets.choice(ALPHABET) for _ in range(8))


def sign_ticket_code(code: str, *, key_id: str | None = None) -> str:
    """Payload del QR: T1.<code>.<key_id>.<firma> (≈ 45 caracteres)."""
    key_id = key_id or settings.TICKET_SIGNING_KEY_ID
    secret = settings.TICKET_SIGNING_KEYS[key_id]
    mac = hmac.new(secret.encode(), f"{QR_VERSION}.{code}".encode(), hashlib.sha256)
    signature = base64.urlsafe_b64encode(mac.digest()[:12]).decode().rstrip("=")
    return f"{QR_VERSION}.{code}.{key_id}.{signature}"


def verify_qr_payload(payload: str) -> str:
    """Devuelve el `code` si la firma es válida; si no, lanza TICKET_INVALID."""
    try:
        version, code, key_id, signature = payload.strip().split(".")
        if key_id not in settings.TICKET_SIGNING_KEYS:
            raise KeyError(key_id)
    except (ValueError, KeyError):
        raise DomainError("TICKET_INVALID") from None
    if version != QR_VERSION:
        raise DomainError("TICKET_INVALID")
    expected = sign_ticket_code(code, key_id=key_id).rsplit(".", 1)[1]
    if not hmac.compare_digest(expected, signature):
        raise DomainError("TICKET_INVALID")
    return code
