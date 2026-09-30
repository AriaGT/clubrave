import io
from datetime import timedelta
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import Membership, Organization, User
from apps.events.models import Event, EventImage, TicketType


def _placeholder_image(text: str, color: tuple[int, int, int]) -> ContentFile:
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (1200, 675), color)
    draw = ImageDraw.Draw(image)
    draw.text((40, 40), text, fill=(244, 244, 245))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return ContentFile(buffer.getvalue(), name=f"{slugify(text)}.jpg")


class Command(BaseCommand):
    help = "Crea una organización, un organizador y un evento publicado con imágenes y 3 tipos de entrada."

    def handle(self, *args, **options):
        email = "demo@ticketera.pe"
        user, created = User.objects.get_or_create(
            email=email, defaults={"role": User.Role.ORGANIZER, "full_name": "Organizador Demo"}
        )
        if created:
            user.set_password("demo12345")
            user.save(update_fields=["password"])

        organization, _ = Organization.objects.get_or_create(
            slug="promotora-demo",
            defaults={"name": "Promotora Demo", "contact_email": email},
        )
        Membership.objects.get_or_create(
            user=user, organization=organization, defaults={"role": Membership.Role.OWNER}
        )

        event, event_created = Event.objects.get_or_create(
            organization=organization,
            title="Noche Eléctrica — Edición Demo",
            defaults={
                "description": "Una noche de música electrónica para probar la plataforma de punta a punta.",
                "starts_at": timezone.now() + timedelta(days=30),
                "venue_name": "Warehouse 09",
                "address": "Av. Industrial 450",
                "city": "Lima",
                "maps_url": "https://maps.google.com/?q=Warehouse+09+Lima",
                "min_age": 18,
                "status": Event.Status.DRAFT,
            },
        )

        if not event.images.exists():
            EventImage.objects.create(
                event=event,
                image=_placeholder_image("Noche Eléctrica", (124, 58, 237)),
                alt="Portada de Noche Eléctrica",
                position=0,
                is_cover=True,
            )

        if not event.ticket_types.exists():
            TicketType.objects.bulk_create(
                [
                    TicketType(
                        event=event, name="Preventa", price=Decimal("30.00"), quantity_total=100, position=0
                    ),
                    TicketType(
                        event=event, name="General", price=Decimal("45.00"), quantity_total=200, position=1
                    ),
                    TicketType(
                        event=event,
                        name="VIP",
                        price=Decimal("90.00"),
                        quantity_total=50,
                        max_per_order=6,
                        position=2,
                    ),
                ]
            )

        errors = event.publish_requirements_errors()
        if not errors and event.status != Event.Status.PUBLISHED:
            event.status = Event.Status.PUBLISHED
            event.published_at = timezone.now()
            event.save(update_fields=["status", "published_at"])

        self.stdout.write(self.style.SUCCESS("Datos de ejemplo listos."))
        self.stdout.write(f"Organizador: {email} / demo12345")
        self.stdout.write(f"Evento: {event.title} ({event.status}) — /e/{event.slug}")
