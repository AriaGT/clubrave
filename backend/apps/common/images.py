"""Normalización del logo del sitio.

Mismo principio que las imágenes de evento (`apps/events/image_processing.py`):
el contenido se verifica con Pillow y se guarda como WebP sin EXIF. A
diferencia de un flyer, un logo es chico y suele tener fondo transparente:
se conserva el canal alfa y el mínimo de tamaño es mucho menor.
"""

import io
from uuid import uuid4

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.common.errors import DomainError

LOGO_MAX_UPLOAD_BYTES = 4 * 1024 * 1024
LOGO_MIN_SIDE = 64
LOGO_MAX_DIMENSION = 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


def process_logo_image(django_file) -> ContentFile:
    if django_file.size > LOGO_MAX_UPLOAD_BYTES:
        raise DomainError("VALIDATION_ERROR", "El logo supera el máximo de 4 MB.")

    try:
        probe = Image.open(django_file)
        probe.verify()
    except (UnidentifiedImageError, OSError):
        raise DomainError("VALIDATION_ERROR", "El archivo no es una imagen válida.") from None

    if probe.format not in ALLOWED_FORMATS:
        raise DomainError("VALIDATION_ERROR", "Solo se aceptan logos JPG, PNG o WebP.")

    django_file.seek(0)
    image = Image.open(django_file)
    if min(image.size) < LOGO_MIN_SIDE:
        raise DomainError(
            "VALIDATION_ERROR", f"El logo debe medir al menos {LOGO_MIN_SIDE}px por lado."
        )

    image = ImageOps.exif_transpose(image)
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    image = image.convert("RGBA" if has_alpha else "RGB")

    if max(image.size) > LOGO_MAX_DIMENSION:
        image.thumbnail((LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION), Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=90)
    return ContentFile(buffer.getvalue(), name=f"{uuid4().hex}.webp")
