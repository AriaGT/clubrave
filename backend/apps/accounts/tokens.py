"""Refresh de JWT tolerante a carreras (sesión estable en la PWA).

El refresh estándar de simplejwt, con `ROTATE_REFRESH_TOKENS` +
`BLACKLIST_AFTER_ROTATION`, rota y pone en lista negra el refresh token en
*cada* llamada. Eso cerraba la sesión del panel en dos situaciones muy
comunes en la PWA instalada (sobre todo iOS):

1. **Refrescos simultáneos**: al volver la app del segundo plano con el
   access token vencido, varias consultas reciben 401 a la vez y refrescan en
   paralelo con el mismo token. La primera lo rota; las demás llegan con un
   token ya en lista negra → 401 → la cookie se borraba → logout.
2. **Respuesta perdida**: iOS congela la PWA a mitad de un refresh. El
   backend ya rotó el token, pero el `Set-Cookie` con el nuevo nunca llega;
   al reabrir, la cookie tiene el token viejo (en lista negra) → logout.

Este serializer:

- Solo rota si el refresh token tiene más de
  `JWT_REFRESH_ROTATE_AFTER_SECONDS` (12 h por defecto). La mayoría de los
  refrescos devuelven solo un access nuevo y no tocan la cookie: sin rotación
  no hay carrera posible.
- Si llega un token ya rotado dentro de `JWT_REFRESH_REUSE_GRACE_SECONDS`
  (2 min por defecto) desde su rotación, lo acepta y emite un par nuevo en
  vez de rechazarlo. Solo aplica a tokens que salieron de la lista por
  *rotación* (`RefreshTokenRotation`): los revocados por cambio de
  contraseña, desactivación o reseteo nunca entran en la gracia.
"""

from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone
from rest_framework_simplejwt.exceptions import AuthenticationFailed, TokenBackendError, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.state import token_backend
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .models import RefreshTokenRotation, User


def _grace_seconds() -> int:
    return getattr(settings, "JWT_REFRESH_REUSE_GRACE_SECONDS", 120)


def _rotate_after_seconds() -> int:
    return getattr(settings, "JWT_REFRESH_ROTATE_AFTER_SECONDS", 12 * 60 * 60)


class GraceTokenRefreshSerializer(TokenRefreshSerializer):
    # Qué scopes refresca este serializer y si rota el refresh. La sesión de
    # la consola (scope "admin") tiene su propio endpoint: aquí no entra, y
    # el suyo no acepta ningún otro scope.
    refresh_lifetime = None  # None: el de `SIMPLE_JWT`
    rotates = True

    def accepts(self, refresh: RefreshToken, user: User) -> bool:
        return refresh.get("scope") != "admin"

    def _token_within_grace(self, raw: str, original: TokenError) -> RefreshToken:
        """Un token rechazado solo por estar en lista negra se acepta si fue
        *rotado* hace menos de la ventana de gracia. Firma y vencimiento se
        verifican igual con el backend; solo se salta la lista negra."""
        try:
            token_backend.decode(raw, verify=True)
            token = self.token_class(raw, verify=False)
        except (TokenError, TokenBackendError):
            raise original from None
        if token.get(api_settings.TOKEN_TYPE_CLAIM) != "refresh":
            raise original
        cutoff = timezone.now() - timedelta(seconds=_grace_seconds())
        rotated = RefreshTokenRotation.objects.filter(
            jti=token.get(api_settings.JTI_CLAIM), rotated_at__gte=cutoff
        ).exists()
        if not rotated:
            raise original
        return token

    def validate(self, attrs):
        raw = attrs["refresh"]
        try:
            refresh = self.token_class(raw)
            reused = False
        except TokenError as exc:
            refresh = self._token_within_grace(raw, exc)
            reused = True

        user_id = refresh.payload.get(api_settings.USER_ID_CLAIM)
        user = User.objects.filter(**{api_settings.USER_ID_FIELD: user_id}).first() if user_id else None
        if (
            user is None
            or not api_settings.USER_AUTHENTICATION_RULE(user)
            or not self.accepts(refresh, user)
        ):
            raise AuthenticationFailed(self.error_messages["no_active_account"], "no_active_account")

        data = {"access": str(refresh.access_token)}

        issued_at = refresh.payload.get("iat")
        age = timezone.now().timestamp() - issued_at if issued_at else None
        must_rotate = self.rotates and (reused or age is None or age >= _rotate_after_seconds())
        if not must_rotate:
            return data

        if not reused:
            old_jti = refresh.get(api_settings.JTI_CLAIM)
            refresh.blacklist()
            try:
                RefreshTokenRotation.objects.get_or_create(jti=old_jti, defaults={"user": user})
            except IntegrityError:
                pass  # otra petición en carrera ya lo registró
            # Limpieza: las marcas solo sirven durante la ventana de gracia.
            RefreshTokenRotation.objects.filter(
                user=user, rotated_at__lt=timezone.now() - timedelta(days=1)
            ).delete()

        refresh.set_jti()
        refresh.set_exp(lifetime=self.refresh_lifetime)
        refresh.set_iat()
        refresh.outstand()
        data["refresh"] = str(refresh)
        return data


class GraceTokenRefreshView(TokenRefreshView):
    serializer_class = GraceTokenRefreshSerializer


class AdminTokenRefreshSerializer(GraceTokenRefreshSerializer):
    """Refresh de la consola: solo tokens con scope "admin" de un
    superusuario activo. Sesión absoluta de 12 h: no se rota el refresh, así
    que al vencer hay que volver a iniciar sesión."""

    rotates = False

    def accepts(self, refresh: RefreshToken, user: User) -> bool:
        return refresh.get("scope") == "admin" and user.is_superuser


class AdminTokenRefreshView(TokenRefreshView):
    serializer_class = AdminTokenRefreshSerializer
