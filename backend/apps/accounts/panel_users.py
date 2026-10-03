"""Usuarios del panel: organizadores y porteros.

Los da de alta el administrador del sistema (consola `/admin`). Ambos
inician sesión en el mismo login del panel con email + contraseña (la
inicial la define quien los crea, igual que el reseteo):

- **Organizador**: `User.role=ORGANIZER` + `Membership.role=OWNER`. JWT con
  scope "org": eventos, ventas y escáner.
- **Portero** (en el código, "empleado" de seguridad): `User.role=STAFF` +
  `Membership.role=SECURITY` en exactamente una organización. JWT con scope
  "door": solo el escáner (ver `permissions.CanScan`).

Cada acción queda en la bitácora de la organización (`common.audit.record`).
"""

import secrets

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from apps.common.audit import record
from apps.common.errors import DomainError
from apps.common.models import AuditLog

from .models import Membership, Organization, User
from .services import revoke_all_sessions

_ORGANIZER_ACTIONS = {
    "updated": AuditLog.Action.ORGANIZER_UPDATED,
    "deactivated": AuditLog.Action.ORGANIZER_DEACTIVATED,
    "reactivated": AuditLog.Action.ORGANIZER_REACTIVATED,
    "password_reset": AuditLog.Action.ORGANIZER_PASSWORD_RESET,
}
_EMPLOYEE_ACTIONS = {
    "updated": AuditLog.Action.EMPLOYEE_UPDATED,
    "deactivated": AuditLog.Action.EMPLOYEE_DEACTIVATED,
    "reactivated": AuditLog.Action.EMPLOYEE_REACTIVATED,
    "password_reset": AuditLog.Action.EMPLOYEE_PASSWORD_RESET,
}


def _actions_for(membership: Membership) -> dict:
    return _ORGANIZER_ACTIONS if membership.role == Membership.Role.OWNER else _EMPLOYEE_ACTIONS


def _validate_password(password: str, user: User | None = None) -> None:
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise DomainError("VALIDATION_ERROR", " ".join(exc.messages)) from exc


def generate_password() -> str:
    """Contraseña inicial legible, que pasa los validadores de Django. El
    administrador se la comunica al usuario: no se vuelve a mostrar."""
    for _ in range(10):
        candidate = secrets.token_urlsafe(12)
        try:
            validate_password(candidate)
        except DjangoValidationError:
            continue
        return candidate
    raise RuntimeError("No se pudo generar una contraseña válida.")


def _organization_events(organization: Organization, event_ids):
    from apps.events.models import Event

    ids = {str(i) for i in event_ids or []}
    events = list(Event.objects.filter(organization=organization, id__in=ids))
    if len(events) != len(ids):
        # Un id de otra organización se trata igual que uno inexistente.
        raise DomainError("VALIDATION_ERROR", "Alguno de los eventos elegidos no existe.")
    return events


@transaction.atomic
def create_employee(
    *,
    organization: Organization,
    actor: User,
    email: str,
    full_name: str,
    password: str,
    all_events: bool = True,
    event_ids=None,
) -> Membership:
    email = User.objects.normalize_email(email).strip().lower()
    if User.objects.filter(email__iexact=email).exists():
        raise DomainError("VALIDATION_ERROR", "Ya existe una cuenta con ese email. Usa otro.")
    events = [] if all_events else _organization_events(organization, event_ids)
    if not all_events and not events:
        raise DomainError("VALIDATION_ERROR", "Elige al menos un evento o habilita todos.")

    candidate = User(email=email, full_name=full_name.strip())
    _validate_password(password, candidate)
    user = User.objects.create_user(
        email=email, password=password, full_name=full_name.strip(), role=User.Role.STAFF
    )
    membership = Membership.objects.create(
        user=user, organization=organization, role=Membership.Role.SECURITY, all_events=all_events
    )
    membership.events.set(events)

    record(
        actor=actor,
        organization=organization,
        action=AuditLog.Action.EMPLOYEE_CREATED,
        target=user,
        role=Membership.Role.SECURITY,
        email=user.email,
        all_events=all_events,
        events=[e.title for e in events],
    )
    return membership


