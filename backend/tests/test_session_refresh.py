"""Refresh de JWT tolerante a carreras (sesión de la PWA, sobre todo iOS).

Antes: cada refresh rotaba y ponía en lista negra el token, así que dos
refrescos simultáneos (o una respuesta perdida al suspenderse la app)
terminaban en 401 → logout. Ver apps/accounts/tokens.py."""

from datetime import timedelta

import pytest
from freezegun import freeze_time

from apps.accounts import services

URL = "/api/auth/org/refresh/"


def _refresh(client, token):
    return client.post(URL, {"refresh": token}, content_type="application/json")


@pytest.fixture
def tokens(organizer_user):
    return services.org_tokens_for_user(organizer_user)


def test_young_refresh_token_is_not_rotated_so_parallel_refreshes_all_succeed(client, tokens):
    responses = [_refresh(client, tokens["refresh"]) for _ in range(3)]
    assert all(r.status_code == 200 for r in responses)
    assert all("refresh" not in r.json() for r in responses)  # la cookie no cambia: no hay carrera
    assert all(r.json()["access"] for r in responses)


def test_old_refresh_token_is_rotated_and_a_racing_duplicate_is_still_accepted(client, tokens, settings):
    settings.JWT_REFRESH_ROTATE_AFTER_SECONDS = 0
    first = _refresh(client, tokens["refresh"])
    assert first.status_code == 200
    assert first.json()["refresh"] != tokens["refresh"]

    # Segunda petición en carrera con el MISMO token (ya rotado): dentro de la
    # ventana de gracia recibe su propio par válido en vez de un 401.
    racing = _refresh(client, tokens["refresh"])
    assert racing.status_code == 200
    assert racing.json()["access"]
    assert _refresh(client, racing.json()["refresh"]).status_code == 200
    assert _refresh(client, first.json()["refresh"]).status_code == 200


def test_rotated_token_is_rejected_after_the_grace_window(client, tokens, settings):
    settings.JWT_REFRESH_ROTATE_AFTER_SECONDS = 0
    settings.JWT_REFRESH_REUSE_GRACE_SECONDS = 120
    assert _refresh(client, tokens["refresh"]).status_code == 200
    with freeze_time(timedelta(minutes=5)):
        assert _refresh(client, tokens["refresh"]).status_code == 401


def test_revoked_sessions_never_enter_the_grace_window(client, tokens, organizer_user, settings):
    """Un token rotado hace segundos deja de valer si luego se revocan las
    sesiones (cambio de contraseña, desactivación, reseteo)."""
    settings.JWT_REFRESH_ROTATE_AFTER_SECONDS = 0
    rotated = _refresh(client, tokens["refresh"]).json()["refresh"]
    services.revoke_all_sessions(organizer_user)
    assert _refresh(client, tokens["refresh"]).status_code == 401
    assert _refresh(client, rotated).status_code == 401


def test_tampered_token_is_rejected(client, tokens):
    head, payload, signature = tokens["refresh"].split(".")
    assert _refresh(client, f"{head}.{payload}.{signature[::-1]}").status_code == 401


def test_inactive_user_cannot_refresh(client, tokens, organizer_user):
    organizer_user.is_active = False
    organizer_user.save(update_fields=["is_active"])
    assert _refresh(client, tokens["refresh"]).status_code == 401
