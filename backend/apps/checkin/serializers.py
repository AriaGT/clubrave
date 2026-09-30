from rest_framework import serializers

from .services import UNDO_REASON_CODES


class CheckInRequestSerializer(serializers.Serializer):
    qr_payload = serializers.CharField(required=False, allow_blank=True)
    manual_code = serializers.CharField(required=False, allow_blank=True)
    event_id = serializers.UUIDField()


class CheckInTicketSerializer(serializers.Serializer):
    code = serializers.CharField()
    ticket_type_name = serializers.CharField()
    holder_name = serializers.CharField()
    order_code = serializers.CharField()
    checked_in_at = serializers.DateTimeField()


class CheckInResponseSerializer(serializers.Serializer):
    result = serializers.CharField()
    ticket = CheckInTicketSerializer()


class CheckInLookupQuerySerializer(serializers.Serializer):
    qr_payload = serializers.CharField(required=False, allow_blank=True)
    manual_code = serializers.CharField(required=False, allow_blank=True)
    event_id = serializers.UUIDField()


class UndoCheckInSerializer(serializers.Serializer):
    reason_code = serializers.ChoiceField(choices=UNDO_REASON_CODES)
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