@transaction.atomic
def create_organizer(
    *,
    actor: User | None,
    email: str,
    full_name: str,
    password: str,
    organization: Organization | None = None,
    organization_name: str = "",
) -> Membership:
    """Alta de un organizador. Con `organization` se suma como dueño de una
    existente; con `organization_name` se crea la organización nueva."""
    from .organizations import create_organization

    email = User.objects.normalize_email(email).strip().lower()
    if User.objects.filter(email__iexact=email).exists():
        raise DomainError("VALIDATION_ERROR", "Ya existe una cuenta con ese email. Usa otro.")
    if (organization is None) == (not organization_name.strip()):
        raise DomainError(
            "VALIDATION_ERROR", "Elige una organización existente o escribe el nombre de una nueva."
        )

    candidate = User(email=email, full_name=full_name.strip())
    _validate_password(password, candidate)
    if organization is None:
        organization = create_organization(actor=actor, name=organization_name, contact_email=email)
    user = User.objects.create_user(
        email=email, password=password, full_name=full_name.strip(), role=User.Role.ORGANIZER
    )
    membership = Membership.objects.create(user=user, organization=organization, role=Membership.Role.OWNER)
    record(
        actor=actor,
        organization=organization,
        action=AuditLog.Action.ORGANIZER_CREATED,
        target=user,
        email=user.email,
    )
    return membership


@transaction.atomic
def update_employee(*, membership: Membership, actor: User, data: dict) -> Membership:
    """Cambia nombre, alcance de eventos y/o estado (activo). Desactivar
    cierra todas sus sesiones: el login y los tokens dejan de funcionar.
    También sirve para un organizador (nombre y estado); el alcance de
    eventos solo aplica a los porteros."""
    if membership.role != Membership.Role.SECURITY and ("all_events" in data or "event_ids" in data):
        raise DomainError("VALIDATION_ERROR", "El alcance de eventos solo aplica a los porteros.")
    user = membership.user
    organization = membership.organization
    changes: dict = {}

    if "full_name" in data and data["full_name"].strip() != user.full_name:
        changes["full_name"] = {"old": user.full_name, "new": data["full_name"].strip()}
        user.full_name = data["full_name"].strip()
        user.save(update_fields=["full_name"])

    scope_touched = "all_events" in data or "event_ids" in data
    if scope_touched:
        all_events = data.get("all_events", membership.all_events)
        if all_events:
            events = []
        elif "event_ids" in data:
            events = _organization_events(organization, data["event_ids"])
        else:
            events = list(membership.events.all())
        if not all_events and not events:
            raise DomainError("VALIDATION_ERROR", "Elige al menos un evento o habilita todos.")
        old_titles = sorted(e.title for e in membership.events.all())
        new_titles = sorted(e.title for e in events)
        if all_events != membership.all_events or old_titles != new_titles:
            changes["events"] = {
                "old": "Todos" if membership.all_events else old_titles,
                "new": "Todos" if all_events else new_titles,
            }
        membership.all_events = all_events
        membership.save(update_fields=["all_events", "updated_at"])
        membership.events.set(events)

    if changes:
        record(
            actor=actor,
            organization=organization,
            action=_actions_for(membership)["updated"],
            target=user,
            changes=changes,
        )

    if "is_active" in data and data["is_active"] != user.is_active:
        user.is_active = data["is_active"]
        user.save(update_fields=["is_active"])
        if not user.is_active:
            revoke_all_sessions(user)
        actions = _actions_for(membership)
        record(
            actor=actor,
            organization=organization,
            action=actions["reactivated"] if user.is_active else actions["deactivated"],
            target=user,
        )
    return membership


@transaction.atomic
def reset_member_password(*, membership: Membership, actor: User, password: str) -> None:
    """Quien administra define la contraseña nueva y se la comunica al
    usuario. Cierra las sesiones abiertas con la contraseña anterior."""
    user = membership.user
    _validate_password(password, user)
    user.set_password(password)
    user.save(update_fields=["password"])
    revoke_all_sessions(user)
    record(
        actor=actor,
        organization=membership.organization,
        action=_actions_for(membership)["password_reset"],
        target=user,
    )


@transaction.atomic
def revoke_member_sessions(*, membership: Membership, actor: User) -> None:
    """Cierra todas las sesiones sin cambiar la contraseña."""
    revoke_all_sessions(membership.user)
    record(
        actor=actor,
        organization=membership.organization,
        action=AuditLog.Action.SESSIONS_REVOKED,
        target=membership.user,
    )


@transaction.atomic
def delete_employee(*, membership: Membership, actor: User) -> None:
    """Borra la cuenta del empleado. Las entradas que validó conservan la
    hora del ingreso; quién las validó queda en la bitácora
    (`TICKET_CHECKED_IN` guarda el email como fotografía), porque
    `Ticket.checked_in_by` pasa a NULL al borrar el usuario."""
    if membership.role != Membership.Role.SECURITY:
        # Un organizador es dueño de eventos y actor de la bitácora: solo se desactiva.
        raise DomainError("FORBIDDEN", "Un organizador no se elimina: desactívalo.")
    user = membership.user
    organization = membership.organization
    revoke_all_sessions(user)
    record(
        actor=actor,
        organization=organization,
        action=AuditLog.Action.EMPLOYEE_DELETED,
        target=user,
        email=user.email,
    )
    user.delete()
