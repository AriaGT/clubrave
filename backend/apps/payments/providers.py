"""Registro de pasarelas reales y su configuración guardada en la base.

Cada proveedor declara qué credenciales pide, cómo se validan contra el
proveedor y cómo se construye su gateway. Agregar uno nuevo (PayPal,
PagoEfectivo…) es sumar una entrada a `PROVIDERS` y su clase en
`gateways.py`; el panel y el checkout lo toman de aquí sin más cambios.
"""

import base64
import logging
from collections.abc import Callable
from dataclasses import dataclass

import requests
from django.conf import settings
from django.utils import timezone

from .crypto import CredentialsKeyMissing, decrypt_credentials, encrypt_credentials
from .models import PaymentProvider, PaymentSettings

logger = logging.getLogger(__name__)

FAKE = "fake"


class CredentialsInvalid(Exception):
    """El proveedor rechazó las credenciales, o no son coherentes entre sí.
    El mensaje se muestra tal cual en el panel."""


@dataclass(frozen=True)
class CredentialField:
    name: str
    label: str
    # Los secretos nunca se vuelven a mostrar: el panel solo ve sus últimos
    # caracteres. Los públicos (p. ej. la clave pública, que igual viaja al
    # navegador) se muestran completos para poder reconocerlos.
    secret: bool
    help: str = ""


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    label: str  # en el panel
    buyer_label: str  # en la tienda, al elegir cómo pagar
    fields: tuple[CredentialField, ...]
    verify: Callable[[dict[str, str], str], None]
    webhook_url_name: str


# ── Validación contra cada proveedor ─────────────────────────────────────────


def _verify_izipay(creds: dict[str, str], environment: str) -> None:
    shop_id = creds["shop_id"].strip()
    public_key = creds["public_key"].strip()
    password = creds["rest_password"].strip()

    # Izipay marca cada credencial con su entorno: mezclar una de pruebas con
    # otra de producción es el error clásico, así que se rechaza aquí.
    is_test = environment == PaymentProvider.Environment.TEST
    expected = "test" if is_test else "prod"
    if not password.startswith(f"{expected}password_"):
        raise CredentialsInvalid(
            f"El password de API REST no es de {'pruebas' if is_test else 'producción'} "
            f"(debe empezar con «{expected}password_»)."
        )
    if f":{expected}publickey_" not in public_key:
        raise CredentialsInvalid(
            f"La clave pública no es de {'pruebas' if is_test else 'producción'} "
            f"(formato «{shop_id}:{expected}publickey_…»)."
        )
    if not public_key.startswith(f"{shop_id}:"):
        raise CredentialsInvalid("La clave pública no corresponde a ese Shop ID.")

    # SDKTest: llamada autenticada que no crea ninguna operación. Comprueba
    # Shop ID + password; la clave HMAC no se puede validar sin un pago.
    url = settings.IZIPAY_REST_URL.rsplit("/Charge/", 1)[0] + "/Charge/SDKTest"
    auth = base64.b64encode(f"{shop_id}:{password}".encode()).decode()
    try:
        response = requests.post(
            url,
            json={"value": "clubrave"},
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
            timeout=(5, 15),
        )
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise CredentialsInvalid("No se pudo contactar a Izipay para validar las credenciales.") from exc
    if data.get("status") != "SUCCESS":
        message = (data.get("answer") or {}).get("errorMessage") or "credenciales rechazadas"
        raise CredentialsInvalid(f"Izipay rechazó el Shop ID o el password de API REST: {message}.")


def _verify_mercadopago(creds: dict[str, str], environment: str) -> None:
    if (
        environment == PaymentProvider.Environment.PRODUCTION
        and not settings.FRONTEND_STORE_URL.startswith("https://")
    ):
        raise CredentialsInvalid(
            "Mercado Pago en producción exige que la tienda use https (FRONTEND_STORE_URL)."
        )
    try:
        response = requests.get(
            f"{settings.MERCADOPAGO_API_BASE_URL.rstrip('/')}/users/me",
            headers={"Authorization": f"Bearer {creds['access_token'].strip()}"},
            timeout=(5, 15),
        )
    except requests.RequestException as exc:
        raise CredentialsInvalid("No se pudo contactar a Mercado Pago para validar el access token.") from exc
    if response.status_code != 200:
        raise CredentialsInvalid("Mercado Pago rechazó el access token.")


