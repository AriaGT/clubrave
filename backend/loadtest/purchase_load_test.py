"""Prueba de carga de §12 (Hito 05): 100 compras concurrentes contra un
aforo pequeño, y 50 escaneos/minuto sin doble ingreso.

Pega contra la API real por HTTP (no el ORM directamente): mide el camino
completo, incluida la vista, el serializador y el bloqueo de fila.

**Requiere Postgres.** Contra SQLite, `select_for_update()` degrada a
serializar el archivo completo a nivel de proceso (ver la prueba
equivalente y saltada en `tests/test_checkout.py`) y el resultado no
demuestra nada sobre bloqueo de fila real — solo que SQLite sirve un
archivo a la vez. Para correrla:

    docker compose up -d postgres
    DATABASE_URL=postgres://ticketera:ticketera@localhost:5432/ticketera \\
        python manage.py migrate
    python manage.py seed_demo
    python manage.py runserver 0.0.0.0:8000 --settings=config.settings.dev
    # en otra terminal:
    python loadtest/purchase_load_test.py
"""

import os
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

BASE_URL = os.environ.get("LOADTEST_BASE_URL", "http://127.0.0.1:8000")
ORGANIZER_EMAIL = os.environ.get("LOADTEST_ORG_EMAIL", "demo@ticketera.pe")
ORGANIZER_PASSWORD = os.environ.get("LOADTEST_ORG_PASSWORD", "demo12345")

# Valores de §12 por defecto; se pueden achicar para una corrida rápida de
# humo (p. ej. LOADTEST_BUYERS=5 LOADTEST_CAPACITY=3) sin tocar el archivo.
CONCURRENT_BUYERS = int(os.environ.get("LOADTEST_BUYERS", 100))
CAPACITY = int(os.environ.get("LOADTEST_CAPACITY", 60))  # menor a propósito: fuerza sobreventa si algo falla
SCANS_TARGET_PER_MINUTE = int(os.environ.get("LOADTEST_SCANS", 50))


def org_login() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/org/login/",
        json={"email": ORGANIZER_EMAIL, "password": ORGANIZER_PASSWORD},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access"]


def setup_event(token: str) -> tuple[str, str]:
    """Crea un evento publicado con un solo tipo de entrada de aforo
    `CAPACITY`. Devuelve (event_id, ticket_type_id)."""
    headers = {"Authorization": f"Bearer {token}"}

    event = requests.post(
        f"{BASE_URL}/api/org/events/",
        json={
            "title": f"Carga {int(time.time())}",
            "starts_at": "2027-01-01T22:00:00Z",
            "venue_name": "Local de carga",
            "city": "Lima",
        },
        headers=headers,
        timeout=10,
    ).json()

    image = requests.post(
        f"{BASE_URL}/api/org/events/{event['id']}/images/",
        headers=headers,
        files={"image": ("loadtest.jpg", _tiny_jpeg(), "image/jpeg")},
    )
    image.raise_for_status()

    ticket_type = requests.post(
        f"{BASE_URL}/api/org/events/{event['id']}/ticket-types/",
        json={"name": "General", "price": "10.00", "quantity_total": CAPACITY, "max_per_order": 1},
        headers=headers,
        timeout=10,
    ).json()

    publish = requests.post(f"{BASE_URL}/api/org/events/{event['id']}/publish/", headers=headers)
    publish.raise_for_status()

    return event["id"], ticket_type["id"]


def _tiny_jpeg() -> bytes:
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (900, 600), (20, 20, 20)).save(buf, format="JPEG")
    return buf.getvalue()


def attempt_purchase(event_id: str, ticket_type_id: str, i: int) -> dict:
    session = requests.Session()
    t0 = time.monotonic()
    try:
        checkout = session.post(
            f"{BASE_URL}/api/checkout/orders/",
            json={
                "event_id": event_id,
                "items": [{"ticket_type_id": ticket_type_id, "quantity": 1}],
                "buyer": {"email": f"carga{i}@test.pe", "full_name": f"Comprador {i}"},
                "terms_accepted": True,
            },
            timeout=15,
        )
        if checkout.status_code != 201:
            try:
                reason = checkout.json().get("error", {}).get("code", checkout.status_code)
            except ValueError:
                # El cuerpo no es JSON (500 con página HTML, conexión
                # cortada a medias): que se vea el status y el cuerpo crudo
                # en vez de un "network error" genérico que esconde la causa.
                reason = f"http_{checkout.status_code}: {checkout.text[:200]!r}"
            return {"ok": False, "reason": reason}

        order = checkout.json()["order"]
        confirm = session.post(
            f"{BASE_URL}/api/checkout/orders/{order['code']}/confirm/",
            json={"order_code": order["code"], "approved": True},
            timeout=15,
        )
        confirm.raise_for_status()
        return {"ok": True, "order_code": order["code"], "elapsed": time.monotonic() - t0}
    except requests.RequestException as exc:
        return {"ok": False, "reason": f"network: {exc}"}


