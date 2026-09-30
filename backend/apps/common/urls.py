from django.urls import path

from . import views

urlpatterns = [
    path("org/audit/", views.OrgAuditLogListView.as_view(), name="org-audit"),
]