from django.core.management.base import BaseCommand

from apps.orders.services.expiry import release_expired_orders


class Command(BaseCommand):
    help = "Devuelve al inventario lo retenido por órdenes PENDING vencidas."

    def handle(self, *args, **options):
        count = release_expired_orders()
        self.stdout.write(self.style.SUCCESS(f"{count} orden(es) liberada(s)."))
