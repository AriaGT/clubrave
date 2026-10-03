from django.core.management.base import BaseCommand, CommandError

from apps.accounts import panel_users
from apps.common.errors import DomainError


class Command(BaseCommand):
    help = "Alta de un organizador con contraseña temporal (misma lógica que la consola /admin)."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("organization_name")
        parser.add_argument("--full-name", default="")
        parser.add_argument("--password", default=None)

    def handle(self, *args, **options):
        password = options["password"] or panel_users.generate_password()
        try:
            membership = panel_users.create_organizer(
                actor=None,
                email=options["email"],
                full_name=options["full_name"],
                password=password,
                organization_name=options["organization_name"],
            )
        except DomainError as exc:
            raise CommandError(exc.message) from exc

        self.stdout.write(self.style.SUCCESS(f"Organizador creado: {membership.user.email}"))
        self.stdout.write(f"Organización: {membership.organization.name} ({membership.organization.slug})")
        if not options["password"]:
            self.stdout.write(self.style.WARNING(f"Contraseña temporal: {password}"))
