"""Autenticación: JWT con `scope` para el organizador y OTP para el comprador."""

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.errors import DomainError
from apps.common.mailer import send as send_email

from .models import LoginCode, Membership, PasswordChangeRequest, RefreshTokenRotation, User

OTP_LENGTH = 6
CODE_TTL_MINUTES = 15
REQUEST_RATE_LIMIT_PER_HOUR = 5
PASSWORD_CHANGE_TTL_MINUTES = 30


@transaction.atomic
def anonymize_account(user: User) -> None:
    """Borrado de cuenta bajo petición (§13.1): anonimiza al comprador y
    desactiva su acceso. Las órdenes NO se tocan — `Order.customer` usa
    `on_delete=PROTECT` a propósito y sus campos `buyer_*` son una
    *fotografía* tomada al pagar (§4.2), que es precisamente el registro
    que hay que conservar por obligación contable. Lo único que este
    comprador podría reconstruir de sí mismo desaparece: el perfil vivo
    (nombre, teléfono, documento) y la posibilidad de volver a entrar con
    este email."""
    anonymous_email = f"eliminado-{user.id.hex}@eliminado.umbral"
    user.email = anonymous_email
    user.full_name = ""
    user.phone = ""
    user.document_type = ""
    user.document_id = ""
    user.marketing_consent = False
    user.is_active = False
    user.set_unusable_password()
    user.save(
        update_fields=[
            "email",
            "full_name",
            "phone",
            "document_type",
            "document_id",
            "marketing_consent",
            "is_active",
            "password",
        ]
    )


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _tokens_for(user: User, *, scope: str, organization_id=None, refresh_lifetime=None) -> dict:
    refresh = RefreshToken.for_user(user)
    if refresh_lifetime is not None:
        refresh.set_exp(lifetime=refresh_lifetime)
    refresh["scope"] = scope
    if organization_id is not None:
        refresh["organization_id"] = str(organization_id)
    access = refresh.access_token
    access["scope"] = scope
    if organization_id is not None:
        access["organization_id"] = str(organization_id)
    return {"access": str(access), "refresh": str(refresh)}


def org_tokens_for_user(user: User) -> dict:
    membership = (
        Membership.objects.filter(user=user, role=Membership.Role.OWNER, organization__is_active=True)
        .select_related("organization")
        .first()
    )
    if membership is None:
        raise DomainError("FORBIDDEN", "Este usuario no administra ninguna organización.")
    return _tokens_for(user, scope="org", organization_id=membership.organization_id)


def door_tokens_for_user(user: User) -> dict:
    """Empleado de seguridad: scope "door". Ningún permiso de organizador
    (`IsOrganizer` exige scope "org") lo acepta, así que cualquier endpoint
    /org/ que no se abra explícitamente al escáner le responde 403."""
    membership = (
        Membership.objects.filter(user=user, role=Membership.Role.SECURITY, organization__is_active=True)
        .select_related("organization")
        .first()
    )
    if membership is None:
        raise DomainError("VALIDATION_ERROR", "Email o contraseña incorrectos.")
    return _tokens_for(user, scope="door", organization_id=membership.organization_id)


def panel_tokens_for_user(user: User) -> dict:
    """Login único del panel: el organizador recibe scope "org"; el
    personal de seguridad, scope "door" (solo escáner)."""
    if user.role == User.Role.ORGANIZER:
        return org_tokens_for_user(user)
    if user.role == User.Role.STAFF:
        return door_tokens_for_user(user)
    raise DomainError("VALIDATION_ERROR", "Email o contraseña incorrectos.")


# La consola maneja las llaves de las pasarelas: su sesión no debe quedar
# abierta un mes como la del panel. Es absoluta (el refresh no se rota).
ADMIN_SESSION_LIFETIME = timedelta(hours=12)


def admin_tokens_for_user(user: User) -> dict:
    """Administrador del sistema: scope "admin", sin organización. Solo
    para superusuarios; `IsPlatformAdmin` es el único permiso que lo acepta."""
    if not (user.is_superuser and user.is_active):
        raise DomainError("VALIDATION_ERROR", "Email o contraseña incorrectos.")
    return _tokens_for(user, scope="admin", refresh_lifetime=ADMIN_SESSION_LIFETIME)


def revoke_all_sessions(user: User) -> None:
    """Pone en lista negra todos los refresh tokens del usuario y borra sus
    marcas de rotación (así ninguno entra en la ventana de gracia de
    `apps/accounts/tokens.py`). Los access tokens ya emitidos vencen solos
    (30 min); si además se desactiva al usuario, simplejwt los rechaza de
    inmediato."""
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)
    RefreshTokenRotation.objects.filter(user=user).delete()


def customer_tokens_for_user(user: User) -> dict:
    return _tokens_for(user, scope="customer")


