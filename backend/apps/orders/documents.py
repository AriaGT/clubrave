"""Documento de identidad del comprador.

Obligatorio en toda venta (web, invitado o manual): los eventos son
nocturnos y el organizador tiene que poder revisar quién compró y, si
sospecha de alguien, validar su documento. El DNI es el caso general; CE y
pasaporte existen para que un extranjero también pueda comprar. La futura
validación con RENIEC solo aplica a `DNI`.
"""

import re

from django.db import models


class DocumentType(models.TextChoices):
    DNI = "DNI", "DNI"
    CE = "CE", "Carné de extranjería"
    PASSPORT = "PASSPORT", "Pasaporte"


_FORMATS = {
    DocumentType.DNI: (re.compile(r"^\d{8}$"), "El DNI tiene 8 dígitos."),
    DocumentType.CE: (
        re.compile(r"^[A-Z0-9]{8,12}$"),
        "El carné de extranjería tiene entre 8 y 12 caracteres.",
    ),
    DocumentType.PASSPORT: (
        re.compile(r"^[A-Z0-9]{6,15}$"),
        "El pasaporte tiene entre 6 y 15 letras o números.",
    ),
}


class InvalidDocument(ValueError):
    pass


def normalize_document(document_type: str, number: str) -> str:
    """Devuelve el número sin espacios, guiones ni puntos y en mayúsculas, o
    `InvalidDocument` con un mensaje listo para mostrar."""
    if document_type not in _FORMATS:
        raise InvalidDocument("Tipo de documento inválido.")
    cleaned = re.sub(r"[\s.\-]", "", number or "").upper()
    if not cleaned:
        raise InvalidDocument("El documento de identidad es obligatorio.")
    pattern, message = _FORMATS[DocumentType(document_type)]
    if not pattern.match(cleaned):
        raise InvalidDocument(message)
    return cleaned
