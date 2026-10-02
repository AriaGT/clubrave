"""PDF de las entradas de una orden — por si alguien se queda sin datos
móviles y necesita mostrar el QR sin conexión (§11.4). Se arma con Pillow
(ya es dependencia por el procesamiento de imágenes): una página por
entrada, sin librerías nuevas.
"""

import io

import segno
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFont

from .codes import sign_ticket_code

PAGE_SIZE = (1240, 1754)  # A4 a 150dpi


def _qr_image(payload: str) -> Image.Image:
    buffer = io.BytesIO()
    segno.make(payload, error="q").save(buffer, kind="png", scale=10, border=2)
    buffer.seek(0)
    return Image.open(buffer).convert("RGB")


def _font(size: int, *, mono: bool = False) -> ImageFont.FreeTypeFont:
    """Fuente del sistema si existe; si no (servidor Linux sin Arial), la
    fuente escalable que trae Pillow. Nunca la bitmap de 11 px."""
    names = ("cour.ttf", "DejaVuSansMono.ttf") if mono else ("arial.ttf", "DejaVuSans.ttf")
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def _when(event) -> str:
    # Hora local del evento (TIME_ZONE), no UTC: un evento a las 22:00 en
    # Lima no debe imprimirse como las 03:00 del día siguiente.
    return timezone.localtime(event.starts_at).strftime("%d/%m/%Y %H:%M")


def _code_blocks(code: str) -> str:
    return " ".join(code[i : i + 4] for i in range(0, len(code), 4))


def _page_for_ticket(ticket, event) -> Image.Image:
    page = Image.new("RGB", PAGE_SIZE, "white")
    draw = ImageDraw.Draw(page)
    title_font = _font(48)
    body_font = _font(32)
    mono_font = _font(40, mono=True)

    margin = 100
    draw.text((margin, margin), event.title, fill="black", font=title_font)
    draw.text(
        (margin, margin + 70),
        f"{_when(event)} · {event.venue_name}",
        fill="black",
        font=body_font,
    )
    draw.text(
        (margin, margin + 130),
        f"{ticket.ticket_type.name} · {ticket.holder_name}",
        fill="black",
        font=body_font,
    )
    if ticket.order.is_guest:
        draw.text((margin, margin + 175), "INVITADO", fill="black", font=body_font)

    qr = _qr_image(sign_ticket_code(ticket.code))
    qr_size = 700
    qr = qr.resize((qr_size, qr_size))
    qr_x = (PAGE_SIZE[0] - qr_size) // 2
    qr_y = margin + 220
    page.paste(qr, (qr_x, qr_y))

    code_blocks = _code_blocks(ticket.code)
    bbox = draw.textbbox((0, 0), code_blocks, font=mono_font)
    text_x = (PAGE_SIZE[0] - (bbox[2] - bbox[0])) // 2
    draw.text((text_x, qr_y + qr_size + 40), code_blocks, fill="black", font=mono_font)

    return page


def build_tickets_pdf(order) -> bytes:
    tickets = list(order.tickets.select_related("ticket_type").all())
    if not tickets:
        pages = [Image.new("RGB", PAGE_SIZE, "white")]
    else:
        pages = [_page_for_ticket(t, order.event) for t in tickets]

    buffer = io.BytesIO()
    pages[0].save(buffer, "PDF", save_all=True, append_images=pages[1:])
    return buffer.getvalue()


IMAGE_SIZE = (1080, 1350)  # 4:5 vertical: se ve completa en WhatsApp e Instagram


def _centered(draw: ImageDraw.ImageDraw, y: int, text: str, font, fill="black") -> int:
    """Dibuja `text` centrado y devuelve la y siguiente."""
    bbox = draw.textbbox((0, 0), text, font=font)
    draw.text(((IMAGE_SIZE[0] - (bbox[2] - bbox[0])) // 2, y), text, fill=fill, font=font)
    return y + (bbox[3] - bbox[1]) + 18


def _fit(draw: ImageDraw.ImageDraw, text: str, size: int, max_width: int) -> ImageFont.FreeTypeFont:
    """Achica la fuente hasta que `text` quepa en una línea."""
    font = _font(size)
    while size > 24 and draw.textlength(text, font=font) > max_width:
        size -= 2
        font = _font(size)
    return font


def build_ticket_image(ticket) -> bytes:
    """Una entrada como imagen PNG, para compartirla por WhatsApp u otro
    medio en una venta manual. Lleva el mismo QR firmado que el PDF y el
    correo: el escáner la valida igual."""
    event = ticket.order.event
    image = Image.new("RGB", IMAGE_SIZE, "white")
    draw = ImageDraw.Draw(image)
    width = IMAGE_SIZE[0] - 120

    y = 70
    y = _centered(draw, y, event.title, _fit(draw, event.title, 56, width))
    when = f"{_when(event)} · {event.venue_name}"
    y = _centered(draw, y, when, _fit(draw, when, 32, width), fill="#444444")
    y += 10
    kind = f"{ticket.ticket_type.name}{' · INVITADO' if ticket.order.is_guest else ''}"
    y = _centered(draw, y, kind, _fit(draw, kind, 38, width))
    y = _centered(draw, y, ticket.holder_name, _fit(draw, ticket.holder_name, 34, width), fill="#444444")

    qr_size = 720
    qr = _qr_image(sign_ticket_code(ticket.code)).resize((qr_size, qr_size), Image.NEAREST)
    qr_y = y + 20
    image.paste(qr, ((IMAGE_SIZE[0] - qr_size) // 2, qr_y))

    _centered(draw, qr_y + qr_size + 24, _code_blocks(ticket.code), _font(40, mono=True))
    footer = "Presenta este QR y tu documento de identidad en la puerta."
    _centered(draw, IMAGE_SIZE[1] - 90, footer, _fit(draw, footer, 28, width), fill="#666666")

    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()
