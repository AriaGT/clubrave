"""Cifrado de las credenciales de las pasarelas guardadas en la base de datos.

Las credenciales nunca se guardan en claro: se serializan a JSON y se cifran
con Fernet (AES-128-CBC + HMAC-SHA256, autenticado). La clave sale de
`PAYMENT_CREDENTIALS_KEY`, que vive solo en el entorno del servidor: quien
obtenga un volcado de la base de datos no puede leerlas sin ella.
"""

import base64
import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


class CredentialsKeyMissing(Exception):
    """No hay `PAYMENT_CREDENTIALS_KEY`: no se puede cifrar ni descifrar."""


class CredentialsUnreadable(Exception):
    """El texto cifrado no corresponde a la clave actual (clave cambiada o
    dato corrupto). Hay que volver a cargar las credenciales desde el panel."""


def _fernet() -> Fernet:
    secret = settings.PAYMENT_CREDENTIALS_KEY
    if not secret:
        raise CredentialsKeyMissing("Falta PAYMENT_CREDENTIALS_KEY en el entorno del servidor.")
    # Se acepta cualquier cadena larga: Fernet exige 32 bytes en base64, así
    # que se derivan con SHA-256 en vez de obligar a generar ese formato.
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_credentials(values: dict[str, str]) -> str:
    return _fernet().encrypt(json.dumps(values).encode("utf-8")).decode("ascii")


def decrypt_credentials(token: str) -> dict[str, str]:
    if not token:
        return {}
    try:
        return json.loads(_fernet().decrypt(token.encode("ascii")))
    except InvalidToken as exc:
        raise CredentialsUnreadable(
            "No se pudieron descifrar las credenciales guardadas (¿cambió PAYMENT_CREDENTIALS_KEY?)."
        ) from exc
