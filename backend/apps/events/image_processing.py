"""Validación y normalización de imágenes de evento (§5.7 del plan).

El contenido real se verifica con Pillow — nunca la extensión ni el
`Content-Type` declarado, que cualquiera puede falsificar. Toda imagen se
reduce a WebP antes de guardarse: menos peso, un solo formato que servir, y
los metadatos EXIF (que pueden llevar geolocalización de quien tomó la
foto) se descartan en el proceso.
"""

import io
from uuid import uuid4

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.common.errors import DomainError

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MIN_WIDTH, MIN_HEIGHT = 800, 600
MAX_DIMENSION = 2400
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
WEBP_QUALITY = 82


def event_image_upload_path(instance, filename) -> str:
    return f"events/{instance.event_id}/{uuid4().hex}.webp"


def process_event_image(django_file) -> ContentFile:
    """Valida el archivo subido y devuelve su versión normalizada en WebP.
    Lanza `DomainError("VALIDATION_ERROR", ...)` si no es una imagen válida
    o no cumple los mínimos — nunca deja pasar el archivo original tal cual."""
    if django_file.size > MAX_UPLOAD_BYTES:
        raise DomainError("VALIDATION_ERROR", "La imagen supera el máximo de 8 MB.")

    try:
        probe = Image.open(django_file)
        probe.verify()  # detecta archivos truncados o que no son imágenes reales
    except (UnidentifiedImageError, OSError):
        raise DomainError("VALIDATION_ERROR", "El archivo no es una imagen válida.") from None

    if probe.format not in ALLOWED_FORMATS:
        raise DomainError("VALIDATION_ERROR", "Solo se aceptan imágenes JPG, PNG o WebP.")

    django_file.seek(0)
    image = Image.open(django_file)  # `verify()` deja el objeto anterior inutilizable

    if image.width < MIN_WIDTH or image.height < MIN_HEIGHT:
        raise DomainError(
            "VALIDATION_ERROR", f"La imagen debe medir al menos {MIN_WIDTH}×{MIN_HEIGHT}px."
        )

    image = ImageOps.exif_transpose(image)  # respeta la orientación antes de tirar el EXIF
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    if max(image.size) > MAX_DIMENSION:
        image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=WEBP_QUALITY)  # Pillow no copia el EXIF salvo que se pida
    return ContentFile(buffer.getvalue(), name=f"{uuid4().hex}.webp")
