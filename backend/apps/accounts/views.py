from django.contrib.auth import authenticate
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common.errors import DomainError

from . import services
from .models import User
from .permissions import IsCustomer, IsOrganizer
from .serializers import (
    MeSerializer,
    OrgLoginSerializer,
    PasswordChangeConfirmSerializer,
    PasswordChangeRequestSerializer,
    RequestCodeSerializer,
    TokenPairSerializer,
    VerifyCodeSerializer,
)


class OrgLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "org_login"

    @extend_schema(request=OrgLoginSerializer, responses=TokenPairSerializer)
    def post(self, request: Request):
        serializer = OrgLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            request,
            username=serializer.validated_data["email"].strip().lower(),
            password=serializer.validated_data["password"],
        )
        if user is None or user.role not in (User.Role.ORGANIZER, User.Role.STAFF):
            raise DomainError("VALIDATION_ERROR", "Email o contraseña incorrectos.")

        # Mismo login para el organizador (scope "org") y el personal de
        # seguridad (scope "door", solo escáner).
        tokens = services.panel_tokens_for_user(user)
        return Response(tokens, status=status.HTTP_200_OK)


class CustomerRequestCodeView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login_code"

    @extend_schema(request=RequestCodeSerializer, responses={202: None})
    def post(self, request: Request):
        serializer = RequestCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.request_login_code(
            email=serializer.validated_data["email"],
            ip=request.META.get("REMOTE_ADDR"),
        )
        # Siempre 202: no se filtra si el email tiene cuenta.
        return Response(status=status.HTTP_202_ACCEPTED)


class CustomerVerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login_code"

    @extend_schema(request=VerifyCodeSerializer, responses=TokenPairSerializer)
    def post(self, request: Request):
        serializer = VerifyCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.verify_login_code(
            email=serializer.validated_data.get("email"),
            code=serializer.validated_data.get("code"),
            token=serializer.validated_data.get("token"),
        )
        tokens = services.customer_tokens_for_user(user)
        return Response(tokens, status=status.HTTP_200_OK)


class MeView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MeSerializer
    permission_classes = [IsCustomer]

    def get_object(self) -> User:
        return self.request.user

    @extend_schema(responses={204: None})
    def delete(self, request, *args, **kwargs):
        """Borrado de cuenta bajo petición (§13.1): anonimiza en vez de
        borrar la fila — el historial de órdenes se conserva por obligación
        contable (ver `services.anonymize_account`)."""
        services.anonymize_account(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordChangeRequestView(APIView):
    """Organizador con sesión: pide cambiar su contraseña; se confirma por email."""

    permission_classes = [IsOrganizer]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_change"

    @extend_schema(request=PasswordChangeRequestSerializer, responses={202: None})
    def post(self, request: Request):
        serializer = PasswordChangeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.request_password_change(
            user=request.user,
            current_password=serializer.validated_data["current_password"],
            new_password=serializer.validated_data["new_password"],
        )
        return Response(status=status.HTTP_202_ACCEPTED)


class PasswordChangeConfirmView(APIView):
    """Sin sesión a propósito: el enlace del correo puede abrirse en otro
    navegador; el token de un solo uso ya prueba el acceso al email."""

    permission_classes = [permissions.AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_change"

    @extend_schema(request=PasswordChangeConfirmSerializer, responses={204: None})
    def post(self, request: Request):
        serializer = PasswordChangeConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.confirm_password_change(token=serializer.validated_data["token"])
        return Response(status=status.HTTP_204_NO_CONTENT)
