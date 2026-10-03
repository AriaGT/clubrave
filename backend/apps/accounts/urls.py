from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_api, employee_views, views
from .tokens import AdminTokenRefreshView, GraceTokenRefreshView

router = SimpleRouter()
router.register("org/employees", employee_views.EmployeeViewSet, basename="org-employee")

urlpatterns = [
    path("auth/org/login/", views.OrgLoginView.as_view(), name="org-login"),
    path("auth/admin/login/", admin_api.AdminLoginView.as_view(), name="admin-login"),
    path("auth/admin/refresh/", AdminTokenRefreshView.as_view(), name="admin-refresh"),
    path("auth/org/refresh/", GraceTokenRefreshView.as_view(), name="org-refresh"),
    # Mismo mecanismo de simplejwt que el refresh del organizador (la rotación
    # no depende del scope); un alias propio evita que la tienda llame a una
    # ruta con "org" en el nombre.
    path("auth/customer/refresh/", GraceTokenRefreshView.as_view(), name="customer-refresh"),
    path(
        "auth/customer/request-code/",
        views.CustomerRequestCodeView.as_view(),
        name="customer-request-code",
    ),
    path("auth/customer/verify/", views.CustomerVerifyView.as_view(), name="customer-verify"),
    path("auth/org/password-change/", views.PasswordChangeRequestView.as_view(), name="org-password-change"),
    path(
        "auth/org/password-change/confirm/",
        views.PasswordChangeConfirmView.as_view(),
        name="org-password-change-confirm",
    ),
    path("me/", views.MeView.as_view(), name="me"),
]

urlpatterns += router.urls
