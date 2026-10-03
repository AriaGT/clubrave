"""API de empleados (solo dueños de la organización): /api/org/employees/."""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import panel_users as employees
from .models import Membership, Organization
from .permissions import IsOrganizationOwner


class EmployeeEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    starts_at = serializers.DateTimeField()


class EmployeeSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True, allow_null=True)
    role = serializers.ChoiceField(choices=[Membership.Role.SECURITY], read_only=True)
    events = EmployeeEventSerializer(many=True, read_only=True)

    class Meta:
        model = Membership
        fields = [
            "id",
            "email",
            "full_name",
            "role",
            "is_active",
            "all_events",
            "events",
            "last_login",
            "created_at",
        ]
        read_only_fields = fields


class EmployeeCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=1)
    all_events = serializers.BooleanField(default=True)
    event_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)


class EmployeeUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False)
    is_active = serializers.BooleanField(required=False)
    all_events = serializers.BooleanField(required=False)
    event_ids = serializers.ListField(child=serializers.UUIDField(), required=False)


class EmployeePasswordResetSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)


class EmployeeViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Empleados de seguridad. La organización sale del JWT (regla A6): un
    id de otra organización responde 404, igual que uno inexistente."""

    serializer_class = EmployeeSerializer
    permission_classes = [IsOrganizationOwner]
    pagination_class = None

    def get_queryset(self):
        return (
            Membership.objects.filter(
                organization_id=self.request.auth["organization_id"], role=Membership.Role.SECURITY
            )
            .select_related("user", "organization")
            .prefetch_related("events")
            .order_by("user__full_name", "user__email")
        )

    def _organization(self) -> Organization:
        return get_object_or_404(Organization, pk=self.request.auth["organization_id"])

    @extend_schema(request=EmployeeCreateSerializer, responses={201: EmployeeSerializer})
    def create(self, request):
        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = employees.create_employee(
            organization=self._organization(), actor=request.user, **serializer.validated_data
        )
        membership = self.get_queryset().get(pk=membership.pk)
        return Response(EmployeeSerializer(membership).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=EmployeeUpdateSerializer, responses=EmployeeSerializer)
    def partial_update(self, request, pk=None):
        membership = self.get_object()
        serializer = EmployeeUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        employees.update_employee(membership=membership, actor=request.user, data=serializer.validated_data)
        membership = self.get_queryset().get(pk=membership.pk)
        return Response(EmployeeSerializer(membership).data)

    def perform_destroy(self, instance):
        employees.delete_employee(membership=instance, actor=self.request.user)

    @extend_schema(request=EmployeePasswordResetSerializer, responses={204: None})
    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        membership = self.get_object()
        serializer = EmployeePasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employees.reset_member_password(
            membership=membership, actor=request.user, password=serializer.validated_data["password"]
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
