from django.urls import path

from . import views

urlpatterns = [
    path("org/audit/", views.OrgAuditLogListView.as_view(), name="org-audit"),
    path("site/", views.PublicSiteSettingsView.as_view(), name="site-settings"),
]