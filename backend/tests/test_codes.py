import pytest
from django.test import override_settings

from apps.common.errors import DomainError
from apps.orders.services.codes import generate_ticket_code, sign_ticket_code, verify_qr_payload


def test_generate_ticket_code_is_unique_enough():
    codes = {generate_ticket_code() for _ in range(1000)}
    assert len(codes) == 1000


def test_sign_and_verify_roundtrip():
    code = generate_ticket_code()
    payload = sign_ticket_code(code)
    assert verify_qr_payload(payload) == code


def test_tampered_signature_is_rejected():
    code = generate_ticket_code()
    payload = sign_ticket_code(code)
    version, c, key_id, signature = payload.split(".")
    tampered = f"{version}.{c}.{key_id}.{signature[:-1]}X"
    with pytest.raises(DomainError) as exc:
        verify_qr_payload(tampered)
    assert exc.value.code == "TICKET_INVALID"


def test_tampered_code_is_rejected():
    code = generate_ticket_code()
    payload = sign_ticket_code(code)
    version, _c, key_id, signature = payload.split(".")
    tampered = f"{version}.{generate_ticket_code()}.{key_id}.{signature}"
    with pytest.raises(DomainError):
        verify_qr_payload(tampered)


def test_malformed_payload_is_rejected():
    with pytest.raises(DomainError):
        verify_qr_payload("not-a-valid-payload")


def test_unknown_key_id_is_rejected():
    with pytest.raises(DomainError):
        verify_qr_payload("T1.SOMECODE1234567890AB.unknown-key.signature")


@override_settings(TICKET_SIGNING_KEYS={"k1": "old-key", "k2": "new-key"}, TICKET_SIGNING_KEY_ID="k2")
def test_key_rotation_keeps_old_keys_valid():
    code = generate_ticket_code()
    old_payload = sign_ticket_code(code, key_id="k1")
    assert verify_qr_payload(old_payload) == code

    new_payload = sign_ticket_code(code)
    assert "k2" in new_payload
    assert verify_qr_payload(new_payload) == code
