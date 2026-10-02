from django.urls import reverse
from rest_framework import serializers

from .models import PaymentProvider, PaymentSettings


class CredentialFieldSerializer(serializers.Serializer):
    name = serializers.CharField()
    label = serializers.CharField()
    secret = serializers.BooleanField()
    help = serializers.CharField()


class ProviderStateSerializer(serializers.Serializer):
    """Lo que el panel ve de una pasarela. Nunca incluye credenciales: solo
    `hints` (valores públicos completos, secretos como ••••1234)."""

    id = serializers.CharField()
    label = serializers.CharField()
    enabled = serializers.BooleanField()
    environment = serializers.ChoiceField(choices=PaymentProvider.Environment.choices)
    configured = serializers.BooleanField()
    verified_at = serializers.DateTimeField(allow_null=True)
    hints = serializers.DictField(child=serializers.CharField())
    fields = CredentialFieldSerializer(many=True)
    webhook_url = serializers.CharField()


class PaymentSettingsStateSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=PaymentSettings.Mode.choices)
    # Sin la clave maestra no se puede guardar ninguna credencial.
    credentials_key_configured = serializers.BooleanField()
    providers = ProviderStateSerializer(many=True)


class ProviderUpdateSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(required=False)
    environment = serializers.ChoiceField(choices=PaymentProvider.Environment.choices, required=False)
    # Solo los campos que se quieren reemplazar; vacío u omitido = se conserva.
    credentials = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)


class PaymentSettingsUpdateSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=PaymentSettings.Mode.choices, required=False)
    providers = serializers.DictField(child=ProviderUpdateSerializer(), required=False)


def provider_state(spec, row: PaymentProvider | None, request) -> dict:
    return {
        "id": spec.id,
        "label": spec.label,
        "enabled": bool(row and row.enabled),
        "environment": row.environment if row else PaymentProvider.Environment.TEST,
        "configured": bool(row and row.configured),
        "verified_at": row.verified_at if row else None,
        "hints": (row.hints if row else {}) or {},
        "fields": [
            {"name": f.name, "label": f.label, "secret": f.secret, "help": f.help} for f in spec.fields
        ],
        "webhook_url": request.build_absolute_uri(reverse(spec.webhook_url_name)),
    }
