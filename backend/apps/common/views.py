from rest_framework import generics, permissions
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.permissions import IsOrganizer, IsPlatformAdmin

from .audit import record
from .models import AuditLog, SiteSettings
from .serializers import AuditLogSerializer, SiteSettingsSerializer


class OrgAuditLogListView(generics.ListAPIView):
    """Bitácora global de la organización (H14). Solo lectura, paginada."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsOrganizer]

    def get_queryset(self):
        return AuditLog.objects.filter(
            organization_id=self.request.auth["organization_id"]
        ).select_related("actor", "event")

class PublicSiteSettingsView(generics.RetrieveAPIView):
    """Logo, contacto y redes para la barra y el pie de la tienda."""

    serializer_class = SiteSettingsSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public"

    def get_object(self):
        return SiteSettings.load()


class AdminSiteSettingsView(generics.RetrieveUpdateAPIView):
    """Módulo "Sitio web" de la consola del administrador. La marca de la
    tienda es de toda la plataforma: el cambio se registra sin organización."""

    serializer_class = SiteSettingsSerializer
    permission_classes = [IsPlatformAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "patch"]

    def get_object(self):
        return SiteSettings.load()

    def perform_update(self, serializer):
        changed = sorted(serializer.validated_data)
        serializer.save()
        # El singleton no tiene UUID: queda sin `target`, con los campos tocados.
        record(
            actor=self.request.user,
            organization=None,
            action=AuditLog.Action.SITE_SETTINGS_UPDATED,
            target=None,
            metadata={"fields": changed},
        )
