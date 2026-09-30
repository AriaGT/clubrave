from django.contrib import admin

from .models import PaymentEvent


@admin.register(PaymentEvent)
class PaymentEventAdmin(admin.ModelAdmin):
    list_display = ["order", "kind", "external_id", "signature_valid", "received_at"]
    list_filter = ["kind", "signature_valid"]
    search_fields = ["order__code", "external_id"]
    list_select_related = ["order"]
    readonly_fields = ["raw_payload"]
