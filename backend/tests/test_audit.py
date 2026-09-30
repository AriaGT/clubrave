"""Épica D — H14 la bitácora de control.

Cada acción de control queda registrada con acción, autor, objetivo y motivo.
El registro guarda una fotografía del objetivo (título/código) para que la
línea siga teniendo sentido aunque el objeto se borre después, y está aislado
por organización. La API es de solo lectura.
"""

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Membership, Organization, User
from apps.common.models import AuditLog
from apps.events.models import Event


def _org_token(user: User, organization_id) -> str:
    refresh = RefreshToken.for_user(user)
    refresh["scope"] = "org"
    refresh["organization_id"] = str(organization_id)
    access = refresh.access_token
    access["scope"] = "org"
    access["organization_id"] = str(organization_id)
    return str(access)


@pytest.fixture
def client_a(organizer_user, organization):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_org_token(organizer_user, organization.id)}")
    return client


@pytest.fixture
def org_b(db):
    return Organization.objects.create(name="Promotora B", slug="promotora-b", contact_email="b@test.pe")


@pytest.fixture
def client_b(db, org_b):
    user = User.objects.create_user(email="organizadorb@test.pe", password="x", role=User.Role.ORGANIZER)
    Membership.objects.create(user=user, organization=org_b, role=Membership.Role.OWNER)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_org_token(user, org_b.id)}")
    return client


def test_unpublish_records_actor_target_and_reason(client_a, published_event, organizer_user):
    response = client_a.post(
        f"/api/org/events/{published_event.id}/unpublish/",
        {"reason": "Pausa de emergencia"},
        format="json",
    )
    assert response.status_code == 200

    entry = AuditLog.objects.get(action=AuditLog.Action.EVENT_UNPUBLISHED)
    assert entry.actor_email == organizer_user.email
    assert entry.target_label == published_event.title
    assert entry.reason == "Pausa de emergencia"
    assert entry.created_at is not None


def test_event_audit_lists_newest_first(client_a, published_event, ticket_type):
    client_a.post(f"/api/org/events/{published_event.id}/unpublish/", {"reason": ""}, format="json")
    client_a.post(f"/api/org/events/{published_event.id}/publish/")

    response = client_a.get(f"/api/org/events/{published_event.id}/audit/")
    assert response.status_code == 200
    actions = [row["action"] for row in response.json()["results"]]
    assert actions[0] == "EVENT_PUBLISHED"
    assert "EVENT_UNPUBLISHED" in actions


def test_audit_snapshot_survives_the_deletion_of_its_target(client_a, published_event):
    title = published_event.title
    event_id = published_event.id

    response = client_a.delete(
        f"/api/org/events/{event_id}/",
        {"reason": "Cargado por error", "confirm_title": title},
        format="json",
    )
    assert response.status_code == 204

    assert not Event.objects.filter(id=event_id).exists()
    entry = AuditLog.objects.get(action=AuditLog.Action.EVENT_DELETED, target_id=event_id)
    assert entry.target_label == title
    assert entry.reason == "Cargado por error"
    # La fila sobrevive al borrado: el FK del evento queda en blanco, no se cae.
    assert entry.event_id is None


def test_delete_event_requires_writing_the_exact_title(client_a, published_event):
    response = client_a.delete(
        f"/api/org/events/{published_event.id}/",
        {"reason": "Cargado por error", "confirm_title": "Otro título"},
        format="json",
    )
    assert response.status_code == 400
    assert Event.objects.filter(id=published_event.id).exists()
    assert not AuditLog.objects.filter(action=AuditLog.Action.EVENT_DELETED).exists()


def test_org_audit_is_read_only_and_scoped_to_the_organization(client_a, client_b, published_event):
    client_a.post(f"/api/org/events/{published_event.id}/unpublish/", {"reason": "hola"}, format="json")

    response_b = client_b.get("/api/org/audit/")
    assert response_b.status_code == 200
    assert response_b.json()["results"] == []

    response_a = client_a.get("/api/org/audit/")
    assert response_a.status_code == 200
    assert any(row["action"] == "EVENT_UNPUBLISHED" for row in response_a.json()["results"])


def test_audit_cannot_be_written_nor_deleted_from_the_api(client_a, published_event):
    client_a.post(f"/api/org/events/{published_event.id}/unpublish/", {"reason": ""}, format="json")
    entry = AuditLog.objects.get(action=AuditLog.Action.EVENT_UNPUBLISHED)

    # No hay endpoint de escritura ni de borrado: ambos son POST/DELETE sobre
    # una ruta que no existe (405), nunca un cambio silencioso.
    assert client_a.post("/api/org/audit/", {"action": "X"}).status_code == 405
    assert client_a.delete(f"/api/org/audit/{entry.id}/").status_code == 404
    assert AuditLog.objects.filter(id=entry.id).exists()