@transaction.atomic
def request_login_code(*, email: str, ip: str | None = None) -> None:
    """Genera OTP + magic link y los envía por email. Responde siempre 202
    en la vista, exista o no el email: no se filtra quién tiene cuenta."""
    email = email.strip().lower()

    otp = "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))
    magic_token = secrets.token_urlsafe(32)

    LoginCode.objects.create(
        email=email,
        code_hash=_hash(otp),
        token_hash=_hash(magic_token),
        expires_at=timezone.now() + timedelta(minutes=CODE_TTL_MINUTES),
        ip=ip,
    )

    magic_link = f"{settings.FRONTEND_STORE_URL}/ingresar?token={magic_token}"
    send_email(
        to=email,
        subject="Tu código de acceso",
        html=(
            f"<p>Tu código de acceso es <strong>{otp}</strong>. Vence en "
            f"{CODE_TTL_MINUTES} minutos.</p>"
            f"<p>O ingresa directamente con <a href='{magic_link}'>este enlace</a>.</p>"
        ),
    )


def verify_login_code(*, email: str | None, code: str | None, token: str | None) -> User:
    """No se envuelve en `transaction.atomic()`: el registro de un intento
    fallido (`attempts += 1`) debe persistir aunque la función termine
    lanzando un `DomainError` — un atomic() alrededor de todo revertiría ese
    incremento junto con la excepción, y el límite de intentos nunca se
    cumpliría."""
    email = (email or "").strip().lower()

    if token:
        login_code = LoginCode.objects.filter(token_hash=_hash(token)).order_by("-created_at").first()
    elif email and code:
        login_code = LoginCode.objects.filter(email=email).order_by("-created_at").first()
    else:
        raise DomainError("VALIDATION_ERROR", "Falta el código o el enlace de acceso.")

    if login_code is None or not login_code.is_usable():
        raise DomainError("VALIDATION_ERROR", "El código no es válido o ha vencido.")

    if code and not token:
        if _hash(code) != login_code.code_hash:
            LoginCode.objects.filter(id=login_code.id).update(attempts=F("attempts") + 1)
            raise DomainError("VALIDATION_ERROR", "El código no es válido o ha vencido.")

    with transaction.atomic():
        login_code.consumed_at = timezone.now()
        login_code.save(update_fields=["consumed_at"])

        user, _created = User.objects.get_or_create(
            email=login_code.email,
            defaults={"role": User.Role.CUSTOMER},
        )
    return user


@transaction.atomic
def request_password_change(*, user: User, current_password: str, new_password: str) -> None:
    """Paso 1: valida la contraseña actual y la nueva, y envía el enlace de
    confirmación. La contraseña NO cambia hasta que se abre el enlace."""
    if not user.check_password(current_password):
        raise DomainError("VALIDATION_ERROR", "La contraseña actual no es correcta.")
    if current_password == new_password:
        raise DomainError("VALIDATION_ERROR", "La contraseña nueva debe ser distinta a la actual.")
    try:
        validate_password(new_password, user)
    except DjangoValidationError as exc:
        raise DomainError("VALIDATION_ERROR", " ".join(exc.messages)) from exc

    # Una sola solicitud viva: la más reciente invalida las anteriores.
    PasswordChangeRequest.objects.filter(user=user, consumed_at=None).update(consumed_at=timezone.now())

    token = secrets.token_urlsafe(32)
    PasswordChangeRequest.objects.create(
        user=user,
        new_password_hash=make_password(new_password),
        token_hash=_hash(token),
        expires_at=timezone.now() + timedelta(minutes=PASSWORD_CHANGE_TTL_MINUTES),
    )

    link = f"{settings.FRONTEND_PANEL_URL}/confirmar-contrasena?token={token}"
    send_email(
        to=user.email,
        subject="Confirma el cambio de tu contraseña",
        html=(
            "<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta de Club Rave.</p>"
            f"<p><a href='{link}'>Confirmar el cambio de contraseña</a></p>"
            f"<p>El enlace vence en {PASSWORD_CHANGE_TTL_MINUTES} minutos. Si no fuiste tú, "
            "ignora este correo: tu contraseña actual sigue siendo la misma.</p>"
        ),
    )


def confirm_password_change(*, token: str) -> User:
    """Paso 2: aplica la contraseña guardada y cierra las demás sesiones."""
    with transaction.atomic():
        change = (
            PasswordChangeRequest.objects.select_for_update()
            .select_related("user")
            .filter(token_hash=_hash(token))
            .first()
        )
        if change is None or not change.is_usable() or not change.user.is_active:
            raise DomainError("VALIDATION_ERROR", "El enlace no es válido o ha vencido.")

        user = change.user
        user.password = change.new_password_hash
        user.save(update_fields=["password"])
        PasswordChangeRequest.objects.filter(user=user, consumed_at=None).update(consumed_at=timezone.now())

        # Cierra todas las sesiones abiertas: quien tuviera la contraseña vieja
        # (o un refresh token robado) deja de entrar.
        revoke_all_sessions(user)

    send_email(
        to=user.email,
        subject="Tu contraseña fue cambiada",
        html="<p>La contraseña de tu cuenta de Club Rave acaba de cambiar. Si no fuiste tú, contáctanos de inmediato.</p>",
    )
    return user
