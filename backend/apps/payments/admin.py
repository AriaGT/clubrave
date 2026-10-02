from django.contrib import admin

from .models import PaymentEvent, PaymentProvider, PaymentSettings


@admin.register(PaymentEvent)
class PaymentEventAdmin(admin.ModelAdmin):
    list_display = ["order", "kind", "external_id", "signature_valid", "received_at"]
    list_filter = ["kind", "signature_valid"]
    search_fields = ["order__code", "external_id"]
    list_select_related = ["order"]
    readonly_fields = ["raw_payload"]


@admin.register(PaymentSettings)
class PaymentSettingsAdmin(admin.ModelAdmin):
    list_display = ["mode", "updated_at"]


@admin.register(PaymentProvider)
class PaymentProviderAdmin(admin.ModelAdmin):
    # Las credenciales cifradas no se muestran ni se editan desde aquí: se
    # cargan y validan desde el panel (Ajustes › Medios de pago).
    list_display = ["provider", "enabled", "environment", "verified_at", "updated_at"]
    exclude = ["credentials"]
    readonly_fields = ["hints", "verified_at"]
