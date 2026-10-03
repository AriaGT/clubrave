"""Consola del administrador (/api/admin/): organizaciones, usuarios del
panel (organizadores y porteros), pagos, sitio web, bitácora global y
resumen. La seguridad de las rutas (scopes) está en test_admin_auth.py."""

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import services
from apps.accounts.models import Membership, Organization, User
from apps.common.models import AuditLog, SiteSettings
from apps.events.models import Event
from apps.payments.models import PaymentSettings

PASSWORD = "Puerta-Segura-2026"


def _client(access: str) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


# ── Organizaciones ───────────────────────────────────────────────────────────


def test_admin_creates_and_edits_an_organization(admin_client, admin_user):
    res = admin_client.post(
        "/api/admin/organizations/",
        {"name": "Noches Andinas", "contact_email": "hola@noches.pe"},
        format="json",
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["slug"] == "noches-andinas"
    assert body["is_active"] is True
    assert (body["organizers_count"], body["porters_count"], body["events_count"]) == (0, 0, 0)
    assert AuditLog.objects.filter(
        action=AuditLog.Action.ORGANIZATION_CREATED, actor=admin_user, target_label="Noches Andinas"
    ).exists()

    # El slug no choca con uno existente.
    again = admin_client.post(
        "/api/admin/organizations/", {"name": "Noches Andinas", "contact_email": "x@noches.pe"}, format="json"
    )
    assert again.json()["slug"] == "noches-andinas-2"

    patched = admin_client.patch(
        f"/api/admin/organizations/{body['id']}/", {"name": "Noches Andinas SAC"}, format="json"
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Noches Andinas SAC"
    assert AuditLog.objects.filter(action=AuditLog.Action.ORGANIZATION_UPDATED).exists()


def test_organization_validates_timezone(admin_client, organization):
    res = admin_client.patch(
        f"/api/admin/organizations/{organization.id}/", {"timezone": "Marte/Olympus"}, format="json"
    )
    assert res.status_code == 400


def test_organization_list_counts_and_filters(admin_client, organization, organizer_user, published_event):
    Organization.objects.create(name="Otra", slug="otra", contact_email="o@test.pe", is_active=False)
    res = admin_client.get("/api/admin/organizations/")
    assert res.status_code == 200
    rows = {r["slug"]: r for r in res.json()["results"]}
    assert rows["promotora-test"]["organizers_count"] == 1
    assert rows["promotora-test"]["events_count"] == 1
    assert rows["otra"]["is_active"] is False

    inactive = admin_client.get("/api/admin/organizations/?is_active=false").json()["results"]
    assert [r["slug"] for r in inactive] == ["otra"]
    found = admin_client.get("/api/admin/organizations/?q=promotora").json()["results"]
    assert [r["slug"] for r in found] == ["promotora-test"]


def test_organization_events_endpoint(admin_client, organization, published_event):
    other = Organization.objects.create(name="B", slug="b", contact_email="b@test.pe")
    Event.objects.create(
        organization=other, title="Ajeno", starts_at=timezone.now() + timedelta(days=3), venue_name="X"
    )
    res = admin_client.get(f"/api/admin/organizations/{organization.id}/events/")
    assert res.status_code == 200
    assert [e["title"] for e in res.json()] == [published_event.title]


def test_deactivating_an_organization_cuts_every_session_at_once(
    admin_client, organization, organizer_user, client
):
    from apps.accounts.panel_users import create_employee

    portero = create_employee(
        organization=organization,
        actor=organizer_user,
        email="p@test.pe",
        full_name="P",
        password=PASSWORD,
    )
    org_tokens = services.org_tokens_for_user(organizer_user)
    door_tokens = services.door_tokens_for_user(portero.user)
    owner = _client(org_tokens["access"])
    assert owner.get("/api/org/events/").status_code == 200

    res = admin_client.patch(
        f"/api/admin/organizations/{organization.id}/", {"is_active": False}, format="json"
    )
    assert res.status_code == 200
    assert AuditLog.objects.filter(action=AuditLog.Action.ORGANIZATION_DEACTIVATED).exists()

    # El access token ya emitido deja de servir de inmediato...
    assert owner.get("/api/org/events/").status_code == 403
    # ...no se puede refrescar la sesión...
    for tokens in (org_tokens, door_tokens):
        res = client.post(
            "/api/auth/org/refresh/", {"refresh": tokens["refresh"]}, content_type="application/json"
        )
        assert res.status_code == 401
    # ...ni volver a entrar.
    for email in (organizer_user.email, "p@test.pe"):
        password = "clave12345" if email == organizer_user.email else PASSWORD
        res = client.post(
            "/api/auth/org/login/", {"email": email, "password": password}, content_type="application/json"
        )
        assert res.status_code in (400, 403), email

    # Al reactivarla vuelve a funcionar el login.
    admin_client.patch(f"/api/admin/organizations/{organization.id}/", {"is_active": True}, format="json")
    res = client.post(
        "/api/auth/org/login/",
        {"email": organizer_user.email, "password": "clave12345"},
        content_type="application/json",
    )
    assert res.status_code == 200
    assert AuditLog.objects.filter(action=AuditLog.Action.ORGANIZATION_REACTIVATED).exists()


# ── Usuarios: alta ───────────────────────────────────────────────────────────


def test_admin_creates_an_organizer_with_a_new_organization(admin_client, admin_user, client):
    res = admin_client.post(
        "/api/admin/users/",
        {
            "role": "OWNER",
            "email": "Nuevo@Test.pe",
            "full_name": "Dueña Nueva",
            "organization_name": "Fiestas del Sur",
            "password": PASSWORD,
        },
        format="json",
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["role"] == "OWNER"
    assert body["email"] == "nuevo@test.pe"
    assert body["organization_name"] == "Fiestas del Sur"
    assert "initial_password" not in body  # la puso el admin: no se la devolvemos

    user = User.objects.get(email="nuevo@test.pe")
    assert user.role == User.Role.ORGANIZER
    assert user.organization.slug == "fiestas-del-sur"
    assert AuditLog.objects.filter(action=AuditLog.Action.ORGANIZER_CREATED, actor=admin_user).exists()
    assert AuditLog.objects.filter(action=AuditLog.Action.ORGANIZATION_CREATED).exists()

    login = client.post(
        "/api/auth/org/login/",
        {"email": "nuevo@test.pe", "password": PASSWORD},
        content_type="application/json",
    )
    assert login.status_code == 200


def test_admin_creates_a_second_owner_for_an_existing_organization(admin_client, organization):
    res = admin_client.post(
        "/api/admin/users/",
        {
            "role": "OWNER",
            "email": "socio@test.pe",
            "full_name": "Socio",
            "organization_id": str(organization.id),
        },
        format="json",
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["organization_id"] == str(organization.id)
    assert len(body["initial_password"]) >= 12  # generada por el servidor, una sola vez
    assert User.objects.get(email="socio@test.pe").check_password(body["initial_password"])
    assert Organization.objects.count() == 1  # no se creó otra


def test_organizer_needs_exactly_one_of_existing_or_new_organization(admin_client, organization):
    base = {"role": "OWNER", "email": "x@test.pe", "full_name": "X", "password": PASSWORD}
    assert admin_client.post("/api/admin/users/", base, format="json").status_code == 400
    both = {**base, "organization_id": str(organization.id), "organization_name": "Otra"}
    assert admin_client.post("/api/admin/users/", both, format="json").status_code == 400
    assert not User.objects.filter(email="x@test.pe").exists()


def test_admin_creates_a_porter_with_selected_events(admin_client, organization, published_event):
    other = Event.objects.create(
        organization=organization, title="Otro", starts_at=timezone.now() + timedelta(days=9), venue_name="X"
    )
    res = admin_client.post(
        "/api/admin/users/",
        {
            "role": "SECURITY",
            "email": "puerta@test.pe",
            "full_name": "Puerta Uno",
            "password": PASSWORD,
            "organization_id": str(organization.id),
            "all_events": False,
            "event_ids": [str(published_event.id)],
        },
        format="json",
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["role"] == "SECURITY"
    assert body["all_events"] is False
    assert [e["id"] for e in body["events"]] == [str(published_event.id)]
    membership = Membership.objects.get(pk=body["id"])
    assert membership.can_scan_event(published_event)
    assert not membership.can_scan_event(other)
    assert AuditLog.objects.filter(
        organization=organization, action=AuditLog.Action.EMPLOYEE_CREATED
    ).exists()


def test_porter_needs_an_organization_and_a_valid_one(admin_client, organization):
    base = {"role": "SECURITY", "email": "p@test.pe", "full_name": "P", "password": PASSWORD}
    assert admin_client.post("/api/admin/users/", base, format="json").status_code == 400
    missing = {**base, "organization_id": str(uuid.uuid4())}
    assert admin_client.post("/api/admin/users/", missing, format="json").status_code == 404


def test_create_user_rejects_weak_password_and_duplicate_email(admin_client, organization, customer_user):
    base = {
        "role": "SECURITY",
        "email": "a@test.pe",
        "full_name": "A",
        "organization_id": str(organization.id),
    }
    assert (
        admin_client.post("/api/admin/users/", {**base, "password": "123"}, format="json").status_code == 400
    )
    dup = admin_client.post(
        "/api/admin/users/", {**base, "email": customer_user.email, "password": PASSWORD}, format="json"
    )
    assert dup.status_code == 400
    assert not User.objects.filter(email="a@test.pe").exists()


# ── Usuarios: listado, edición y control ─────────────────────────────────────


@pytest.fixture
def porter(admin_client, organization):
    res = admin_client.post(
        "/api/admin/users/",
        {
            "role": "SECURITY",
            "email": "puerta@test.pe",
            "full_name": "Puerta Uno",
            "password": PASSWORD,
            "organization_id": str(organization.id),
        },
        format="json",
    )
    assert res.status_code == 201, res.content
    return res.json()


def test_user_list_filters_and_never_lists_customers_or_the_admin(
    admin_client, organization, organizer_user, customer_user, porter, admin_user
):
    rows = admin_client.get("/api/admin/users/").json()["results"]
    assert sorted(r["email"] for r in rows) == ["organizador@test.pe", "puerta@test.pe"]

    def emails(query):
        return [r["email"] for r in admin_client.get(f"/api/admin/users/?{query}").json()["results"]]

    assert emails("role=SECURITY") == ["puerta@test.pe"]
    assert emails("role=OWNER") == ["organizador@test.pe"]
    assert sorted(emails(f"organization={organization.id}")) == ["organizador@test.pe", "puerta@test.pe"]
    assert emails(f"organization={uuid.uuid4()}") == []
    assert emails("organization=no-es-un-uuid") == []
    assert emails("q=uno") == ["puerta@test.pe"]
    assert len(emails("q=promotora")) == 2  # busca también por nombre de organización
    assert emails("is_active=false") == []


def test_admin_updates_deactivates_and_reactivates_a_porter(admin_client, porter, client):
    url = f"/api/admin/users/{porter['id']}/"
    login = {"email": "puerta@test.pe", "password": PASSWORD}
    assert client.post("/api/auth/org/login/", login, content_type="application/json").status_code == 200

    renamed = admin_client.patch(url, {"full_name": "Puerta Principal"}, format="json")
    assert renamed.status_code == 200 and renamed.json()["full_name"] == "Puerta Principal"

    off = admin_client.patch(url, {"is_active": False}, format="json")
    assert off.json()["is_active"] is False
    assert client.post("/api/auth/org/login/", login, content_type="application/json").status_code == 400
    assert AuditLog.objects.filter(action=AuditLog.Action.EMPLOYEE_DEACTIVATED).exists()

    on = admin_client.patch(url, {"is_active": True}, format="json")
    assert on.json()["is_active"] is True
    assert client.post("/api/auth/org/login/", login, content_type="application/json").status_code == 200
    assert AuditLog.objects.filter(action=AuditLog.Action.EMPLOYEE_REACTIVATED).exists()


def test_admin_deactivates_an_organizer_and_it_is_audited_as_organizer(
    admin_client, organizer_user, organization, client
):
    membership = Membership.objects.get(user=organizer_user)
    tokens = services.org_tokens_for_user(organizer_user)
    owner = _client(tokens["access"])
    assert owner.get("/api/org/events/").status_code == 200

    res = admin_client.patch(f"/api/admin/users/{membership.id}/", {"is_active": False}, format="json")
    assert res.status_code == 200
    assert AuditLog.objects.filter(
        organization=organization, action=AuditLog.Action.ORGANIZER_DEACTIVATED
    ).exists()
    assert owner.get("/api/org/events/").status_code in (401, 403)
    assert (
        client.post(
            "/api/auth/org/refresh/", {"refresh": tokens["refresh"]}, content_type="application/json"
        ).status_code
        == 401
    )


def test_event_scope_only_applies_to_porters(admin_client, organizer_user):
    membership = Membership.objects.get(user=organizer_user)
    res = admin_client.patch(f"/api/admin/users/{membership.id}/", {"all_events": False}, format="json")
    assert res.status_code == 400


def test_admin_resets_a_password_with_a_generated_one_and_closes_sessions(admin_client, porter, client):
    tokens = services.door_tokens_for_user(User.objects.get(email="puerta@test.pe"))
    res = admin_client.post(f"/api/admin/users/{porter['id']}/reset-password/", {}, format="json")
    assert res.status_code == 200
    new_password = res.json()["password"]
    assert new_password != PASSWORD
    assert (
        client.post(
            "/api/auth/org/refresh/", {"refresh": tokens["refresh"]}, content_type="application/json"
        ).status_code
        == 401
    )
    login = client.post(
        "/api/auth/org/login/",
        {"email": "puerta@test.pe", "password": new_password},
        content_type="application/json",
    )
    assert login.status_code == 200


def test_admin_resets_an_organizer_password_with_their_own_audit_action(admin_client, organizer_user):
    membership = Membership.objects.get(user=organizer_user)
    res = admin_client.post(
        f"/api/admin/users/{membership.id}/reset-password/", {"password": PASSWORD}, format="json"
    )
    assert res.status_code == 200 and res.json() == {}  # la puso el admin: no se devuelve
    organizer_user.refresh_from_db()
    assert organizer_user.check_password(PASSWORD)
    assert AuditLog.objects.filter(action=AuditLog.Action.ORGANIZER_PASSWORD_RESET).exists()


def test_reset_rejects_a_weak_password(admin_client, porter):
    res = admin_client.post(
        f"/api/admin/users/{porter['id']}/reset-password/", {"password": "123"}, format="json"
    )
    assert res.status_code == 400


def test_revoke_sessions_keeps_the_password(admin_client, porter, client):
    user = User.objects.get(email="puerta@test.pe")
    tokens = services.door_tokens_for_user(user)
    res = admin_client.post(f"/api/admin/users/{porter['id']}/revoke-sessions/")
    assert res.status_code == 204
    assert (
        client.post(
            "/api/auth/org/refresh/", {"refresh": tokens["refresh"]}, content_type="application/json"
        ).status_code
        == 401
    )
    user.refresh_from_db()
    assert user.check_password(PASSWORD) and user.is_active
    assert AuditLog.objects.filter(action=AuditLog.Action.SESSIONS_REVOKED).exists()


def test_porter_is_deleted_but_an_organizer_never_is(admin_client, porter, organizer_user, published_event):
    owner = Membership.objects.get(user=organizer_user)
    refused = admin_client.delete(f"/api/admin/users/{owner.id}/")
    assert refused.status_code == 403
    assert User.objects.filter(pk=organizer_user.pk).exists()

    gone = admin_client.delete(f"/api/admin/users/{porter['id']}/")
    assert gone.status_code == 204
    assert not User.objects.filter(email="puerta@test.pe").exists()
    assert AuditLog.objects.filter(action=AuditLog.Action.EMPLOYEE_DELETED).exists()


def test_a_membership_of_another_kind_is_not_reachable_as_a_user(admin_client, organization):
    legacy = User.objects.create_user(email="legacy@test.pe", password=PASSWORD, role=User.Role.STAFF)
    membership = Membership.objects.create(user=legacy, organization=organization, role=Membership.Role.STAFF)
    assert admin_client.get(f"/api/admin/users/{membership.id}/").status_code == 404


# ── Pagos y sitio web ────────────────────────────────────────────────────────


def test_admin_manages_payments_and_it_is_audited_without_organization(admin_client, admin_user):
    state = admin_client.get("/api/admin/payments/")
    assert state.status_code == 200
    assert state.json()["mode"] == PaymentSettings.Mode.FAKE

    res = admin_client.patch("/api/admin/payments/", {"mode": "disabled"}, format="json")
    assert res.status_code == 200
    assert res.json()["mode"] == "disabled"
    entry = AuditLog.objects.get(action=AuditLog.Action.PAYMENT_SETTINGS_UPDATED)
    assert entry.organization is None
    assert entry.actor == admin_user


def test_organizer_can_no_longer_reach_admin_payments_or_site(organizer_user, organization):
    owner = _client(services.org_tokens_for_user(organizer_user)["access"])
    for url in ("/api/admin/payments/", "/api/admin/site/"):
        assert owner.get(url).status_code == 403


def test_admin_edits_the_site_and_it_is_audited_without_organization(admin_client, admin_user):
    res = admin_client.patch("/api/admin/site/", {"tagline": "Las mejores noches"}, format="json")
    assert res.status_code == 200, res.content
    assert SiteSettings.load().tagline == "Las mejores noches"
    entry = AuditLog.objects.get(action=AuditLog.Action.SITE_SETTINGS_UPDATED)
    assert entry.organization is None
    assert entry.metadata == {"fields": ["tagline"]}


def test_platform_actions_do_not_show_up_in_an_organizers_audit(
    admin_client, organizer_user, organization, porter
):
    admin_client.patch("/api/admin/site/", {"tagline": "X"}, format="json")
    admin_client.patch("/api/admin/payments/", {"mode": "disabled"}, format="json")

    owner = _client(services.org_tokens_for_user(organizer_user)["access"])
    actions = {e["action"] for e in owner.get("/api/org/audit/").json()["results"]}
    assert "SITE_SETTINGS_UPDATED" not in actions
    assert "PAYMENT_SETTINGS_UPDATED" not in actions
    # Lo que el admin hizo sobre SU organización sí lo ve.
    assert "EMPLOYEE_CREATED" in actions


# ── Bitácora global ──────────────────────────────────────────────────────────


def test_global_audit_lists_everything_and_filters(admin_client, organization):
    other = Organization.objects.create(name="Otra", slug="otra", contact_email="o@test.pe")
    admin_client.patch("/api/admin/site/", {"tagline": "X"}, format="json")
    admin_client.patch(f"/api/admin/organizations/{other.id}/", {"name": "Otra SAC"}, format="json")

    rows = admin_client.get("/api/admin/audit/").json()["results"]
    by_action = {r["action"]: r for r in rows}
    assert by_action["SITE_SETTINGS_UPDATED"]["organization_name"] == "Plataforma"
    assert by_action["SITE_SETTINGS_UPDATED"]["organization_id"] is None
    assert by_action["ORGANIZATION_UPDATED"]["organization_name"] == "Otra SAC"

    def actions(query):
        return {r["action"] for r in admin_client.get(f"/api/admin/audit/?{query}").json()["results"]}

    assert actions("organization=platform") == {"SITE_SETTINGS_UPDATED"}
    assert actions(f"organization={other.id}") == {"ORGANIZATION_UPDATED"}
    assert actions("action=SITE_SETTINGS_UPDATED") == {"SITE_SETTINGS_UPDATED"}
    assert actions("organization=basura") == set()  # un id inválido no devuelve todo
    today = timezone.localdate().isoformat()
    assert actions(f"date_from={today}&date_to={today}") >= {"SITE_SETTINGS_UPDATED"}
    assert actions("date_from=2099-01-01") == set()
    assert admin_client.get("/api/admin/audit/?date_from=ayer").status_code == 400


# ── Resumen ──────────────────────────────────────────────────────────────────


def test_overview_counts_and_alerts(admin_client, organization, organizer_user, published_event):
    body = admin_client.get("/api/admin/overview/").json()
    assert body["organizations"] == {"active": 1, "inactive": 0}
    assert body["organizers"] == 1
    assert body["porters"] == 0
    assert body["upcoming_events"] == 1
    assert body["payments"]["mode"] == "fake"
    assert "PAYMENTS_FAKE" in {a["code"] for a in body["alerts"]}


def test_overview_flags_a_live_gateway_that_was_never_verified(admin_client, configure_provider, settings):
    settings.PAYMENT_CREDENTIALS_KEY = "k" * 48
    configure_provider(
        "mercadopago", {"access_token": "APP_USR-x", "webhook_secret": "w"}, environment="test"
    )
    body = admin_client.get("/api/admin/overview/").json()
    codes = {a["code"] for a in body["alerts"]}
    assert {"GATEWAY_UNVERIFIED", "GATEWAY_TEST_ENV"} <= codes
    assert body["payments"]["gateways"] == [{"id": "mercadopago", "environment": "test", "verified": False}]
