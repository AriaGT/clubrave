from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id", "created_at", "actor_email", "action", "target_type",
            "target_id", "target_label", "event", "reason", "metadata",
        ]
        read_only_fields = fields