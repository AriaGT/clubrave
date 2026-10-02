from rest_framework import serializers

from apps.orders.documents import DocumentType, InvalidDocument, normalize_document

from .models import User


class MeSerializer(serializers.ModelSerializer):
    document_type = serializers.ChoiceField(choices=DocumentType.choices, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "phone", "document_type", "document_id", "marketing_consent"]
        read_only_fields = ["id", "email"]

    def validate(self, attrs):
        # El perfil puede quedar sin documento, pero si lo tiene debe ser válido:
        # se usa para precargar el checkout, donde es obligatorio.
        doc_type = attrs.get("document_type", getattr(self.instance, "document_type", "")) or DocumentType.DNI
        number = attrs.get("document_id", getattr(self.instance, "document_id", ""))
        if number:
            try:
                attrs["document_id"] = normalize_document(doc_type, number)
            except InvalidDocument as exc:
                raise serializers.ValidationError({"document_id": str(exc)}) from exc
            attrs["document_type"] = doc_type
        return attrs


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
