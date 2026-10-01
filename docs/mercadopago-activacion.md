# Activar cobros reales con Mercado Pago (Checkout Pro)

> Objetivo: activar los cobros consiste en pegar **dos** credenciales en
> variables de entorno y dar de alta una URL de webhook. **Ni una línea de
> código nueva.** El flujo completo ya está construido y probado.

## Por qué Checkout Pro sobre la Orders API

| Criterio | Checkout Pro (elegido) | Checkout API / Bricks |
|---|---|---|
| Dónde se ingresa la tarjeta | En Mercado Pago | En nuestro sitio |
| Alcance PCI | Fuera de alcance | A nuestro cargo |
| Esfuerzo de integración | Bajo (redirección) | Alto |
| Medios en Perú | Tarjeta, cuenta MP y **Yape** | Igual |

Mercado Pago documenta Checkout Pro sobre la **Orders API**
(`POST /v1/orders`) como el camino vigente para integraciones nuevas; la
Preferences API es la vía anterior. Para Checkout Pro, `processing_mode`
admite **únicamente** el valor `manual` — no significa captura diferida, el
modo de captura es el campo aparte `capture_mode`, que dejamos en su valor
por defecto.

## Cómo funciona el flujo

1. El comprador confirma la compra → `POST /api/checkout/orders/`.
2. El backend crea la orden `PENDING` reteniendo inventario, y crea la order
   en Mercado Pago con `X-Idempotency-Key` atada al código de orden.
3. La respuesta trae `payment.checkout_url`; la tienda redirige allí.
4. El comprador paga en el entorno de Mercado Pago.
5. Mercado Pago lo devuelve a `/checkout/{code}/pay?mp=success|failure|pending`.
6. Esa pantalla llama a `POST /api/checkout/orders/{code}/confirm/`, y el
   backend **vuelve a consultarle la order a Mercado Pago**.
7. En paralelo, Mercado Pago notifica a `/api/webhooks/mercadopago/`. La
   firma se valida por HMAC y el resultado también sale de consultar la order.
8. Quien llegue primero emite las entradas; el otro no hace nada.

**El parámetro `?mp=success` de la URL no decide nada.** El estado de la
venta siempre proviene de `GET /v1/orders/{id}` contra Mercado Pago, así que
un comprador que manipule la URL de retorno no consigue entradas, y un
comprador que cierre el navegador antes de volver las recibe igual.

## Variables de entorno

| Variable | Valor |
|---|---|
| `PAYMENT_GATEWAY` | `mercadopago` |
| `MERCADOPAGO_ACCESS_TOKEN` | Access token **de producción** de la aplicación del organizador |
| `MERCADOPAGO_WEBHOOK_SECRET` | Clave secreta generada al configurar Webhooks |
| `MERCADOPAGO_MODE` | `test` o `production` (etiqueta operativa) |
| `MERCADOPAGO_API_BASE_URL` | `https://api.mercadopago.com` (por defecto) |
| `MERCADOPAGO_PROCESSING_MODE` | `manual` (por defecto; único valor válido hoy) |
| `MERCADOPAGO_CURRENCY` | `PEN` (respaldo si la consulta no repite la moneda) |
| `FRONTEND_STORE_URL` | **Debe ser HTTPS público.** Mercado Pago rechaza `localhost` |

El access token y la clave del webhook son privados: viven solo en el
servidor y nunca se exponen por la API. Checkout Pro con redirección no
necesita clave pública en el navegador.

Los system checks `payments.E001/E002/E003` impiden arrancar con
`PAYMENT_GATEWAY=mercadopago` si falta el token, falta la clave del webhook
(todas las notificaciones se rechazarían) o `FRONTEND_STORE_URL` no es HTTPS.

## En qué cuenta entra el dinero

**El dinero entra en la cuenta de Mercado Pago dueña del access token.** No
existe configuración que lo cambie: la cuenta del token es la que cobra.

Por eso, para cobrar a nombre del organizador, la aplicación de Mercado Pago
debe crearse **en la cuenta del organizador** y es él quien entrega el access
token de producción. El integrador no necesita (ni debe) poner su propia
cuenta en medio.

Si en el futuro la plataforma cobra a varios organizadores desde una sola
aplicación, el camino es **Mercado Pago Connect / marketplace** (OAuth: cada
organizador autoriza la aplicación y se cobra con su token, con
`marketplace_fee` para la comisión). Eso es un proyecto aparte, no un ajuste
de configuración.

## Pasos de activación

