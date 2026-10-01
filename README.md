# Ticketera — plataforma de venta de entradas con QR (MVP)

Implementación técnica de [`plan-mvp-ticketera-qr.md`](./plan-mvp-ticketera-qr.md).
Este README cubre lo construido hasta ahora: **Hito 01** (arquitectura base
del backend y design system), **Hito 02** (portal del organizador),
**Hito 03** (tienda del comprador), **Hito 04** (integración con Izipay) y
**Hito 05** (endurecimiento y despliegue) — los cinco hitos de §12 del plan.

## Estructura

```
backend/            API Django + DRF (eventos, órdenes, pagos, check-in)
packages/tokens/     Tokens del design system NOCTA (CSS + preset Tailwind v4)
packages/ui/         12 componentes base (Radix + CVA + Tailwind v4)
packages/api-client/ Tipos generados desde OpenAPI + fetcher tipado
apps/organizer/      Panel del organizador (Next.js) — incluye /_ds
apps/store/          Tienda del comprador (Next.js) — cartelera, checkout, cuenta
docker-compose.yml    Postgres + MinIO para desarrollo
```

## Backend

```bash
cd backend
python -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"   # o instalar las deps una por una si falla el build editable
cp .env.example .env
python manage.py migrate
python manage.py seed_demo                # organizador demo@ticketera.pe / demo12345
python manage.py runserver
```

- API: http://localhost:8000/api/
- Documentación OpenAPI: http://localhost:8000/api/docs/
- Admin: http://localhost:8000/admin/

Tests: `pytest` (81 pruebas; 1 se salta en SQLite porque el escenario de
concurrencia necesita el bloqueo de fila real de Postgres — corre en CI).

Con Docker: `docker compose up` levanta Postgres + MinIO + la API.

## Frontend

```bash
pnpm install
pnpm dev:organizer   # http://localhost:3001 — /_ds tiene el design system
pnpm dev:store       # http://localhost:3000 — la tienda del comprador
```

## Regenerar tipos de la API

Con el backend corriendo en `:8000`:

```bash
cd packages/api-client
pnpm generate
```

## Portal del organizador (Hito 02)

Login (JWT en memoria + refresh en cookie `httpOnly`), shell con barra
inferior, wizard de 4 pasos con autoguardado, gestión de imágenes y tipos de
entrada, listado de eventos, resumen con métricas en vivo, ventas,
asistentes, y el escáner de puerta (`BarcodeDetector` nativo + entrada manual
del código, siempre disponible). Verificado de punta a punta en el
navegador: login → crear evento → publicar → QR del enlace → escanear
(cámara y manual) → resultado verde/ámbar/rojo.

**Deferido de §10** por alcance: el service worker de Serwist (el manifiesto
y los iconos ya están), el respaldo `@zxing/browser` para navegadores sin
`BarcodeDetector`, y el reordenamiento de imágenes por arrastre (hoy es con
flechas, accesible pero no drag-and-drop).

## Tienda del comprador (Hito 03)

Cartelera con SSR/ISR, página de evento con metadatos Open Graph y JSON-LD
`schema.org/Event`, carrito por evento (Zustand + localStorage, solo
`{ticketTypeId: cantidad}`, nunca precios), identificación sin contraseña
(OTP de 6 dígitos + enlace mágico), checkout con retención de inventario,
pago simulado con `FakeGateway`, "Mi cuenta" con entradas por estado
(Activas/Usadas/Vencidas), brillo máximo (capa blanca a pantalla completa),
descarga de PDF, e historial de compras.

Verificado de punta a punta en el navegador: cartelera → evento → carrito →
identificación por email → datos + términos → pago simulado → entradas con
QR real → **validadas en el escáner del panel del organizador** (cierra el
círculo completo compra→puerta). En el camino se corrigieron dos bugs reales
encontrados durante la verificación: URLs de portada relativas (rompían las
imágenes fuera del propio origen del backend) y una condición de carrera al
vaciar el carrito antes de navegar a pago.

**Deferido de §11** por alcance: el `.ics` para agregar el evento al
calendario.

## Izipay (Hito 04)

