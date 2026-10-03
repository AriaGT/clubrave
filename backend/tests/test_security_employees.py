"""Empleados de seguridad: gestión por el organizador, login único del panel,
acceso SOLO al escáner (revisado endpoint por endpoint), ventana horaria,
aislamiento entre organizaciones y revocación de sesiones."""

import uuid
from datetime import timedelta

import pytest
from django.urls import URLPattern, URLResolver, get_resolver, reverse
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.test import APIClient

from apps.accounts import services
from apps.accounts.models import Membership, Organization, User
from apps.common.models import AuditLog
from apps.events.models import Event
from apps.orders.services.checkout import BuyerData, CartLine, create_order
from apps.orders.services.codes import sign_ticket_code
from apps.orders.services.fulfillment import mark_paid

PASSWORD = "Puerta-Segura-2026"


def _client(access: str | None = None) -> APIClient:
    client = APIClient()
    if access:
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@pytest.fixture
def owner_client(organizer_user):
    return _client(services.org_tokens_for_user(organizer_user)["access"])


@pytest.fixture
def employee(organization, organizer_user):
    from apps.accounts.panel_users import create_employee

    return create_employee(
        organization=organization,
        actor=organizer_user,
        email="seguridad@test.pe",
        full_name="Guardia Uno",
        password=PASSWORD,
    )


@pytest.fixture
def door_tokens(employee):
    return services.door_tokens_for_user(employee.user)


@pytest.fixture
def door_client(door_tokens):
    return _client(door_tokens["access"])


@pytest.fixture
def org_b(db):
    return Organization.objects.create(name="Promotora B", slug="promotora-b", contact_email="b@test.pe")


@pytest.fixture
def owner_b_client(org_b):
    user = User.objects.create_user(email="duenob@test.pe", password="x", role=User.Role.ORGANIZER)
    Membership.objects.create(user=user, organization=org_b, role=Membership.Role.OWNER)
    return _client(services.org_tokens_for_user(user)["access"])


def _event(organization, *, starts_in: timedelta, hours: int = 6, title="Fiesta") -> Event:
    starts_at = timezone.now() + starts_in
    return Event.objects.create(
        organization=organization,
        title=title,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=hours),
        venue_name="Local",
        status=Event.Status.PUBLISHED,
        published_at=timezone.now(),
    )


def _paid_ticket(event):
    from decimal import Decimal

    from apps.events.models import TicketType

    ticket_type = TicketType.objects.create(
        event=event, name="General", price=Decimal("30"), quantity_total=50
    )
    order = create_order(
        event=event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BuyerData(email="comprador@test.pe", full_name="Comprador"),
        terms_accepted=True,
    )
    return mark_paid(order_id=order.id).tickets.first()


def _scan(client, ticket, event):
    return client.post(
        "/api/org/checkin/",
        {"qr_payload": sign_ticket_code(ticket.code), "event_id": str(event.id)},
        format="json",
    )


# ── Gestión por el organizador ─────────────────────────────────────────────


