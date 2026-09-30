from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import LoginCode, Membership, Organization, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    ordering = ["-date_joined"]
    list_display = ["email", "full_name", "role", "is_active", "date_joined"]
    list_filter = ["role", "is_active"]
    search_fields = ["email", "full_name", "phone", "document_id"]
    readonly_fields = ["id", "date_joined", "last_login"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Perfil", {"fields": ("full_name", "phone", "document_id", "marketing_consent")}),
        (
            "Rol y permisos",
            {"fields": ("role", "is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Fechas", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "role", "password1", "password2")}),
    )


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "contact_email", "is_active", "created_at"]
    search_fields = ["name", "slug", "contact_email"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [MembershipInline]


@admin.register(LoginCode)
class LoginCodeAdmin(admin.ModelAdmin):
    list_display = ["email", "created_at", "expires_at", "consumed_at", "attempts"]
    search_fields = ["email"]
    readonly_fields = ["code_hash", "token_hash"]