Variables de entorno renombradas para coincidir exactamente con §8.6 del
plan (`IZIPAY_SHOP_ID`, `IZIPAY_REST_PASSWORD`, `IZIPAY_HMAC_SHA256_KEY`,
`IZIPAY_PUBLIC_KEY`, `IZIPAY_REST_URL`, `IZIPAY_JS_URL`, `IZIPAY_MODE`) —
antes tenían nombres inventados que no coincidían con el documento de
referencia. Se endureció la verificación de firmas para revisar también el
campo `kr-hash-key` del payload (defensa extra contra el "error clásico" de
confundir la clave del navegador con la del IPN, §8.4), con 13 pruebas
unitarias nuevas que firman payloads sintéticos sin necesitar credenciales
reales. Se agregó un system check (`payments.W001`/`W002`) que avisa si
`IZIPAY_MODE` es incoherente con `DEBUG`. El formulario incrustado real
(Krypton) ya está integrado en la pantalla de pago, activo solo cuando
`PAYMENT_GATEWAY=izipay` — con `fake` (el valor por defecto) sigue
mostrando los botones de simulación, sin cambios.

**Sin verificar contra el entorno de pruebas real de Izipay** porque no hay
credenciales disponibles — es la limitación que el propio plan anticipa
(§12: "un retraso del proveedor no bloquea los hitos 01–03 ni el 05; solo
desplaza este"). El documento [`docs/izipay-activacion.md`](./docs/izipay-activacion.md)
tiene el checklist exacto de qué pedirle a Izipay y los nueve escenarios de
prueba de §8.8 para correr en cuanto lleguen.

Posteriormente se añadió **Mercado Pago Checkout Pro** como segunda pasarela
real, y es la recomendada para empezar a cobrar: el comprador paga en el
entorno de Mercado Pago, así que la tarjeta no pasa por nuestro servidor.
Ver la sección [Pagos](#pagos).

## Endurecimiento y despliegue (Hito 05)

Checklist de seguridad de §13.1 revisado punto por punto contra el código
real, no de memoria. Lo que estaba genuinamente flojo se cerró:

- **Subida de imágenes sin validar** (§5.7 nunca se implementó en el
  Hito 01): ahora [`apps/events/image_processing.py`](backend/apps/events/image_processing.py)
  abre el archivo de verdad con Pillow —nunca confía en la extensión ni el
  `Content-Type`—, exige 800×600 mínimo, límite de 8 MB, y normaliza todo a
  WebP sin EXIF. 6 pruebas nuevas, incluida una que renombra un binario a
  `.jpg` con `Content-Type: image/jpeg` falso para confirmar que igual se
  rechaza.
- **Aislamiento entre organizaciones sin pruebas explícitas**: 14 pruebas
  nuevas en [`test_organization_isolation.py`](backend/tests/test_organization_isolation.py)
  cubren cada endpoint de organizador uno por uno. Encontraron un bug real:
  `perform_create` en imágenes y tipos de entrada usaba `.objects.get()`
  directo, así que un intento de otra organización tiraba un 500 en vez de
  un 404 — corregido con `get_object_or_404`.
- **Hasher de contraseñas**: Argon2 primero en `PASSWORD_HASHERS` (antes
  quedaba en el default de Django sin decidirlo explícitamente).
  Cabeceras: `Content-Security-Policy` nueva vía middleware propio;
  `nosniff` y `Referrer-Policy` explícitos en producción (ya eran default
  de Django, pero ahora es auditable sin confiar en que no cambien).
  `config.settings.prod` ahora **rehúsa arrancar** sin `ALLOWED_HOSTS`
  explícito, y sirve solo JSON (nunca la API navegable con estilos en
  línea) para simplificar la CSP.
- **Borrado de cuenta**: `DELETE /api/me/` anonimiza el perfil (nombre,
  teléfono, documento, email) y desactiva el acceso, pero **nunca toca las
  órdenes** — son la fotografía contable que exige el checklist, con
  `Order.customer` en `PROTECT` a propósito. UI de confirmación en dos
  pasos en "Perfil" de la tienda.
- **Pull de pagination sin ordenar**: `UnorderedObjectListWarning` de DRF en
  dos endpoints (asistentes, mis entradas) — resultados de paginación
  podían salir inconsistentes entre páginas. Corregido con `order_by`.
- **Dependencias auditadas**: `pip-audit` limpio; `pnpm audit` encontró 2
  CVE de severidad alta en el `postcss` interno de Next.js — resueltas con
  un `override` de pnpm que fuerza la versión parcheada sin esperar a que
  Next la actualice.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): ruff +
  pytest contra Postgres real, `tsc` + build de ambas apps, `pip-audit` +
  `pnpm audit`. Sin eslint ni Playwright todavía (no configurados; queda
  anotado en el propio workflow, no fingido en verde).
- **Prueba de carga** ([`backend/loadtest/purchase_load_test.py`](backend/loadtest/purchase_load_test.py)):
  100 compras concurrentes contra un aforo de 60, más 50 escaneos
  concurrentes y un doble-escaneo de 10 intentos simultáneos al mismo
  código. Verificada mecánicamente contra SQLite (que degrada a serializar
  el archivo completo, tal como documenta el propio script) — el hallazgo
  real fue que **el sistema nunca vende de más ni bajo esa degradación**,
  solo falla algunas solicitudes; la corrida completa que debe dar
  `60/60` sin fallos necesita Postgres, que no está disponible en este
  entorno (mismo motivo que el escenario saltado en `pytest`).

**Documentos de traspaso**: [`docs/manual-organizador.md`](docs/manual-organizador.md),
[`docs/guia-puerta.md`](docs/guia-puerta.md), y el runbook de despliegue en
[`docs/despliegue.md`](docs/despliegue.md) (variables de entorno,
verificación con `check --deploy`, copias de seguridad, alertas, y qué
hacer si algo falla el día del evento).

**No hecho, con motivo**: no hay un despliegue real (no hay dominio ni
hosting contratado en este ejercicio) — `docs/despliegue.md` es el runbook
listo para ejecutar, no un despliegue ejecutado. La PWA instalable
(service worker de Serwist) sigue pendiente desde el Hito 02, por la misma
razón de alcance de entonces.

## Pagos

La pasarela se elige con una sola variable, `PAYMENT_GATEWAY`, detrás de la
interfaz `PaymentGateway` ([`backend/apps/payments/gateways.py`](backend/apps/payments/gateways.py)):

| Valor | Qué es | ¿Cobra? |
|---|---|---|
| `mercadopago` | Checkout Pro (Orders API), con redirección | Sí |
| `izipay` | Formulario incrustado (Krypton) | Sí |
| `fake` | Desarrollo y tests: botones de aprobar/rechazar | No |
| `disabled` | Interruptor de emergencia: bloquea las compras | No |

`fake` es el valor por defecto y **nunca debe ir a producción**: aprueba
cualquier cosa y emitiría entradas sin cobrar. Para cortar cobros en caliente
el modo correcto es `disabled`.

En los dos proveedores reales el estado de la orden lo decide un canal
servidor-a-servidor, nunca el navegador; en Mercado Pago, además, el retorno
del comprador reconsulta la order a la API, así que manipular la URL de éxito
no produce entradas y cerrar el navegador tras pagar tampoco las pierde.

Guía de decisión y los cuatro modos: [`docs/pagos.md`](docs/pagos.md).
Activación paso a paso: [`docs/mercadopago-activacion.md`](docs/mercadopago-activacion.md)
y [`docs/izipay-activacion.md`](docs/izipay-activacion.md).

## Códigos de invitado

El organizador genera en lote códigos de cortesía ligados a un tipo de
entrada (zona) y los comparte (copiar, Web Share API, CSV, enlace
`/e/<slug>?codigo=`). El invitado los canjea en la tienda sin pasarela
(`/invitado`): se emite una orden `PAID` de monto 0 con `Order.is_guest`, que
reutiliza QR, email, "Mi cuenta" y escáner, y queda fuera de los ingresos.
Generar un código **retiene cupo** (`quantity_reserved`); redimirlo lo pasa a
vendido y anularlo lo libera. La redención bloquea la fila del código
(`select_for_update`) y los endpoints públicos tienen throttle por IP
(`guest_code`). Detalle de uso en el
[manual del organizador](docs/manual-organizador.md#códigos-de-invitado-entradas-de-cortesía);
el diseño está en [`apps/orders/services/guest_codes.py`](backend/apps/orders/services/guest_codes.py).

## Qué falta

Con los cinco hitos de §12 cubiertos, lo que queda es lo que el propio plan
deja fuera del MVP a propósito (§16): cupones, transferencia de entradas,
multi-organizador con equipos, apps nativas, etc. — y ejecutar el runbook
de despliegue contra un hosting real cuando haya uno.
