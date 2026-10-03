"""Sesión de la consola (/api/auth/admin/*) y matriz de scopes: el scope
"admin" solo abre /api/admin/*, y /api/admin/* solo lo abre el scope "admin"
de un superusuario activo."""

import uuid
from datetime import timedelta

import pytest
from freezegun import freeze_time
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.accounts import services
from apps.accounts.models import User
from apps.accounts.panel_users import create_employee

PASSWORD = "Admin-Segura-2026"
GENERIC = "Email o contraseña incorrectos."


def _client(access: str | None = None) -> APIClient:
    client = APIClient()
    if access:
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


def _login(email, password=PASSWORD):
    return APIClient().post("/api/auth/admin/login/", {"email": email, "password": password}, format="json")


def _refresh(url, token):
    return APIClient().post(url, {"refresh": token}, format="json")


def test_superuser_logs_in_and_gets_admin_scope(admin_user):
    res = _login("ADMIN@test.pe")
    assert res.status_code == 200, res.content
    access = AccessToken(res.json()["access"])
    assert access["scope"] == "admin"
    assert "organization_id" not in access
    refresh = RefreshToken(res.json()["refresh"])
    assert refresh["scope"] == "admin"
    # Sesión absoluta de 12 h, no los 30 días del panel.
    assert 11 * 3600 < refresh["exp"] - refresh["iat"] <= 12 * 3600


def test_admin_login_gives_one_generic_error_for_everyone_else(organizer_user, customer_user, admin_user):
    # Un role=ADMIN sin is_superuser no es administrador: la fuente de verdad es is_superuser.
    fake_admin = User.objects.create_user(
        email="falso@test.pe", password=PASSWORD, role=User.Role.ADMIN, is_staff=True
    )
    inactive = User.objects.create_superuser(email="inactivo@test.pe", password=PASSWORD)
    inactive.is_active = False
    inactive.save()

    attempts = [
        (organizer_user.email, "clave12345"),
        (customer_user.email, PASSWORD),
        (fake_admin.email, PASSWORD),
        (inactive.email, PASSWORD),
        (admin_user.email, "mal-la-contrasena"),
        ("nadie@test.pe", PASSWORD),
    ]
    for email, password in attempts:
        res = _login(email, password)
        assert res.status_code == 400, email
        assert res.json()["error"]["message"] == GENERIC, email


def test_panel_login_still_rejects_the_superuser(admin_user):
    res = APIClient().post(
        "/api/auth/org/login/", {"email": admin_user.email, "password": PASSWORD}, format="json"
    )
    assert res.status_code == 400
    assert res.json()["error"]["message"] == GENERIC


def test_admin_login_is_throttled(admin_user):
    from django.core.cache import cache

    cache.clear()
    try:
        codes = [_login(admin_user.email, "mal").status_code for _ in range(11)]
        assert codes[:10] == [400] * 10
        assert codes[10] == 429
    finally:
        cache.clear()


# ── Refresh ──────────────────────────────────────────────────────────────────


def test_admin_refresh_returns_a_new_access_and_never_rotates(admin_tokens):
    res = _refresh("/api/auth/admin/refresh/", admin_tokens["refresh"])
    assert res.status_code == 200
    assert res.json()["access"]
    assert "refresh" not in res.json()


def test_admin_refresh_rejects_tokens_of_other_scopes(organizer_user, customer_user):
    for tokens in (
        services.org_tokens_for_user(organizer_user),
        services.customer_tokens_for_user(customer_user),
    ):
        assert _refresh("/api/auth/admin/refresh/", tokens["refresh"]).status_code == 401


def test_org_and_customer_refresh_reject_an_admin_token(admin_tokens):
    for url in ("/api/auth/org/refresh/", "/api/auth/customer/refresh/"):
        assert _refresh(url, admin_tokens["refresh"]).status_code == 401, url