def run_purchase_load(event_id: str, ticket_type_id: str) -> list[dict]:
    print(f"\n== {CONCURRENT_BUYERS} compras concurrentes contra un aforo de {CAPACITY} ==")
    results = []
    with ThreadPoolExecutor(max_workers=CONCURRENT_BUYERS) as pool:
        futures = [
            pool.submit(attempt_purchase, event_id, ticket_type_id, i) for i in range(CONCURRENT_BUYERS)
        ]
        for future in as_completed(futures):
            results.append(future.result())
    return results


def fetch_tickets(token: str, event_id: str) -> list[str]:
    headers = {"Authorization": f"Bearer {token}"}
    codes = []
    url = f"{BASE_URL}/api/org/events/{event_id}/attendees/"
    while url:
        data = requests.get(url, headers=headers, timeout=10).json()
        codes.extend(t["code"] for t in data["results"])
        url = data.get("next")
    return codes


def scan(token: str, event_id: str, code: str) -> int:
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(
        f"{BASE_URL}/api/org/checkin/",
        json={"manual_code": code, "event_id": event_id},
        headers=headers,
        timeout=10,
    )
    return r.status_code


def run_scan_load(token: str, event_id: str, codes: list[str]) -> None:
    print(f"\n== {len(codes)} escaneos concurrentes + doble escaneo del primer código ==")
    with ThreadPoolExecutor(max_workers=min(SCANS_TARGET_PER_MINUTE, len(codes) or 1)) as pool:
        t0 = time.monotonic()
        statuses = list(pool.map(lambda c: scan(token, event_id, c), codes))
        elapsed = time.monotonic() - t0

    ok = statuses.count(200)
    print(f"{ok}/{len(codes)} escaneos válidos en {elapsed:.1f}s ({len(codes) / max(elapsed, 0.001):.1f}/s)")
    assert ok == len(codes), f"se esperaban {len(codes)} escaneos válidos, hubo {ok}"

    if codes:
        # El mismo código, 10 veces a la vez: solo uno debe poder "ganar"
        # incluso si ya estaba validado — todas deben responder 409, nunca 200.
        with ThreadPoolExecutor(max_workers=10) as pool:
            repeat_statuses = list(pool.map(lambda _: scan(token, event_id, codes[0]), range(10)))
        assert all(s == 409 for s in repeat_statuses), f"doble ingreso no bloqueado: {repeat_statuses}"
        print("Doble escaneo del mismo código: 10/10 rechazados con 409 (correcto)")


def main():
    token = org_login()
    event_id, ticket_type_id = setup_event(token)
    print(f"Evento de prueba: {event_id} (aforo {CAPACITY})")

    results = run_purchase_load(event_id, ticket_type_id)
    successes = [r for r in results if r["ok"]]
    failures = [r for r in results if not r["ok"]]
    sold_out = [r for r in failures if r["reason"] == "SOLD_OUT"]

    print(f"Compras exitosas: {len(successes)} / {CONCURRENT_BUYERS}")
    print(f"Rechazadas por SOLD_OUT: {len(sold_out)}")
    other_failures = [r for r in failures if r["reason"] != "SOLD_OUT"]
    if other_failures:
        print(f"Fallos inesperados: {other_failures[:5]}")

    if successes:
        latencies = [r["elapsed"] for r in successes]
        print(
            f"Latencia compra -> pagada: p50={statistics.median(latencies):.2f}s "
            f"p95={sorted(latencies)[int(len(latencies) * 0.95)]:.2f}s"
        )

    # El invariante que de verdad importa: nunca más ventas que aforo. Esto
    # debe cumplirse SIEMPRE, incluso si hay errores de infraestructura.
    assert len(successes) <= CAPACITY, (
        f"SOBREVENTA: se vendieron {len(successes)}, el aforo era {CAPACITY}"
    )
    assert not other_failures, (
        f"{len(other_failures)} fallo(s) que no son SOLD_OUT (posible degradación de infraestructura, "
        f"no sobreventa — revisar el detalle arriba): {other_failures[0]['reason'][:200]}"
    )
    # Con cero fallos inesperados, el aforo debió agotarse exactamente.
    assert len(successes) == CAPACITY, (
        f"se vendieron {len(successes)} de {CAPACITY} sin ningún fallo inesperado: "
        "inconsistente, revisar el conteo de SOLD_OUT arriba"
    )
    print(f"OK: exactamente {CAPACITY} vendidas. Cero sobreventa.")

    codes = fetch_tickets(token, event_id)
    assert len(codes) == CAPACITY, f"se emitieron {len(codes)} entradas, se esperaban {CAPACITY}"
    run_scan_load(token, event_id, codes)

    print("\nOK: prueba de carga completa: sin sobreventa, sin doble ingreso.")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"\nFALLO: {exc}")
        sys.exit(1)
