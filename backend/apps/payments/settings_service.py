"""Guardado de la configuración de pagos desde el panel.

Todo se valida antes de escribir: si una sola credencial es rechazada por su
proveedor, no se guarda nada y el panel recibe el error por pasarela.
"""

from dataclasses import dataclass

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .crypto import CredentialsKeyMissing, CredentialsUnreadable
from .models import PaymentProvider, PaymentSettings
from .providers import PROVIDERS, CredentialsInvalid, credentials_of, mark_verified, store_credentials


@dataclass
class _Staged:
    row: PaymentProvider
    enabled: bool
    environment: str
    new_credentials: dict[str, str] | None  # None = se conservan las guardadas
    verified: bool


def _stage_provider(provider_id: str, update: dict, row: PaymentProvider) -> _Staged:
    spec = PROVIDERS[provider_id]
    field_names = {f.name for f in spec.fields}

    incoming = {k: v.strip() for k, v in (update.get("credentials") or {}).items() if v and v.strip()}
    unknown = set(incoming) - field_names
    if unknown:
        raise CredentialsInvalid(f"Campos desconocidos: {', '.join(sorted(unknown))}.")

    environment = update.get("environment", row.environment)
    environment_changed = row.pk is not None and environment != row.environment

    current: dict[str, str] = {}
    if row.credentials:
        try:
            current = credentials_of(row)
        except CredentialsUnreadable:
            current = {}  # clave maestra cambiada: hay que volver a ingresarlas todas

    if environment_changed and row.credentials and set(incoming) != field_names:
        raise CredentialsInvalid(
            "Al cambiar entre pruebas y producción vuelve a ingresar todas las credenciales."
        )

    merged = incoming if environment_changed else {**current, **incoming}
    enabled = update.get("enabled", row.enabled)
    missing = [f.label for f in spec.fields if not merged.get(f.name)]
    if (incoming or enabled) and missing:
        raise CredentialsInvalid(f"Faltan credenciales: {', '.join(missing)}.")

    # Se valida contra el proveedor cuando cambian las llaves o el entorno,
    # y al activar unas que nadie validó (p. ej. importadas del entorno).
    must_verify = bool(incoming) or environment_changed or (enabled and row.verified_at is None)
    if must_verify:
        spec.verify(merged, environment)

    return _Staged(
        row=row,
        enabled=enabled,
        environment=environment,
        new_credentials=merged if (incoming or environment_changed) else None,
        verified=must_verify,
    )


def update_payment_settings(data: dict) -> dict:
    """Aplica el cambio y devuelve un resumen para la bitácora (sin secretos)."""
    config = PaymentSettings.load()
    rows = {r.provider: r for r in PaymentProvider.objects.all()}

    errors: dict[str, str] = {}
    staged: list[_Staged] = []
    for provider_id, update in (data.get("providers") or {}).items():
        if provider_id not in PROVIDERS:
            errors[provider_id] = "Medio de pago desconocido."
            continue
        row = rows.get(provider_id) or PaymentProvider(provider=provider_id)
        try:
            staged.append(_stage_provider(provider_id, update, row))
        except CredentialsInvalid as exc:
            errors[provider_id] = str(exc)
    if errors:
        raise ValidationError({"providers": errors})

    mode = data.get("mode", config.mode)
    enabled_after = {pid for pid, r in rows.items() if r.enabled and r.configured}
    for s in staged:
        has_credentials = bool(s.new_credentials) or s.row.configured
        if s.enabled and has_credentials:
            enabled_after.add(s.row.provider)
        else:
            enabled_after.discard(s.row.provider)
    if mode == PaymentSettings.Mode.LIVE and not enabled_after:
        raise ValidationError({"mode": "Activa al menos un medio de pago con sus credenciales."})

    try:
        with transaction.atomic():
            for s in staged:
                s.row.enabled = s.enabled
                s.row.environment = s.environment
                if s.new_credentials is not None:
                    store_credentials(s.row, s.new_credentials)
                if s.verified:
                    mark_verified(s.row)
                s.row.save()
            config.mode = mode
            config.save(update_fields=["mode", "updated_at"])
    except CredentialsKeyMissing as exc:
        raise ValidationError(
            {"detail": "El servidor no tiene PAYMENT_CREDENTIALS_KEY: no se pueden guardar credenciales."}
        ) from exc

    return {
        "mode": mode,
        "enabled": sorted(enabled_after),
        "credentials_changed": sorted(s.row.provider for s in staged if s.new_credentials is not None),
    }
