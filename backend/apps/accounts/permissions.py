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
    """Sesión de organizador. La membresía de dueño y que la organización
    siga activa se re-verifican en cada petición (igual que `IsDoorStaff`):
    desactivar la organización o quitarle el acceso al organizador surte
    efecto de inmediato, sin esperar a que venza el access token."""

    message = "Esta acción requiere una sesión de organizador."

    def has_permission(self, request, view):
        if not (
            request.user
            and request.user.is_authenticated
            and _scope(request) == "org"
            and request.user.is_active
            and request.auth.get("organization_id")
        ):
            return False
        from .models import Membership

        return Membership.objects.filter(
            user=request.user,
            organization_id=request.auth.get("organization_id"),
            organization__is_active=True,
            role=Membership.Role.OWNER,
        ).exists()


class IsPlatformAdmin(BasePermission):
    """Administrador del sistema: sesión con scope "admin" de un superusuario
    activo. `request.user` se carga de la base en cada petición, así que
    quitarle `is_superuser` a alguien invalida su token de inmediato. Es el
    único permiso que abre `/api/admin/`; ningún otro scope entra ahí."""

    message = "Esta acción requiere ser administrador del sistema."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and _scope(request) == "admin"
            and request.user.is_active
            and request.user.is_superuser
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
    """Dueño de la organización del token. `IsOrganizer` ya exige la
    membresía OWNER, así que hoy son equivalentes; se conserva el nombre para
    los ajustes que no son de un evento hasta retirarlos (fase 3 del plan)."""

    message = "Esta acción requiere ser dueño de la organización."


def is_door_session(request) -> bool:
    """Sesión de personal de seguridad (scope "door"): solo escáner."""
    return _scope(request) == "door"


class IsDoorStaff(BasePermission):
    """Empleado de seguridad con membresía vigente en la organización del
    token. La membresía se re-verifica en cada petición: si el organizador lo
    elimina, el access token aún vigente deja de servir de inmediato."""

    message = "Esta acción requiere una sesión de seguridad."

    def has_permission(self, request, view):
        if not (
            request.user
            and request.user.is_authenticated
            and is_door_session(request)
            and request.user.is_active
            and request.auth.get("organization_id")
        ):
            return False
        from .models import Membership

        membership = (
            Membership.objects.filter(
                user=request.user,
                organization_id=request.auth.get("organization_id"),
                organization__is_active=True,
                role=Membership.Role.SECURITY,
            )
            .select_related("organization")
            .first()
        )
        request.door_membership = membership
        return membership is not None


class CanScan(BasePermission):
    """Módulo de escáner: organizador (sin restricciones) o seguridad (con
    ventana horaria y eventos asignados, ver `apps/checkin/door.py`). Es el
    ÚNICO permiso que abre un endpoint /org/ al scope "door"; todo lo demás
    usa `IsOrganizer`, que exige scope "org" y por eso le responde 403."""

    message = "Esta acción requiere una sesión del panel."

    def has_permission(self, request, view):
        return IsOrganizer().has_permission(request, view) or IsDoorStaff().has_permission(request, view)
