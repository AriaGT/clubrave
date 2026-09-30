from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("auth/org/login/", views.OrgLoginView.as_view(), name="org-login"),
    path("auth/org/refresh/", TokenRefreshView.as_view(), name="org-refresh"),
    # Mismo mecanismo de simplejwt que el refresh del organizador (la rotación
    # no depende del scope); un alias propio evita que la tienda llame a una
    # ruta con "org" en el nombre.
    path("auth/customer/refresh/", TokenRefreshView.as_view(), name="customer-refresh"),
    path(
        "auth/customer/request-code/",
        views.CustomerRequestCodeView.as_view(),
        name="customer-request-code",
    ),
    path("auth/customer/verify/", views.CustomerVerifyView.as_view(), name="customer-verify"),
    path("me/", views.MeView.as_view(), name="me"),
]