PROVIDERS: dict[str, ProviderSpec] = {
    "izipay": ProviderSpec(
        id="izipay",
        label="Izipay",
        buyer_label="Tarjeta de crédito o débito",
        fields=(
            CredentialField("shop_id", "Shop ID", secret=False, help="Identificador de la tienda"),
            CredentialField(
                "public_key",
                "Clave pública",
                secret=False,
                help="Formato shopId:testpublickey_… / prodpublickey_…",
            ),
            CredentialField(
                "rest_password",
                "Password de API REST",
                secret=True,
                help="Firma el IPN servidor a servidor",
            ),
            CredentialField(
                "hmac_key",
                "Clave HMAC-SHA256",
                secret=True,
                help="Firma la respuesta que vuelve al navegador",
            ),
        ),
        verify=_verify_izipay,
        webhook_url_name="izipay-webhook",
    ),
    "mercadopago": ProviderSpec(
        id="mercadopago",
        label="Mercado Pago",
        buyer_label="Mercado Pago",
        fields=(
            CredentialField(
                "access_token", "Access token", secret=True, help="Tus integraciones › Credenciales"
            ),
            CredentialField(
                "webhook_secret",
                "Clave secreta del webhook",
                secret=True,
                help="Tus integraciones › Webhooks",
            ),
        ),
        verify=_verify_mercadopago,
        webhook_url_name="mercadopago-webhook",
    ),
}


# ── Lectura de la configuración guardada ────────────────────────────────────


def mask(value: str) -> str:
    return "••••" + value[-4:] if len(value) > 4 else "••••"


def build_hints(provider_id: str, creds: dict[str, str]) -> dict[str, str]:
    spec = PROVIDERS[provider_id]
    return {
        f.name: (mask(creds[f.name]) if f.secret else creds[f.name])
        for f in spec.fields
        if creds.get(f.name)
    }


def store_credentials(row: PaymentProvider, creds: dict[str, str]) -> None:
    row.credentials = encrypt_credentials(creds)
    row.hints = build_hints(row.provider, creds)


def credentials_of(row: PaymentProvider) -> dict[str, str]:
    return decrypt_credentials(row.credentials)


def checkout_methods() -> list[str]:
    """Medios con los que la tienda puede cobrar ahora, en el orden del registro."""
    config = PaymentSettings.load()
    if config.mode == PaymentSettings.Mode.FAKE:
        return [FAKE]
    if config.mode == PaymentSettings.Mode.DISABLED:
        return []
    active = set(
        PaymentProvider.objects.filter(enabled=True)
        .exclude(credentials="")
        .values_list("provider", flat=True)
    )
    return [pid for pid in PROVIDERS if pid in active]


def method_label(method: str) -> str:
    return "Simulador de pagos" if method == FAKE else PROVIDERS[method].buyer_label


# ── Importación única desde las variables de entorno heredadas ─────────────


def _env_credentials() -> dict[str, dict[str, str]]:
    return {
        "izipay": {
            "shop_id": settings.IZIPAY_SHOP_ID,
            "public_key": settings.IZIPAY_PUBLIC_KEY,
            "rest_password": settings.IZIPAY_REST_PASSWORD,
            "hmac_key": settings.IZIPAY_HMAC_SHA256_KEY,
        },
        "mercadopago": {
            "access_token": settings.MERCADOPAGO_ACCESS_TOKEN,
            "webhook_secret": settings.MERCADOPAGO_WEBHOOK_SECRET,
        },
    }


def import_from_environment(config: PaymentSettings) -> None:
    """Traslada `PAYMENT_GATEWAY` y las llaves del entorno a la base, cifradas.

    Corre una sola vez, al crearse la configuración. Así un despliegue que ya
    cobraba con Izipay sigue cobrando sin pasar por el panel."""
    legacy = settings.PAYMENT_GATEWAY
    environments = {"izipay": settings.IZIPAY_MODE, "mercadopago": settings.MERCADOPAGO_MODE}

    for provider_id, creds in _env_credentials().items():
        if not all(creds.values()):
            continue
        row = PaymentProvider(
            provider=provider_id,
            enabled=legacy == provider_id,
            environment=(
                PaymentProvider.Environment.PRODUCTION
                if environments[provider_id] == "production"
                else PaymentProvider.Environment.TEST
            ),
        )
        try:
            store_credentials(row, creds)
        except CredentialsKeyMissing:
            logger.error(
                "Hay credenciales de %s en el entorno pero falta PAYMENT_CREDENTIALS_KEY.", provider_id
            )
            continue
        row.save()

    if legacy == FAKE:
        config.mode = PaymentSettings.Mode.FAKE
    elif legacy in PROVIDERS and PaymentProvider.objects.filter(provider=legacy, enabled=True).exists():
        config.mode = PaymentSettings.Mode.LIVE
    else:
        config.mode = PaymentSettings.Mode.DISABLED
    config.save(update_fields=["mode"])
    logger.info("Configuración de pagos importada del entorno: modo %s.", config.mode)


def mark_verified(row: PaymentProvider) -> None:
    row.verified_at = timezone.now()