1. **El organizador** entra a [Tus integraciones](https://www.mercadopago.com.pe/developers/panel/app)
   con su cuenta y crea una aplicación para **Checkout Pro**.
2. Activa las **credenciales de producción** (rubro, URL del sitio, términos).
3. Copia el **access token de producción** → `MERCADOPAGO_ACCESS_TOKEN`.
4. En la misma aplicación, **Webhooks › Configurar notificaciones**:
   - URL productiva: `https://api.clubrave.pe/api/webhooks/mercadopago/`
   - Evento: **Order (Mercado Pago)**
   - Guardar, y revelar la **clave secreta** → `MERCADOPAGO_WEBHOOK_SECRET`
5. `PAYMENT_GATEWAY=mercadopago`, `MERCADOPAGO_MODE=production`, desplegar.
6. Verificar con `python manage.py mercadopago_smoketest` (ver abajo) y con
   una compra real de monto mínimo, comprobando que llegan las entradas.

## Probar antes de producción

La Orders API **no acepta credenciales `TEST-`**: responde
`invalid_credentials` con el mensaje «Test credentials are not supported, use
test users with production credentials». Para sandbox se usan **usuarios de
prueba**, que son cuentas completas con sus propias credenciales de
producción:

1. Crear un usuario de prueba **vendedor** y otro **comprador** (hecho vía
   el MCP de Mercado Pago, o en Tus integraciones › Usuarios de prueba).
2. Entrar a Mercado Pago con el usuario vendedor, crear una aplicación de
   Checkout Pro en esa cuenta y tomar **su** access token de producción.
3. Usar ese token en `MERCADOPAGO_ACCESS_TOKEN` con `MERCADOPAGO_MODE=test`.
4. Pagar con el usuario comprador o con las tarjetas de prueba del panel.

Para el flujo de compra sin tocar Mercado Pago, `PAYMENT_GATEWAY=fake` sigue
ejercitando el mismo camino de código (retención de inventario, emisión de
entradas, email) con los botones de aprobar/rechazar en `/checkout/{code}/pay`.

### Verificación en un comando

```bash
python manage.py mercadopago_smoketest
```

Crea una order real contra Mercado Pago con el importe mínimo usando la
configuración vigente y muestra el `checkout_url`, el `id` y el estado. Sirve
para confirmar que el token y el payload son válidos antes de abrir la venta.
No toca la base de datos.

## Estados y qué hace cada uno

| `status` de Mercado Pago | Nuestra orden |
|---|---|
| `processed` | `PAID` — se emiten las entradas y se envía el email |
| `created`, `processing`, `action_required` | sigue `PENDING`, inventario retenido |
| `canceled`, `expired`, `failed` | `FAILED` — se libera el inventario |
| `refunded`, `charged_back` | sin cambios (el reembolso se registra en el panel, H09) |

`action_required` incluye `waiting_payment` (Yape o efectivo sin pagar) y
`waiting_capture`: ninguno es un cobro cerrado, así que no se emiten
entradas. La `expiration_time` de la order se fija a `ORDER_HOLD_MINUTES`
para que la order de Mercado Pago venza junto con nuestra retención de
inventario, en lugar del día entero que usa por defecto.

## Seguridad del webhook

La autenticación del webhook **es** la firma. Se valida como lo documenta
Mercado Pago: se extraen `ts` y `v1` del header `x-signature`, se arma el
manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` y se compara un
HMAC-SHA256 hexadecimal con la clave secreta.

Dos detalles que rompen la validación en silencio y están cubiertos por tests:

- El `data.id` va **en minúsculas** (los ids llegan como `ORD01...`).
- Un componente ausente se **omite** del manifest, no queda vacío.

No se valida la antigüedad del `ts`: Mercado Pago reintenta hasta 96 horas y
descartar un reintento legítimo dejaría la venta sin cerrar. La defensa
contra la repetición no es el reloj sino que procesar dos veces es inocuo —
se vuelve a consultar la order y `mark_paid` es idempotente.

Respuestas del endpoint: `200` procesado, `401` firma inválida, `400` importe
discordante, `503` no se pudo consultar la order (Mercado Pago reintenta).

## Reutilización como librería

`apps/payments/mercadopago.py` no importa Django ni los modelos del proyecto:
es HTTP y HMAC sobre tipos planos (`MercadoPagoClient`, `MercadoPagoOrder`).
Es la pieza que se extrae tal cual a `@arialabs/payments`.

El acoplamiento con la ticketera vive en `MercadoPagoGateway`
(`apps/payments/gateways.py`), que implementa el `PaymentGateway` del
proyecto: `create_session`, `verify_browser_return` y `verify_ipn`. Para
llevar esto a otro proyecto se reescribe solo esa clase.
