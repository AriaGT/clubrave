"""Verifica contra Mercado Pago que el token y el payload son válidos.

Se usa antes de abrir la venta: confirma en un comando que las credenciales
configuradas crean una order de verdad, sin tener que hacer una compra real.
No escribe en la base de datos.
"""

from decimal import Decimal
from uuid import uuid4

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.payments.mercadopago import MercadoPagoClient, MercadoPagoError


class Command(BaseCommand):
    help = "Crea una order de prueba en Mercado Pago con la configuración vigente."

    def add_arguments(self, parser):
        parser.add_argument(
            "--amount", default="1.00", help="Importe de la order de prueba (por defecto 1.00)."
        )

    def handle(self, *args, **options):
        if not settings.MERCADOPAGO_ACCESS_TOKEN:
            raise CommandError("MERCADOPAGO_ACCESS_TOKEN está vacío.")

        amount = str(Decimal(options["amount"]).quantize(Decimal("0.01")))
        store = settings.FRONTEND_STORE_URL.rstrip("/")

        client = MercadoPagoClient(
            access_token=settings.MERCADOPAGO_ACCESS_TOKEN,
            api_base_url=settings.MERCADOPAGO_API_BASE_URL,
        )
        payload = {
            "type": "online",
            "processing_mode": settings.MERCADOPAGO_PROCESSING_MODE,
            "total_amount": amount,
            "external_reference": "SMOKETEST",
            "description": "Smoke test de integración",
            "payer": {"email": "smoketest@clubrave.pe"},
            "items": [
                {
                    "title": "Smoke test",
                    "unit_price": amount,
                    "quantity": 1,
                    "unit_measure": "unit",
                    "total_amount": amount,
                }
            ],
            "config": {
                "online": {
                    "success_url": f"{store}/checkout/SMOKETEST/pay?mp=success",
                    "failure_url": f"{store}/checkout/SMOKETEST/pay?mp=failure",
                    "pending_url": f"{store}/checkout/SMOKETEST/pay?mp=pending",
                    "auto_return": "all",
                }
            },
        }

        self.stdout.write(f"Modo: {settings.MERCADOPAGO_MODE} · tienda: {store}")
        try:
            # Clave nueva por ejecución: cada corrida debe crear su propia
            # order, no reusar la de la vez anterior.
            order = client.create_order(payload, idempotency_key=f"clubrave-smoketest-{uuid4()}")
        except MercadoPagoError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS("Order creada en Mercado Pago."))
        self.stdout.write(f"  id:           {order.id}")
        self.stdout.write(f"  status:       {order.status} / {order.status_detail}")
        self.stdout.write(f"  moneda:       {order.currency}")
        self.stdout.write(f"  checkout_url: {order.checkout_url}")
        self.stdout.write(
            self.style.WARNING(f"  cobra la cuenta user_id={order.user_id or 'desconocido'}")
        )
        self.stdout.write(
            "\nConfirma que ese user_id es la cuenta del ORGANIZADOR: el dinero entra "
            "en la cuenta dueña del access token.\n"
            "Luego abre el checkout_url para pagar con un usuario o tarjeta de prueba. "
            "La notificación debe llegar a /api/webhooks/mercadopago/."
        )
