from django.core.management.base import BaseCommand

from apps.orders.models import Order
from apps.orders.services.tickets_email import send_tickets_email


class Command(BaseCommand):
    help = "Reintenta el envío de emails de entradas que quedaron sin enviar."

    def handle(self, *args, **options):
        pending = Order.objects.filter(status=Order.Status.PAID, tickets_email_sent_at__isnull=True)
        sent = 0
        for order in pending:
            if send_tickets_email(order.id):
                sent += 1
        self.stdout.write(self.style.SUCCESS(f"{sent}/{pending.count()} email(s) reenviado(s)."))
