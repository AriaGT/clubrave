"""Rutas de la consola de administración: /api/admin/ (ver `admin_api.py`)."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.common.views import AdminSiteSettingsView
from apps.payments.views import AdminPaymentSettingsView

from . import admin_api

router = SimpleRouter()
router.register("organizations", admin_api.OrganizationViewSet, basename="admin-organization")
router.register("users", admin_api.AdminUserViewSet, basename="admin-user")

urlpatterns = [
    path("overview/", admin_api.AdminOverviewView.as_view(), name="admin-overview"),
    path("system/", admin_api.AdminSystemView.as_view(), name="admin-system"),
    path("payments/", AdminPaymentSettingsView.as_view(), name="admin-payment-settings"),
    path("site/", AdminSiteSettingsView.as_view(), name="admin-site-settings"),
    path("audit/", admin_api.AdminAuditLogListView.as_view(), name="admin-audit"),
]

urlpatterns += router.urls
