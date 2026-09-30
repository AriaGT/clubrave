from rest_framework import serializers

from .models import User


class MeSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "full_name", "phone", "document_id", "marketing_consent"]
        read_only_fields = ["id", "email"]


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class OrgLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class RequestCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()


class VerifyCodeSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    code = serializers.CharField(required=False, allow_blank=True)
    token = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("token") and not (attrs.get("email") and attrs.get("code")):
            raise serializers.ValidationError("Envía {email, code} o {token}.")
        return attrs


class PasswordChangeRequestSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)


class PasswordChangeConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
