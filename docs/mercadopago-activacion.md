# Activar cobros reales con Mercado Pago (Checkout Pro)

> **Actualización:** las credenciales ya no van en variables de entorno. Se
> cargan, validan y guardan cifradas desde la consola de administración (Pagos) — ver [`pagos.md`](./pagos.md). Donde esta guía
> dice «variable de entorno», usa el campo equivalente del panel; las
> variables solo sirven para la importación inicial.

> Objetivo: activar los cobros consiste en pegar **dos** credenciales en
> variables de entorno y dar de alta una URL de webhook. **Ni una línea de
> código nueva.** El flujo completo ya está construido y probado.

Para elegir entre pasarelas y ver los cuatro modos de `PAYMENT_GATEWAY`,
empieza por [`pagos.md`](./pagos.md).

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

> **Trampa a evitar.** El integrador normalmente ya tiene su propia cuenta de
> Mercado Pago y su propia aplicación de desarrollo (y es la que suele estar
> autenticada en herramientas como el MCP de Mercado Pago). Usar **ese**
> access token para producción desvía a la cuenta del integrador el dinero de
> los compradores de un tercero. La app del integrador sirve para sandbox;
> para cobrar, el token tiene que venir de la cuenta del organizador.
>
> Verificación rápida antes de abrir la venta: el `user_id` que devuelve la
> respuesta de creación de la order debe ser el del organizador. También lo
> confirma el `mercadopago_smoketest`, que lo imprime.

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
python manage.py mercadopago_smoketest              # S/ 1.00
python manage.py mercadopago_smoketest --amount 5   # otro importe
```

Crea una order real contra Mercado Pago con la configuración vigente y
muestra el `id`, el estado, la moneda, el `checkout_url` y el `user_id` de la
cuenta que cobra. Sirve para confirmar, antes de abrir la venta, que el token
es válido, que el payload se acepta y que el dinero va a la cuenta correcta.
No toca la base de datos.

### Si algo falla

El error trae el mensaje literal de Mercado Pago, que suele decir exactamente
qué pasa:

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| `invalid_credentials: Test credentials are not supported…` | El token es de los de prefijo `TEST-`, que la Orders API no acepta | Usar credenciales de producción (del organizador, o de un usuario de prueba) |
| `401` sin más detalle | Token mal copiado, con espacios o incompleto | Volver a copiarlo del panel |
| `total_amount` / suma de ítems | El total no coincide con la suma de los ítems | No debería pasar: la comisión viaja como una línea más. Reportar |
| «Algo ha salido mal» al volver del checkout | `FRONTEND_STORE_URL` no es HTTPS público, o apunta a `localhost` | Corregir la variable; Mercado Pago rechaza dominios locales |
| La orden queda `PENDING` y nunca cierra | El webhook no llega, o se rechaza por firma | Ver abajo |

**Si el webhook no cierra las órdenes**, en orden:

1. ¿`MERCADOPAGO_WEBHOOK_SECRET` es la clave de **esa misma** aplicación? Una
   clave de otra app da firma inválida (`401` en nuestros logs).
2. ¿La URL de alta es exactamente `https://api.clubrave.pe/api/webhooks/mercadopago/`,
   con la barra final?
3. ¿El evento suscrito es **Order (Mercado Pago)** y no «Pagos»?
4. Usa **Simular** en el panel de Webhooks para ver qué responde nuestro
   servidor. Ojo con interpretarlo:
   - `401` → la firma no valida: la clave secreta no corresponde. Es el
     problema que estás buscando.
   - `503` → la firma **sí** validó, pero el `Data ID` que escribiste no
     existe como order en Mercado Pago. Con un id inventado esto es lo
     esperado y significa que la configuración está bien. Para obtener `200`,
     simula con el `id` real de una order (el que imprime el smoketest).

   La tabla completa de respuestas está en «Seguridad del webhook», abajo.

Mientras tanto la venta no se pierde: la pantalla de pago reconsulta la order
al volver el comprador, así que el pago se acredita por ese camino aunque el
webhook esté mal configurado. Igual hay que arreglarlo, porque es el camino
que cubre al comprador que cierra el navegador.

## Cortar los cobros en caliente

`PAYMENT_GATEWAY=disabled` y reiniciar. La tienda avisa de un problema
técnico temporal y no se crean órdenes ni se retiene inventario.

> **Nunca `fake` en producción**: aprueba cualquier cosa y emitiría entradas
> sin cobrar. Ver [`pagos.md`](./pagos.md).

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

> **Decisión abierta: medios diferidos y `ORDER_HOLD_MINUTES`.** Con el valor
> actual (15 minutos) un comprador que elige Yape o efectivo puede tardar más
> de lo que dura la retención: la orden vence, el cupo se libera y el pago
> llega tarde. El sistema lo maneja sin vender de más — `mark_paid` revalida
> el aforo y, si ya no hay cupo, marca `FAILED` para gestionar reembolso —
> pero el comprador se queda sin entrada habiendo pagado.
>
> Si se espera volumen por medios diferidos, hay dos caminos: subir
> `ORDER_HOLD_MINUTES`, o excluir esos medios de pago en el objeto `config`
> de la order para que el checkout solo ofrezca cobro inmediato. No está
> decidido; depende del evento.

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