def test_admin_session_expires_after_12_hours(admin_user):
    with freeze_time("2026-10-01 08:00:00") as frozen:
        tokens = services.admin_tokens_for_user(admin_user)
        frozen.tick(timedelta(hours=11))
        assert _refresh("/api/auth/admin/refresh/", tokens["refresh"]).status_code == 200
        frozen.tick(timedelta(hours=2))
        assert _refresh("/api/auth/admin/refresh/", tokens["refresh"]).status_code == 401


def test_demoted_superuser_loses_the_session_immediately(admin_user, admin_client, admin_tokens):
    assert admin_client.get("/api/admin/overview/").status_code == 200
    admin_user.is_superuser = False
    admin_user.save()
    assert admin_client.get("/api/admin/overview/").status_code == 403
    assert _refresh("/api/auth/admin/refresh/", admin_tokens["refresh"]).status_code == 401


def test_deactivated_superuser_loses_the_session_immediately(admin_user, admin_client):
    admin_user.is_active = False
    admin_user.save()
    assert admin_client.get("/api/admin/overview/").status_code in (401, 403)


# ── Matriz de scopes ─────────────────────────────────────────────────────────

ADMIN_ENDPOINTS = [
    ("get", "/api/admin/overview/"),
    ("get", "/api/admin/organizations/"),
    ("post", "/api/admin/organizations/"),
    ("get", f"/api/admin/organizations/{uuid.uuid4()}/"),
    ("get", f"/api/admin/organizations/{uuid.uuid4()}/events/"),
    ("get", "/api/admin/users/"),
    ("post", "/api/admin/users/"),
    ("get", f"/api/admin/users/{uuid.uuid4()}/"),
    ("post", f"/api/admin/users/{uuid.uuid4()}/reset-password/"),
    ("post", f"/api/admin/users/{uuid.uuid4()}/revoke-sessions/"),
    ("get", "/api/admin/payments/"),
    ("patch", "/api/admin/payments/"),
    ("get", "/api/admin/site/"),
    ("patch", "/api/admin/site/"),
    ("get", "/api/admin/audit/"),
]


@pytest.fixture
def other_scope_clients(organizer_user, customer_user, organization):
    employee = create_employee(
        organization=organization,
        actor=organizer_user,
        email="portero@test.pe",
        full_name="Portero",
        password="Puerta-Segura-2026",
    )
    return {
        "org": _client(services.org_tokens_for_user(organizer_user)["access"]),
        "door": _client(services.door_tokens_for_user(employee.user)["access"]),
        "customer": _client(services.customer_tokens_for_user(customer_user)["access"]),
        "anonymous": _client(),
    }


@pytest.mark.parametrize("method,url", ADMIN_ENDPOINTS)
def test_only_the_admin_scope_opens_api_admin(other_scope_clients, admin_client, method, url):
    for name, client in other_scope_clients.items():
        res = getattr(client, method)(url, {}, format="json")
        assert res.status_code in (401, 403), f"{name} entró a {method} {url}: {res.status_code}"
    # El administrador pasa el permiso (puede dar 400/404 por el contenido, nunca 401/403).
    res = getattr(admin_client, method)(url, {}, format="json")
    assert res.status_code not in (401, 403), f"{method} {url}: {res.status_code}"


ORG_ENDPOINTS = [
    "/api/org/events/",
    "/api/org/employees/",
    "/api/org/payments/",
    "/api/org/site/",
    "/api/org/audit/",
]


@pytest.mark.parametrize("url", ORG_ENDPOINTS)
def test_admin_scope_is_rejected_by_every_org_endpoint(admin_client, url):
    assert admin_client.get(url).status_code in (401, 403)


def test_admin_scope_cannot_scan(admin_client):
    res = admin_client.post(
        "/api/org/checkin/", {"qr_payload": "x", "event_id": str(uuid.uuid4())}, format="json"
    )
    assert res.status_code in (401, 403)
