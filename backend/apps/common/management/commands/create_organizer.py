import secrets

from django.core.management.base import BaseCommand, CommandError
from django.utils.text import slugify

from apps.accounts.models import Membership, Organization, User


class Command(BaseCommand):
    help = "Alta de un organizador con contraseña temporal."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("organization_name")
        parser.add_argument("--full-name", default="")
        parser.add_argument("--password", default=None)

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        if User.objects.filter(email=email).exists():
            raise CommandError(f"Ya existe un usuario con el email {email}.")

        password = options["password"] or secrets.token_urlsafe(12)

        user = User.objects.create_user(
            email=email,
            password=password,
            role=User.Role.ORGANIZER,
            full_name=options["full_name"],
        )

        slug_base = slugify(options["organization_name"])[:40] or "organizacion"
        slug = slug_base
        counter = 2
        while Organization.objects.filter(slug=slug).exists():
            slug = f"{slug_base}-{counter}"
            counter += 1

        organization = Organization.objects.create(
            name=options["organization_name"],
            slug=slug,
            contact_email=email,
        )
        Membership.objects.create(user=user, organization=organization, role=Membership.Role.OWNER)

        self.stdout.write(self.style.SUCCESS(f"Organizador creado: {email}"))
        self.stdout.write(f"Organización: {organization.name} ({organization.slug})")
        if not options["password"]:
            self.stdout.write(self.style.WARNING(f"Contraseña temporal: {password}"))
