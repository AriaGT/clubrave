from django.contrib import admin

from .models import Event, EventImage, TicketType


class EventImageInline(admin.TabularInline):
    model = EventImage
    extra = 0


class TicketTypeInline(admin.TabularInline):
    model = TicketType
    extra = 0
    readonly_fields = ["quantity_sold", "quantity_reserved"]


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["title", "organization", "status", "starts_at", "city"]
    list_filter = ["status", "city"]
    search_fields = ["title", "slug", "organization__name"]
    prepopulated_fields = {"slug": ("title",)}
    inlines = [EventImageInline, TicketTypeInline]
    list_select_related = ["organization"]


@admin.register(TicketType)
class TicketTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "event", "price", "quantity_sold", "quantity_total", "is_active"]
    search_fields = ["name", "event__title"]
    readonly_fields = ["quantity_sold", "quantity_reserved"]
    list_select_related = ["event"]
