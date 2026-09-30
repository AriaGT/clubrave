from rest_framework import generics

from apps.accounts.permissions import IsOrganizer

from .models import AuditLog
from .serializers import AuditLogSerializer


class OrgAuditLogListView(generics.ListAPIView):
    """Bitácora global de la organización (H14). Solo lectura, paginada."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsOrganizer]

    def get_queryset(self):
        return AuditLog.objects.filter(
            organization_id=self.request.auth["organization_id"]
        ).select_related("actor", "event")