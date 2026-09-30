from rest_framework import serializers

from .images import process_logo_image
from .models import AuditLog, SiteSettings


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id", "created_at", "actor_email", "action", "target_type",
            "target_id", "target_label", "event", "reason", "metadata",
        ]
        read_only_fields = fields

class SiteSettingsSerializer(serializers.ModelSerializer):
    """Lectura pública y edición desde el panel. `logo` acepta un archivo
    (multipart) o `null` para quitarlo."""

    logo = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = SiteSettings
        fields = [
            "logo", "tagline", "contact_phone", "whatsapp", "contact_email", "address",
            "instagram_url", "tiktok_url", "facebook_url", "youtube_url",
            "complaints_book_url", "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_logo(self, value):
        return process_logo_image(value) if value else None

    def validate_whatsapp(self, value):
        digits = "".join(ch for ch in value if ch.isdigit())
        if value and not 8 <= len(digits) <= 15:
            raise serializers.ValidationError(
                "Escribe el número con código de país, p. ej. +51 987 654 321."
            )
        return value

    def update(self, instance, validated_data):
        if "logo" in validated_data and instance.logo:
            old = instance.logo
            instance = super().update(instance, validated_data)
            old.storage.delete(old.name)  # no deja logos huérfanos en el storage
            return instance
        return super().update(instance, validated_data)
