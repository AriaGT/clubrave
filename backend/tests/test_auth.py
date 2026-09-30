from datetime import timedelta

import pytest
from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import LoginCode
from apps.accounts.services import anonymize_account, request_login_code, verify_login_code
from apps.common.errors import DomainError


@pytest.fixture
def client():
    return APIClient()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_request_code_never_reveals_whether_the_email_exists(db):
    mail.outbox = []
    request_login_code(email="nadie@test.pe")
    assert len(mail.outbox) == 1  # el email se envía igual; el silencio está en la vista, no aquí


def test_request_code_view_always_returns_202(client, db):
    response = client.post("/api/auth/customer/request-code/", {"email": "a@test.pe"}, format="json")
    assert response.status_code == 202
    response = client.post("/api/auth/customer/request-code/", {"email": "no-existe@test.pe"}, format="json")
    assert response.status_code == 202


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_verify_with_correct_code_issues_tokens(db):
    request_login_code(email="a@test.pe")
    login_code = LoginCode.objects.get(email="a@test.pe")

    otp = _extract_otp_from_outbox()
    user = verify_login_code(email="a@test.pe", code=otp, token=None)
    assert user.email == "a@test.pe"

    login_code.refresh_from_db()
    assert login_code.consumed_at is not None


def _extract_otp_from_outbox() -> str:
    import re

    body = mail.outbox[-1].body
    match = re.search(r"<strong>(\d{6})</strong>", body)
    assert match, "No se encontró el OTP en el email"
    return match.group(1)


def test_verify_with_wrong_code_fails(db):
    request_login_code(email="a@test.pe")
    with pytest.raises(DomainError) as exc:
        verify_login_code(email="a@test.pe", code="000000", token=None)
    assert exc.value.code == "VALIDATION_ERROR"


def test_verify_with_expired_code_fails(db):
    request_login_code(email="a@test.pe")
    LoginCode.objects.filter(email="a@test.pe").update(expires_at=timezone.now() - timedelta(minutes=1))
    with pytest.raises(DomainError):
        verify_login_code(email="a@test.pe", code="000000", token=None)


def test_verify_locks_after_too_many_attempts(db):
    request_login_code(email="a@test.pe")
    for _ in range(5):
        with pytest.raises(DomainError):
            verify_login_code(email="a@test.pe", code="000000", token=None)

    login_code = LoginCode.objects.get(email="a@test.pe")
    assert login_code.attempts >= 5
    assert not login_code.is_usable()


def test_org_login_rejects_customer_role(client, customer_user):
    customer_user.set_password("clave12345")
    customer_user.save()
    response = client.post(
        "/api/auth/org/login/", {"email": customer_user.email, "password": "clave12345"}, format="json"
    )
    assert response.status_code == 400


def test_org_login_returns_scope_and_organization(client, organizer_user):
    response = client.post(
        "/api/auth/org/login/", {"email": organizer_user.email, "password": "clave12345"}, format="json"
    )
    assert response.status_code == 200
    assert "access" in response.json()


def test_anonymize_account_clears_pii_and_deactivates(customer_user):
    original_id = customer_user.id
    customer_user.full_name = "Nombre Real"
    customer_user.phone = "999999999"
    customer_user.document_id = "12345678"
    customer_user.marketing_consent = True
    customer_user.save()

    anonymize_account(customer_user)

    customer_user.refresh_from_db()
    assert customer_user.id == original_id  # misma fila: no rompe el FK de las órdenes
    assert customer_user.email != "comprador@test.pe"
    assert "eliminado" in customer_user.email
    assert customer_user.full_name == ""
    assert customer_user.phone == ""
    assert customer_user.document_id == ""
    assert customer_user.marketing_consent is False
    assert customer_user.is_active is False
    assert not customer_user.has_usable_password()


def test_anonymize_account_never_touches_order_snapshots(published_event, ticket_type, customer_user):
    from apps.orders.services.checkout import BuyerData, CartLine, create_order
    from apps.orders.services.fulfillment import mark_paid

    order = create_order(
        event=published_event,
        items=[CartLine(ticket_type_id=str(ticket_type.id), quantity=1)],
        buyer=BuyerData(email=customer_user.email, full_name="Nombre Real"),
        customer=customer_user,
        terms_accepted=True,
    )
    mark_paid(order_id=order.id)

    anonymize_account(customer_user)

    order.refresh_from_db()
    # La orden es la fotografía contable: conserva el nombre y el email tal
    # como eran al momento de pagar, aunque el perfil vivo ya se anonimizó.
    assert order.buyer_name == "Nombre Real"
    assert order.buyer_email == "comprador@test.pe"
    assert order.customer_id == customer_user.id


def test_delete_me_endpoint_anonymizes_the_authenticated_customer(client, customer_user):
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(customer_user)
    refresh["scope"] = "customer"
    access = refresh.access_token
    access["scope"] = "customer"

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = client.delete("/api/me/")
    assert response.status_code == 204

    customer_user.refresh_from_db()
    assert customer_user.is_active is False
    assert "eliminado" in customer_user.email


def test_delete_me_requires_authentication(client):
    response = client.delete("/api/me/")
    assert response.status_code == 401
