"""PDF de las entradas de una orden — por si alguien se queda sin datos
móviles y necesita mostrar el QR sin conexión (§11.4). Se arma con Pillow
(ya es dependencia por el procesamiento de imágenes): una página por
entrada, sin librerías nuevas.
"""

import io

import segno
from PIL import Image, ImageDraw, ImageFont

from .codes import sign_ticket_code

PAGE_SIZE = (1240, 1754)  # A4 a 150dpi


def _qr_image(payload: str) -> Image.Image:
    buffer = io.BytesIO()
    segno.make(payload, error="q").save(buffer, kind="png", scale=10, border=2)
    buffer.seek(0)
    return Image.open(buffer).convert("RGB")


def _page_for_ticket(ticket, event) -> Image.Image:
    page = Image.new("RGB", PAGE_SIZE, "white")
    draw = ImageDraw.Draw(page)
    try:
        title_font = ImageFont.truetype("arial.ttf", 48)
        body_font = ImageFont.truetype("arial.ttf", 32)
        mono_font = ImageFont.truetype("cour.ttf", 40)
    except OSError:
        title_font = body_font = mono_font = ImageFont.load_default()

    margin = 100
    draw.text((margin, margin), event.title, fill="black", font=title_font)
    draw.text(
        (margin, margin + 70),
        f"{event.starts_at.strftime('%d/%m/%Y %H:%M')} · {event.venue_name}",
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

    code_blocks = " ".join(ticket.code[i : i + 4] for i in range(0, len(ticket.code), 4))
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
