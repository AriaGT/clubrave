"""API de la consola de administración: /api/admin/.

Solo el administrador del sistema (`IsPlatformAdmin`: scope "admin" de un
superusuario). Organizaciones, usuarios del panel (organizadores y porteros),
resumen y bitácora global; pagos y sitio web viven en sus apps
(`AdminPaymentSettingsView`, `AdminSiteSettingsView`) porque comparten la
lógica con el panel actual.

Un "usuario" de esta API es una membresía (usuario + organización + rol): es
lo que el panel conoce, y cada cuenta tiene una sola. `id` es el de la
membresía; `user_id`, el del usuario.
"""

import zoneinfo
from datetime import date, timedelta
from uuid import UUID

from django.conf import settings as django_settings
from django.contrib.auth import authenticate
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common.errors import DomainError
from apps.common.models import AuditLog
from apps.events.models import Event
from apps.payments.models import PaymentProvider, PaymentSettings

from . import organizations, panel_users, services
from .models import Membership, Organization
from .permissions import IsPlatformAdmin
from .serializers import OrgLoginSerializer, TokenPairSerializer

PANEL_ROLES = [Membership.Role.OWNER, Membership.Role.SECURITY]


def _uuid_or_none(value: str) -> UUID | None:
    try:
        return UUID(value)
    except (ValueError, TypeError):
        return None


# ── Sesión ───────────────────────────────────────────────────────────────────


