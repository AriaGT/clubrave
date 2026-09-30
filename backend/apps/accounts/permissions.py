"""Dos puertas de entrada, un solo mecanismo (JWT con `scope`).

Un token de comprador jamás abre un endpoint /org/ y viceversa (regla A6).
"""

from rest_framework.permissions import BasePermission


def _scope(request) -> str | None:
    auth = getattr(request, "auth", None)
    if auth is None:
        return None
    return auth.get("scope")


class IsOrganizer(BasePermission):
    message = "Esta acción requiere una sesión de organizador."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and _scope(request) == "org"
            and request.user.is_active
            and request.auth.get("organization_id")
        )


class IsCustomer(BasePermission):
    message = "Esta acción requiere una sesión de comprador."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and _scope(request) == "customer"
            and request.user.is_active
        )


class IsOrganizationMember(BasePermission):
    """Comprueba que el objeto pertenezca a la organización del token."""

    message = "Este recurso no pertenece a tu organización."

    def has_object_permission(self, request, view, obj):
        organization_id = request.auth.get("organization_id")
        obj_org_id = getattr(obj, "organization_id", None) or getattr(
            getattr(obj, "event", None), "organization_id", None
        )
        return str(obj_org_id) == str(organization_id)


class IsCustomerOwner(BasePermission):
    """Comprueba que la orden/entrada pertenezca al comprador del token."""

    message = "Este recurso no te pertenece."

    def has_object_permission(self, request, view, obj):
        customer_id = getattr(obj, "customer_id", None) or getattr(
            getattr(obj, "order", None), "customer_id", None
        )
        return str(customer_id) == str(request.user.id)


class IsOrganizationOwner(IsOrganizer):
    """Organizador con rol OWNER en la organización del token. Para ajustes
    que no son de un evento (p. ej. la configuración del sitio público): el
    personal de puerta no debe poder cambiarlos."""

    message = "Esta acción requiere ser dueño de la organización."

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        from .models import Membership

        return Membership.objects.filter(
            user=request.user,
            organization_id=request.auth.get("organization_id"),
            role=Membership.Role.OWNER,
        ).exists()
