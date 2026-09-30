from django.contrib import admin

from .models import Order, OrderItem, Ticket


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["ticket_type_name", "unit_price", "quantity", "subtotal"]


class TicketInline(admin.TabularInline):
    model = Ticket
    extra = 0
    readonly_fields = ["code", "status", "checked_in_at", "checked_in_by"]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["code", "event", "status", "total", "buyer_email", "created_at"]
    list_filter = ["status", "gateway"]
    search_fields = ["code", "buyer_email", "gateway_reference"]
    list_select_related = ["event"]
    readonly_fields = ["subtotal", "service_fee", "total", "code"]
    inlines = [OrderItemInline, TicketInline]


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ["code", "order", "ticket_type", "status", "checked_in_at"]
    list_filter = ["status"]
    search_fields = ["code", "order__code", "order__buyer_email"]
    list_select_related = ["order", "ticket_type"]