class AdminLoginView(APIView):
    """Login de la consola. Cualquier fallo (cuenta inexistente, contraseña
    errónea, no es superusuario) responde igual: no se revela qué cuentas
    son de administrador."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "admin_login"

    @extend_schema(request=OrgLoginSerializer, responses=TokenPairSerializer)
    def post(self, request: Request):
        serializer = OrgLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data["email"].strip().lower(),
            password=serializer.validated_data["password"],
        )
        if user is None:
            raise DomainError("VALIDATION_ERROR", "Email o contraseña incorrectos.")
        return Response(services.admin_tokens_for_user(user), status=status.HTTP_200_OK)


# ── Organizaciones ───────────────────────────────────────────────────────────


class OrganizationSerializer(serializers.ModelSerializer):
    organizers_count = serializers.IntegerField(read_only=True)
    porters_count = serializers.IntegerField(read_only=True)
    events_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "contact_email",
            "timezone",
            "is_active",
            "organizers_count",
            "porters_count",
            "events_count",
            "created_at",
        ]
        read_only_fields = fields


class OrganizationWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    contact_email = serializers.EmailField()
    timezone = serializers.CharField(max_length=64, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_timezone(self, value):
        try:
            zoneinfo.ZoneInfo(value)
        except (zoneinfo.ZoneInfoNotFoundError, ValueError) as exc:
            raise serializers.ValidationError("Zona horaria desconocida (p. ej. America/Lima).") from exc
        return value


class OrganizationEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    starts_at = serializers.DateTimeField()
    status = serializers.CharField()


class OrganizationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = OrganizationSerializer
    permission_classes = [IsPlatformAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = Organization.objects.annotate(
            organizers_count=Count(
                "memberships", filter=Q(memberships__role=Membership.Role.OWNER), distinct=True
            ),
            porters_count=Count(
                "memberships", filter=Q(memberships__role=Membership.Role.SECURITY), distinct=True
            ),
            events_count=Count("events", distinct=True),
        ).order_by("name")
        params = self.request.query_params
        if (active := params.get("is_active")) in ("true", "false"):
            qs = qs.filter(is_active=active == "true")
        if q := params.get("q", "").strip():
            qs = qs.filter(Q(name__icontains=q) | Q(contact_email__icontains=q) | Q(slug__icontains=q))
        return qs

    @extend_schema(
        parameters=[
            OpenApiParameter("is_active", bool, description="Solo activas (`true`) o inactivas (`false`)"),
            OpenApiParameter("q", str, description="Busca en nombre, email de contacto y slug"),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=OrganizationWriteSerializer, responses={201: OrganizationSerializer})
    def create(self, request):
        serializer = OrganizationWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        organization = organizations.create_organization(
            actor=request.user,
            name=data["name"],
            contact_email=data["contact_email"],
            **({"timezone": data["timezone"]} if "timezone" in data else {}),
        )
        return Response(
            OrganizationSerializer(self.get_queryset().get(pk=organization.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=OrganizationWriteSerializer, responses=OrganizationSerializer)
    def partial_update(self, request, pk=None):
        organization = self.get_object()
        serializer = OrganizationWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        organizations.update_organization(
            organization=organization, actor=request.user, data=serializer.validated_data
        )
        return Response(OrganizationSerializer(self.get_queryset().get(pk=organization.pk)).data)

    @extend_schema(responses=OrganizationEventSerializer(many=True))
    @action(detail=True, methods=["get"], pagination_class=None)
    def events(self, request, pk=None):
        """Eventos de la organización, para asignárselos a un portero."""
        organization = self.get_object()
        events = Event.objects.filter(organization=organization).order_by("-starts_at")
        return Response(OrganizationEventSerializer(events, many=True).data)


# ── Usuarios del panel (organizadores y porteros) ────────────────────────────


class AdminUserEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    starts_at = serializers.DateTimeField()


class AdminUserSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True, allow_null=True)
    organization_id = serializers.UUIDField(read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    events = AdminUserEventSerializer(many=True, read_only=True)

    class Meta:
        model = Membership
        fields = [
            "id",
            "user_id",
            "email",
            "full_name",
            "role",
            "is_active",
            "organization_id",
            "organization_name",
            "all_events",
            "events",
            "last_login",
            "created_at",
        ]
        read_only_fields = fields


class AdminUserCreatedSerializer(AdminUserSerializer):
    """Respuesta del alta: trae la contraseña inicial solo si la generó el
    servidor (no se vuelve a poder consultar)."""

    initial_password = serializers.CharField(read_only=True, required=False)

    class Meta(AdminUserSerializer.Meta):
        fields = [*AdminUserSerializer.Meta.fields, "initial_password"]
        read_only_fields = fields


class AdminUserCreateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=PANEL_ROLES)
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    # Vacía: el servidor genera una y la devuelve una sola vez.
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    # Portero: organización obligatoria. Organizador: una existente o el
    # nombre de una nueva.
    organization_id = serializers.UUIDField(required=False)
    organization_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    all_events = serializers.BooleanField(default=True)
    event_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)


class AdminUserUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False)
    is_active = serializers.BooleanField(required=False)
    all_events = serializers.BooleanField(required=False)
    event_ids = serializers.ListField(child=serializers.UUIDField(), required=False)


class AdminPasswordResetSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)


class AdminPasswordResetResultSerializer(serializers.Serializer):
    password = serializers.CharField(required=False)


class AdminUserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AdminUserSerializer
    permission_classes = [IsPlatformAdmin]

    def get_queryset(self):
        qs = (
            Membership.objects.filter(role__in=PANEL_ROLES)
            .select_related("user", "organization")
            .prefetch_related("events")
            .order_by("organization__name", "role", "user__full_name", "user__email")
        )
        params = self.request.query_params
        if (role := params.get("role")) in PANEL_ROLES:
            qs = qs.filter(role=role)
        if organization := params.get("organization"):
            # Un uuid inválido no devuelve todo: devuelve nada.
            qs = (
                qs.filter(organization_id=_uuid_or_none(organization))
                if _uuid_or_none(organization)
                else qs.none()
            )
        if (active := params.get("is_active")) in ("true", "false"):
            qs = qs.filter(user__is_active=active == "true")
        if q := params.get("q", "").strip():
            qs = qs.filter(
                Q(user__email__icontains=q)
                | Q(user__full_name__icontains=q)
                | Q(organization__name__icontains=q)
            )
        return qs

    def _fresh(self, membership: Membership) -> Membership:
        return self.get_queryset().get(pk=membership.pk)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "role", str, enum=PANEL_ROLES, description="OWNER (organizador) o SECURITY (portero)"
            ),
            OpenApiParameter("organization", str, description="uuid de la organización"),
            OpenApiParameter("is_active", bool, description="Solo activos (`true`) o inactivos (`false`)"),
            OpenApiParameter("q", str, description="Busca en email, nombre y organización"),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=AdminUserCreateSerializer, responses={201: AdminUserCreatedSerializer})
    def create(self, request):
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        generated = not data.get("password")
        password = panel_users.generate_password() if generated else data["password"]

        organization = None
        if organization_id := data.get("organization_id"):
            organization = get_object_or_404(Organization, pk=organization_id)

        if data["role"] == Membership.Role.SECURITY:
            if organization is None:
                raise DomainError("VALIDATION_ERROR", "Elige la organización del portero.")
            membership = panel_users.create_employee(
                organization=organization,
                actor=request.user,
                email=data["email"],
                full_name=data["full_name"],
                password=password,
                all_events=data["all_events"],
                event_ids=data["event_ids"],
            )
        else:
            membership = panel_users.create_organizer(
                actor=request.user,
                email=data["email"],
                full_name=data["full_name"],
                password=password,
                organization=organization,
                organization_name=data.get("organization_name", ""),
            )

        body = AdminUserSerializer(self._fresh(membership)).data
        if generated:
            body["initial_password"] = password
        return Response(body, status=status.HTTP_201_CREATED)

    @extend_schema(request=AdminUserUpdateSerializer, responses=AdminUserSerializer)
    def partial_update(self, request, pk=None):
        membership = self.get_object()
        serializer = AdminUserUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        panel_users.update_employee(membership=membership, actor=request.user, data=serializer.validated_data)
        return Response(AdminUserSerializer(self._fresh(membership)).data)

    def perform_destroy(self, instance):
        panel_users.delete_employee(membership=instance, actor=self.request.user)

    @extend_schema(request=AdminPasswordResetSerializer, responses=AdminPasswordResetResultSerializer)
    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        membership = self.get_object()
        serializer = AdminPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        generated = not serializer.validated_data.get("password")
        password = panel_users.generate_password() if generated else serializer.validated_data["password"]
        panel_users.reset_member_password(membership=membership, actor=request.user, password=password)
        return Response({"password": password} if generated else {})

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"], url_path="revoke-sessions")
    def revoke_sessions(self, request, pk=None):
        panel_users.revoke_member_sessions(membership=self.get_object(), actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Bitácora global ──────────────────────────────────────────────────────────


class AdminAuditLogSerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(read_only=True, allow_null=True)
    organization_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "created_at",
            "organization_id",
            "organization_name",
            "actor_email",
            "action",
            "target_type",
            "target_id",
            "target_label",
            "event",
            "reason",
            "metadata",
        ]
        read_only_fields = fields

    def get_organization_name(self, obj) -> str:
        # Sin organización = acción de plataforma (pagos, sitio web).
        return obj.organization.name if obj.organization_id else "Plataforma"


class AdminAuditLogListView(generics.ListAPIView):
    """Todas las organizaciones más las acciones de plataforma. Filtros:
    `organization` (uuid o `platform`), `action`, `date_from`, `date_to`."""

    serializer_class = AdminAuditLogSerializer
    permission_classes = [IsPlatformAdmin]

    @extend_schema(
        parameters=[
            OpenApiParameter("organization", str, description="uuid de la organización o `platform`"),
            OpenApiParameter("action", str),
            OpenApiParameter("date_from", str, description="AAAA-MM-DD"),
            OpenApiParameter("date_to", str, description="AAAA-MM-DD"),
        ]
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        qs = AuditLog.objects.select_related("organization", "actor", "event")
        params = self.request.query_params
        if organization := params.get("organization"):
            if organization == "platform":
                qs = qs.filter(organization__isnull=True)
            elif (organization_id := _uuid_or_none(organization)) is not None:
                qs = qs.filter(organization_id=organization_id)
            else:
                qs = qs.none()
        if action_name := params.get("action"):
            qs = qs.filter(action=action_name)
        for key, lookup in (("date_from", "created_at__date__gte"), ("date_to", "created_at__date__lte")):
            if value := params.get(key):
                try:
                    qs = qs.filter(**{lookup: date.fromisoformat(value)})
                except ValueError as exc:
                    raise DomainError("VALIDATION_ERROR", f"`{key}` debe ser AAAA-MM-DD.") from exc
        return qs


# ── Resumen ──────────────────────────────────────────────────────────────────


class AdminOverviewView(APIView):
    """Contadores y alertas de configuración para la pantalla Resumen."""

    permission_classes = [IsPlatformAdmin]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        config = PaymentSettings.load()
        enabled = [p for p in PaymentProvider.objects.filter(enabled=True) if p.configured]
        live = config.mode == PaymentSettings.Mode.LIVE

        alerts: list[dict] = []

        def alert(code: str, severity: str, message: str) -> None:
            alerts.append({"code": code, "severity": severity, "message": message})

        if config.mode == PaymentSettings.Mode.DISABLED:
            alert("PAYMENTS_DISABLED", "error", "Los cobros están deshabilitados: la tienda no crea órdenes.")
        elif config.mode == PaymentSettings.Mode.FAKE:
            alert(
                "PAYMENTS_FAKE",
                "warning",
                "El simulador de pagos está activo: las compras se aprueban sin cobrar.",
            )
        elif not enabled:
            alert("NO_GATEWAY", "error", "Modo real sin ninguna pasarela activa y configurada.")
        for provider in enabled if live else []:
            if provider.verified_at is None:
                alert(
                    "GATEWAY_UNVERIFIED",
                    "warning",
                    f"La pasarela {provider.provider} está activa pero nunca se verificó.",
                )
            if provider.environment == PaymentProvider.Environment.TEST:
                alert(
                    "GATEWAY_TEST_ENV",
                    "warning",
                    f"La pasarela {provider.provider} está en entorno de pruebas.",
                )
        if not django_settings.PAYMENT_CREDENTIALS_KEY:
            alert(
                "CREDENTIALS_KEY_MISSING",
                "error",
                "Falta PAYMENT_CREDENTIALS_KEY: no se pueden guardar credenciales.",
            )

        now = timezone.now()
        active_members = Membership.objects.filter(user__is_active=True)
        return Response(
            {
                "organizations": {
                    "active": Organization.objects.filter(is_active=True).count(),
                    "inactive": Organization.objects.filter(is_active=False).count(),
                },
                "organizers": active_members.filter(role=Membership.Role.OWNER).count(),
                "porters": active_members.filter(role=Membership.Role.SECURITY).count(),
                "upcoming_events": Event.objects.filter(
                    status=Event.Status.PUBLISHED,
                    starts_at__gte=now,
                    starts_at__lte=now + timedelta(days=30),
                ).count(),
                "payments": {
                    "mode": config.mode,
                    "gateways": [
                        {
                            "id": p.provider,
                            "environment": p.environment,
                            "verified": p.verified_at is not None,
                        }
                        for p in enabled
                    ],
                },
                "alerts": alerts,
            }
        )
