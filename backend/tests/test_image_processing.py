"""§5.7 y §13.1: el contenido real se verifica con Pillow, nunca la
extensión ni el Content-Type declarado."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.common.errors import DomainError
from apps.events.image_processing import MAX_UPLOAD_BYTES, process_event_image


def _make_image_file(*, width=1200, height=900, fmt="JPEG", name="photo.jpg") -> SimpleUploadedFile:
    image = Image.new("RGB", (width, height), (10, 20, 30))
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/jpeg")


def test_valid_image_is_normalized_to_webp():
    result = process_event_image(_make_image_file())
    assert result.name.endswith(".webp")
    reopened = Image.open(result)
    assert reopened.format == "WEBP"


def test_image_below_minimum_dimensions_is_rejected():
    with pytest.raises(DomainError) as exc:
        process_event_image(_make_image_file(width=400, height=300))
    assert exc.value.code == "VALIDATION_ERROR"


def test_oversized_dimension_is_downscaled_not_rejected():
    result = process_event_image(_make_image_file(width=4000, height=3000))
    reopened = Image.open(result)
    assert max(reopened.size) <= 2400


def test_file_larger_than_8mb_is_rejected():
    fake_large_file = SimpleUploadedFile(
        "big.jpg", b"\x00" * (MAX_UPLOAD_BYTES + 1), content_type="image/jpeg"
    )
    with pytest.raises(DomainError) as exc:
        process_event_image(fake_large_file)
    assert exc.value.code == "VALIDATION_ERROR"


def test_non_image_content_is_rejected_regardless_of_declared_content_type():
    """Un ejecutable renombrado a `.jpg` con Content-Type falsificado no
    debe colarse: el contenido se abre de verdad, no se confía en la
    extensión ni en la cabecera declarada por el cliente."""
    fake_file = SimpleUploadedFile(
        "not-an-image.jpg", b"MZ\x90\x00this-is-not-a-real-image", content_type="image/jpeg"
    )
    with pytest.raises(DomainError) as exc:
        process_event_image(fake_file)
    assert exc.value.code == "VALIDATION_ERROR"


def test_unsupported_format_is_rejected():
    image = Image.new("RGB", (1000, 800), (1, 2, 3))
    buffer = io.BytesIO()
    image.save(buffer, format="BMP")
    buffer.seek(0)
    bmp_file = SimpleUploadedFile("photo.bmp", buffer.read(), content_type="image/bmp")
    with pytest.raises(DomainError):
        process_event_image(bmp_file)
