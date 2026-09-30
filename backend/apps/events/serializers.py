from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.orders.services.cancellation import CANCELLATION_REASON_CODES

from .image_processing import process_event_image
from .models import Event, EventImage, TicketType


class TicketTypePublicSerializer(serializers.ModelSerializer):
    available = serializers.IntegerField(read_only=True)

    class Meta:
        model = TicketType
        fields = [
            "id", "name", "description", "price", "max_per_order",
            "available", "sales_start_at", "sales_end_at",
        ]


class TicketTypeSerializer(serializers.ModelSerializer):
    available = serializers.IntegerField(read_only=True)

    class Meta:
        model = TicketType
        fields = [
            "id", "event", "name", "description", "price", "quantity_total",
            "quantity_sold", "quantity_reserved", "available", "max_per_order",
            "sales_start_at", "sales_end_at", "is_active", "position",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "event", "quantity_sold", "quantity_reserved", "created_at", "updated_at"]

    def validate_quantity_total(self, value):
        instance: TicketType | None = self.instance
        if instance and value < instance.quantity_sold:
            raise serializers.ValidationError(
                "No puedes bajar el aforo por debajo de lo ya vendido."
            )
        # Lo retenido (compras en curso y códigos de invitado sin usar) también
        # ocupa aforo: sin esto, la CheckConstraint rompería con un 500.
        if instance and value < instance.quantity_sold + instance.quantity_reserved:
            raise serializers.ValidationError(
                "No puedes bajar el aforo por debajo de lo vendido más lo retenido "
                "(compras en curso y códigos de invitado sin usar)."
            )
        return value


class EventImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventImage
        fields = ["id", "event", "kind", "image", "alt", "position", "is_cover"]
        read_only_fields = ["id", "event"]

    def validate_kind(self, value):
        # Cambiar el tipo movería la imagen entre selecciones (`is_cover` es
        # por tipo); para eso se borra y se vuelve a subir.
        if self.instance is not None and value != self.instance.kind:
            raise serializers.ValidationError("El tipo de una imagen no se puede cambiar.")
        return value

    def validate_image(self, value):
        # Nunca se confía en la extensión ni el Content-Type declarado
        # (§5.7 y §13.1): el contenido se abre de verdad con Pillow, se
        # normaliza a WebP y se reemplaza el archivo entrante por ese.
        return process_event_image(value)


class EventPublicListSerializer(serializers.ModelSerializer):
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id", "title", "slug", "starts_at", "ends_at", "city", "venue_name",
            "min_age", "currency", "cover_image", "price_from",
        ]

    price_from = serializers.SerializerMethodField()

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True))
    def get_price_from(self, obj):
        # En Python para aprovechar el `prefetch_related("ticket_types")`.
        prices = [tt.price for tt in obj.ticket_types.all() if tt.is_active]
        return f"{min(prices):.2f}" if prices else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_cover_image(self, obj):
        # Se filtra en Python para aprovechar el `prefetch_related("images")`.
        flyers = [img for img in obj.images.all() if img.kind == EventImage.Kind.FLYER]
        cover = next((img for img in flyers if img.is_cover), flyers[0] if flyers else None)
        if not cover or not cover.image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(cover.image.url) if request else cover.image.url


class EventPublicDetailSerializer(serializers.ModelSerializer):
    images = EventImageSerializer(many=True, read_only=True)
    ticket_types = serializers.SerializerMethodField()
    sales_paused = serializers.BooleanField(read_only=True)

    class Meta:
        model = Event
        fields = [
            "id", "title", "slug", "description", "starts_at", "ends_at",
            "venue_name", "address", "city", "maps_url", "min_age", "currency",
            "images", "ticket_types", "sales_paused",
        ]

    @extend_schema_field(TicketTypePublicSerializer(many=True))
    def get_ticket_types(self, obj):
        active = obj.ticket_types.filter(is_active=True)
        return TicketTypePublicSerializer(active, many=True).data


class EventOrganizerSerializer(serializers.ModelSerializer):
    ticket_types = TicketTypeSerializer(many=True, read_only=True)
    images = EventImageSerializer(many=True, read_only=True)
    sales_paused = serializers.BooleanField(read_only=True)

    class Meta:
        model = Event
        fields = [
            "id", "title", "slug", "description", "status", "starts_at", "ends_at",
            "venue_name", "address", "city", "maps_url", "min_age", "currency",
            "published_at", "images", "ticket_types", "created_at", "updated_at",
            "sales_paused", "cancelled_at", "cancellation_reason", "cancellation_reason_code",
        ]
        read_only_fields = [
            "id", "slug", "status", "published_at", "created_at", "updated_at",
            "sales_paused", "cancelled_at", "cancellation_reason", "cancellation_reason_code",
        ]

    def validate(self, attrs):
        if self.instance is None:
            return attrs

        instance = self.instance
        starts_at = attrs.get("starts_at")
        if starts_at and starts_at <= timezone.now():
            raise serializers.ValidationError(
                {"starts_at": "La fecha de inicio de un evento publicado debe ser futura."}
            )
        new_starts = starts_at or instance.starts_at
        ends_at = attrs.get("ends_at", instance.ends_at)
        if ends_at and ends_at <= new_starts:
            raise serializers.ValidationError(
                {"ends_at": "El fin no puede ser anterior al inicio del evento."}
            )
        return attrs


class AnnounceSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=120)
    message = serializers.CharField(max_length=2000)


class AnnounceResultSerializer(serializers.Serializer):
    recipients = serializers.IntegerField()
    subject = serializers.CharField()
    message = serializers.CharField()


class PauseSalesSerializer(serializers.Serializer):
    paused = serializers.BooleanField()


class UnpublishSerializer(serializers.Serializer):
    """H15 — nivel 2: el motivo es opcional, pero queda en la bitácora."""

    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class DeleteEventSerializer(serializers.Serializer):
    """H15 — nivel 3: para borrar hay que escribir el título y un motivo."""

    reason = serializers.CharField(max_length=200)
    confirm_title = serializers.CharField(max_length=120)


class CancelEventSerializer(serializers.Serializer):
    reason_code = serializers.ChoiceField(choices=CANCELLATION_REASON_CODES)
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    confirm_title = serializers.CharField(max_length=120)


class ChangeImpactSerializer(serializers.Serializer):
    paid_orders = serializers.IntegerField()
    distinct_buyers = serializers.IntegerField()


class CancelPreviewSerializer(serializers.Serializer):
    paid_orders = serializers.IntegerField()
    distinct_buyers = serializers.IntegerField()
    tickets_to_void = serializers.IntegerField()
    tickets_already_checked_in = serializers.IntegerField()
    gross = serializers.CharField()
    currency = serializers.CharField()


class ReorderImagesSerializer(serializers.Serializer):
    order = serializers.ListField(child=serializers.UUIDField())
