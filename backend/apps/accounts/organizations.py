"""Organizaciones: alta, edición y activación desde la consola `/admin`.

Desactivar una organización la saca de juego de inmediato: `IsOrganizer` y
`IsDoorStaff` verifican `is_active` en cada petición, y además se cierran las
sesiones de todos sus usuarios para que no queden refresh tokens vivos.
"""

from django.db import transaction
from django.utils.text import slugify

from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.models import AuditLog

from .models import Organization, User
from .services import revoke_all_sessions


def _unique_slug(name: str) -> str:
    base = slugify(name)[:40] or "organizacion"
    slug, counter = base, 2
    while Organization.objects.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


@transaction.atomic
def create_organization(*, actor: User | None, name: str, contact_email: str, timezone: str = "America/Lima"):
    name = name.strip()
    if not name:
        raise DomainError("VALIDATION_ERROR", "El nombre de la organización es obligatorio.")
    organization = Organization.objects.create(
        name=name, slug=_unique_slug(name), contact_email=contact_email, timezone=timezone
    )
    record(
        actor=actor,
        organization=organization,
        action=AuditLog.Action.ORGANIZATION_CREATED,
        target=organization,
    )
    return organization


@transaction.atomic
def update_organization(*, organization: Organization, actor: User, data: dict) -> Organization:
    changes: dict = {}
    for field in ("name", "contact_email", "timezone"):
        if field in data and data[field] != getattr(organization, field):
            changes[field] = {"old": getattr(organization, field), "new": data[field]}
            setattr(organization, field, data[field])
    if changes:
        organization.save(update_fields=[*changes, "updated_at"])
        record(
            actor=actor,
            organization=organization,
            action=AuditLog.Action.ORGANIZATION_UPDATED,
            target=organization,
            changes=changes,
        )

    if "is_active" in data and data["is_active"] != organization.is_active:
        organization.is_active = data["is_active"]
        organization.save(update_fields=["is_active", "updated_at"])
        if not organization.is_active:
            for membership in organization.memberships.select_related("user"):
                revoke_all_sessions(membership.user)
        record(
            actor=actor,
            organization=organization,
            action=(
                AuditLog.Action.ORGANIZATION_REACTIVATED
                if organization.is_active
                else AuditLog.Action.ORGANIZATION_DEACTIVATED
            ),
            target=organization,
        )
    return organization