def test_owner_creates_security_employee(owner_client, organization):
    res = owner_client.post(
        "/api/org/employees/",
        {"email": "Nuevo@Test.pe", "full_name": "Guardia Dos", "password": PASSWORD},
        format="json",
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["email"] == "nuevo@test.pe"
    assert body["role"] == "SECURITY"
    assert body["is_active"] is True
    assert body["all_events"] is True

    user = User.objects.get(email="nuevo@test.pe")
    assert user.role == User.Role.STAFF
    assert user.check_password(PASSWORD)
    assert Membership.objects.get(user=user).role == Membership.Role.SECURITY
    assert AuditLog.objects.filter(
        organization=organization, action=AuditLog.Action.EMPLOYEE_CREATED, target_id=user.id
    ).exists()

    listed = owner_client.get("/api/org/employees/").json()
    assert [e["email"] for e in listed] == ["nuevo@test.pe"]


def test_create_employee_rejects_weak_password_and_existing_email(owner_client, customer_user):
    weak = owner_client.post(
        "/api/org/employees/", {"email": "a@test.pe", "full_name": "A", "password": "123"}, format="json"
    )
    assert weak.status_code == 400
    taken = owner_client.post(
        "/api/org/employees/",
        {"email": customer_user.email, "full_name": "A", "password": PASSWORD},
        format="json",
    )
    assert taken.status_code == 400
    assert not User.objects.filter(email="a@test.pe").exists()


def test_owner_can_restrict_employee_to_specific_events(owner_client, employee, organization, org_b):
    mine = _event(organization, starts_in=timedelta(days=1))
    foreign = _event(org_b, starts_in=timedelta(days=1))

    res = owner_client.patch(
        f"/api/org/employees/{employee.id}/",
        {"all_events": False, "event_ids": [str(foreign.id)]},
        format="json",
    )
    assert res.status_code == 400  # un evento de otra organización no se puede asignar

    res = owner_client.patch(
        f"/api/org/employees/{employee.id}/",
        {"all_events": False, "event_ids": [str(mine.id)]},
        format="json",
    )
    assert res.status_code == 200
    assert res.json()["all_events"] is False
    assert [e["id"] for e in res.json()["events"]] == [str(mine.id)]


def test_owner_deactivates_reactivates_resets_and_deletes(owner_client, employee, organization):
    url = f"/api/org/employees/{employee.id}/"
    assert owner_client.patch(url, {"is_active": False}, format="json").json()["is_active"] is False
    assert owner_client.patch(url, {"is_active": True}, format="json").json()["is_active"] is True

    res = owner_client.post(f"{url}reset-password/", {"password": "Otra-Clave-Nueva-9"}, format="json")
    assert res.status_code == 204
    employee.user.refresh_from_db()
    assert employee.user.check_password("Otra-Clave-Nueva-9")

    user_id = employee.user_id
    assert owner_client.delete(url).status_code == 204
    assert not User.objects.filter(id=user_id).exists()

    actions = set(
        AuditLog.objects.filter(organization=organization, target_id=user_id).values_list("action", flat=True)
    )
    assert {
        "EMPLOYEE_CREATED",
        "EMPLOYEE_DEACTIVATED",
        "EMPLOYEE_REACTIVATED",
        "EMPLOYEE_PASSWORD_RESET",
        "EMPLOYEE_DELETED",
    } <= actions


# ── Aislamiento entre organizaciones ───────────────────────────────────────


def test_other_organization_cannot_see_or_touch_employees(owner_b_client, employee):
    assert owner_b_client.get("/api/org/employees/").json() == []
    url = f"/api/org/employees/{employee.id}/"
    assert owner_b_client.get(url).status_code == 404
    assert owner_b_client.patch(url, {"is_active": False}, format="json").status_code == 404
    assert (
        owner_b_client.post(f"{url}reset-password/", {"password": PASSWORD}, format="json").status_code == 404
    )
    assert owner_b_client.delete(url).status_code == 404
    employee.user.refresh_from_db()
    assert employee.user.is_active


def test_employee_cannot_scan_or_see_other_organization_events(door_client, org_b):
    foreign = _event(org_b, starts_in=timedelta(minutes=30))
    ticket = _paid_ticket(foreign)
    res = _scan(door_client, ticket, foreign)
    assert res.status_code == 403
    assert door_client.get(f"/api/org/door/events/{foreign.id}/").status_code == 404
    assert str(foreign.id) not in [e["id"] for e in door_client.get("/api/org/door/events/").json()]


# ── Login único y acceso solo al escáner ───────────────────────────────────


def test_employee_logs_in_with_the_panel_login_and_gets_door_scope(client, employee):
    from rest_framework_simplejwt.tokens import AccessToken

    res = client.post(
        "/api/auth/org/login/",
        {"email": "seguridad@test.pe", "password": PASSWORD},
        content_type="application/json",
    )
    assert res.status_code == 200
    access = AccessToken(res.json()["access"])
    assert access["scope"] == "door"
    assert access["organization_id"] == str(employee.organization_id)


SCANNER_ENDPOINTS = {"checkin", "checkin-lookup", "door-events", "door-event-detail"}


def _api_patterns(patterns=None, under_api=False):
    for pattern in patterns if patterns is not None else get_resolver().url_patterns:
        if isinstance(pattern, URLResolver):
            yield from _api_patterns(pattern.url_patterns, under_api or str(pattern.pattern) == "api/")
        elif isinstance(pattern, URLPattern) and under_api:
            yield pattern


def _kwargs_for(pattern: URLPattern) -> dict | None:
    names = getattr(pattern.pattern, "converters", None)
    names = list(names) if names else list(pattern.pattern.regex.groupindex)
    if "format" in names:
        return None  # variante con sufijo .json de DefaultRouter: es la misma vista
    return {name: ("TK-X" if name == "code" else str(uuid.uuid4())) for name in names}


def _is_public(view_cls) -> bool:
    return all(issubclass(p, AllowAny) for p in getattr(view_cls, "permission_classes", []))


def test_employee_gets_403_on_every_non_scanner_endpoint(door_client):
    """Revisión sistemática: recorre TODAS las rutas /api/ y exige 403 al
    scope "door" en cada método de cada vista autenticada que no sea del
    escáner. Una vista nueva queda cubierta sin tocar este test."""
    checked = []
    for pattern in _api_patterns():
        view_cls = getattr(pattern.callback, "cls", None)
        if view_cls is None or not pattern.name or pattern.name.endswith("api-root"):
            continue
        if pattern.name in SCANNER_ENDPOINTS or _is_public(view_cls):
            continue
        kwargs = _kwargs_for(pattern)
        if kwargs is None:
            continue
        actions = getattr(pattern.callback, "actions", None)
        methods = (
            list(actions)
            if actions
            else [
                m for m in view_cls.http_method_names if m not in ("options", "head") and hasattr(view_cls, m)
            ]
        )
        url = reverse(pattern.name, kwargs=kwargs)
        for method in methods:
            res = getattr(door_client, method)(url, {}, format="json")
            assert res.status_code == 403, f"{method.upper()} {url} ({pattern.name}) → {res.status_code}"
            checked.append(f"{method} {pattern.name}")
    # Sanidad: el recorrido de verdad pasó por los endpoints de organizador.
    names = " ".join(checked)
    for expected in (
        "org-event-list",
        "org-employee-list",
        "org-audit",
        "org-site-settings",
        "org-password-change",
    ):
        assert expected in names, expected
    assert len(checked) > 40


def test_employee_cannot_undo_a_check_in(door_client, organization):
    event = _event(organization, starts_in=timedelta(minutes=30))
    ticket = _paid_ticket(event)
    assert _scan(door_client, ticket, event).status_code == 200
    res = door_client.post(
        f"/api/org/tickets/{ticket.code}/undo-checkin/", {"reason_code": "MISTAKE"}, format="json"
    )
    assert res.status_code == 403


# ── Ventana horaria ────────────────────────────────────────────────────────


def test_employee_can_scan_inside_the_window_and_it_is_audited(door_client, employee, organization):
    event = _event(organization, starts_in=timedelta(hours=2))  # dentro de las 3 h previas
    ticket = _paid_ticket(event)

    res = _scan(door_client, ticket, event)
    assert res.status_code == 200, res.content
    ticket.refresh_from_db()
    assert ticket.checked_in_by_id == employee.user_id

    log = AuditLog.objects.get(action=AuditLog.Action.TICKET_CHECKED_IN, target_id=ticket.id)
    assert log.actor_id == employee.user_id
    assert log.actor_email == "seguridad@test.pe"
    assert log.event_id == event.id
    assert log.metadata["via"] == "qr"


def test_employee_is_blocked_before_the_window_with_a_clear_message(door_client, organization, settings):
    settings.CHECKIN_WINDOW_HOURS_BEFORE_START = 3
    event = _event(organization, starts_in=timedelta(days=2))
    ticket = _paid_ticket(event)

    res = _scan(door_client, ticket, event)
    assert res.status_code == 409
    error = res.json()["error"]
    assert error["code"] == "SCANNER_CLOSED"
    assert error["message"].startswith("El escáner se habilita el ")
    assert " a las " in error["message"]
    assert error["details"]["opens_at"]
    ticket.refresh_from_db()
    assert ticket.status == "VALID"

    listed = {e["id"]: e for e in door_client.get("/api/org/door/events/").json()}
    assert listed[str(event.id)]["scanner_is_open"] is False


def test_employee_is_blocked_after_the_event_ends(door_client, organization):
    event = _event(organization, starts_in=-timedelta(hours=10), hours=4)  # terminó hace 6 h
    ticket = _paid_ticket(event)
    res = _scan(door_client, ticket, event)
    assert res.status_code == 409
    assert "cerró" in res.json()["error"]["message"]
    # Tampoco aparece en su lista: ya no le sirve.
    assert str(event.id) not in [e["id"] for e in door_client.get("/api/org/door/events/").json()]


def test_window_is_configurable(door_client, organization, settings):
    event = _event(organization, starts_in=timedelta(hours=5))
    ticket = _paid_ticket(event)
    settings.CHECKIN_WINDOW_HOURS_BEFORE_START = 3
    assert _scan(door_client, ticket, event).status_code == 409
    settings.CHECKIN_WINDOW_HOURS_BEFORE_START = 6
    assert _scan(door_client, ticket, event).status_code == 200


def test_organizer_has_no_time_restriction(owner_client, organization):
    event = _event(organization, starts_in=timedelta(days=5))
    ticket = _paid_ticket(event)
    assert _scan(owner_client, ticket, event).status_code == 200
    # Sus escaneos no se duplican en la bitácora (ya quedan en el ticket).
    assert not AuditLog.objects.filter(action=AuditLog.Action.TICKET_CHECKED_IN).exists()


def test_restricted_employee_only_scans_assigned_events(owner_client, door_client, employee, organization):
    assigned = _event(organization, starts_in=timedelta(hours=1), title="Asignado")
    other = _event(organization, starts_in=timedelta(hours=1), title="Otro")
    owner_client.patch(
        f"/api/org/employees/{employee.id}/",
        {"all_events": False, "event_ids": [str(assigned.id)]},
        format="json",
    )
    assert [e["title"] for e in door_client.get("/api/org/door/events/").json()] == ["Asignado"]
    assert _scan(door_client, _paid_ticket(other), other).status_code == 403
    assert _scan(door_client, _paid_ticket(assigned), assigned).status_code == 200


# ── Empleado desactivado / eliminado / con contraseña reseteada ────────────


def test_deactivated_employee_cannot_login_nor_use_tokens(client, owner_client, employee, door_tokens):
    owner_client.patch(f"/api/org/employees/{employee.id}/", {"is_active": False}, format="json")

    login = client.post(
        "/api/auth/org/login/",
        {"email": "seguridad@test.pe", "password": PASSWORD},
        content_type="application/json",
    )
    assert login.status_code == 400

    assert _client(door_tokens["access"]).get("/api/org/door/events/").status_code == 401
    refresh = client.post(
        "/api/auth/org/refresh/", {"refresh": door_tokens["refresh"]}, content_type="application/json"
    )
    assert refresh.status_code == 401


def test_deleted_employee_tokens_stop_working(owner_client, employee, door_tokens):
    owner_client.delete(f"/api/org/employees/{employee.id}/")
    assert _client(door_tokens["access"]).get("/api/org/door/events/").status_code == 401


def test_password_reset_closes_open_sessions(client, owner_client, employee, door_tokens):
    owner_client.post(
        f"/api/org/employees/{employee.id}/reset-password/", {"password": "Otra-Clave-Nueva-9"}, format="json"
    )
    refresh = client.post(
        "/api/auth/org/refresh/", {"refresh": door_tokens["refresh"]}, content_type="application/json"
    )
    assert refresh.status_code == 401
    login = client.post(
        "/api/auth/org/login/",
        {"email": "seguridad@test.pe", "password": "Otra-Clave-Nueva-9"},
        content_type="application/json",
    )
    assert login.status_code == 200


def test_employee_cannot_manage_employees(door_client, employee):
    assert door_client.get("/api/org/employees/").status_code == 403
    assert (
        door_client.post(
            "/api/org/employees/",
            {"email": "x@test.pe", "full_name": "X", "password": PASSWORD},
            format="json",
        ).status_code
        == 403
    )
