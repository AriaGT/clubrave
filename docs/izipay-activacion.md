# Activar cobros reales con Izipay

> **Actualización:** las credenciales ya no van en variables de entorno. Se
> cargan, validan y guardan cifradas desde la consola de administración (Pagos) — ver [`pagos.md`](./pagos.md). Donde esta guía
> dice «variable de entorno», usa el campo equivalente del panel; las
> variables solo sirven para la importación inicial.

> Objetivo (§8 del plan): activar los cobros reales consiste en pedir cuatro
> credenciales a Izipay, pegarlas en variables de entorno y dar de alta una
> URL. **Ni una línea de código nueva.** Todo el flujo de compra ya está
> construido y probado de punta a punta con `FakeGateway`; este documento
> es exclusivamente el cambio de configuración.

Izipay es la alternativa de **formulario incrustado** (el comprador no sale
del sitio). La otra opción implementada es Mercado Pago Checkout Pro, con
redirección y sin alcance PCI para nosotros → [guía](./mercadopago-activacion.md).
Para comparar las dos y ver los cuatro modos de `PAYMENT_GATEWAY`, empieza
por [`pagos.md`](./pagos.md).

## 0. Antes de pedir nada

Confirma que el código ya funciona con `PAYMENT_GATEWAY=fake` (es el valor
por defecto): crea un evento, compra una entrada, simula el pago aprobado
en `/checkout/{code}/pay`, confirma que llegan las entradas. Si eso no
funciona, el problema no es Izipay — arréglalo primero.

## 1. Qué pedirle a Izipay (checklist de §8.7)

Contacta al comercial de Izipay / Back Office con esta lista exacta:

- [ ] Alta del comercio a nombre del organizador y acceso al Back Office.
- [ ] **Shop ID**, **clave pública**, **password de API REST** y **clave
      HMAC-SHA256** — pide **dos juegos completos**: uno de *pruebas* y
      otro de *producción*. Son cuatro valores por entorno, ocho en total.
- [ ] Alta de la URL de IPN en ambos entornos (Back Office → Configuración →
      Reglas de notificación → "URL de notificación al final del pago"):
      `https://api.<tudominio>/api/webhooks/izipay/`
      Confirma explícitamente que se notifica tanto el pago **aceptado**
      como el **rechazado** — algunos comercios solo activan el aceptado
      por defecto y el `FAILED` nunca llega.
- [ ] Confirma la **versión vigente** del formulario incrustado (Krypton)
      y la URL exacta del script — puede cambiar respecto al valor por
      defecto de este repo.
- [ ] **3-D Secure activo en la tienda de pruebas** para Visa y Mastercard
      (ver "Error 227" en el punto 3). Sin esto, toda tarjeta Visa/Mastercard
      de prueba se rechaza aunque la documentación diga "pago aceptado".
- [ ] Moneda **PEN** habilitada y medios de pago activos.
- [ ] Si el proveedor filtra por IP de origen, entrega las **IP de salida**
      del servidor de producción.
- [ ] Política de reintentos del IPN (cada cuánto, cuántas veces) — nuestra
      idempotencia (`PaymentEvent` único por `order + kind + external_id`)
      ya la soporta sin cambios, pero es bueno saber cuánto tiempo cubre.

## 2. Variables de entorno

Nombres exactos que lee `backend/config/settings/base.py` — cópialos tal
cual, sin adaptarlos:

| Variable | De dónde sale | Notas |
|---|---|---|
| `PAYMENT_GATEWAY` | nuestro | `izipay` para activar; `fake` para volver atrás sin desplegar código |
| `IZIPAY_SHOP_ID` | Back Office | el "Shop ID" del comercio |
| `IZIPAY_REST_PASSWORD` | Back Office → API REST | firma el IPN (canal `kr-hash-key: "password"`) |
| `IZIPAY_HMAC_SHA256_KEY` | Back Office → clave HMAC-SHA256 | firma la respuesta al navegador (canal `kr-hash-key: "sha256_hmac"`) |
| `IZIPAY_PUBLIC_KEY` | Back Office → clave pública | formato `shopId:publickey_xxx`; esta sí llega al navegador |
| `IZIPAY_REST_URL` | por defecto ya apunta al endpoint estándar | cambiar solo si Izipay indica otro dominio |
| `IZIPAY_JS_URL` | documentación del proveedor | la URL exacta del script Krypton vigente (punto 1) |
| `IZIPAY_MODE` | nuestro | `test` o `production` — una etiqueta operativa; el sistema avisa (`payments.W002`) si dice `production` con `DEBUG=True` |

**No confundas `IZIPAY_REST_PASSWORD` con `IZIPAY_HMAC_SHA256_KEY`.** Es el
error clásico de esta integración (§8.4): cada una firma un canal distinto
y no son intercambiables. `apps/payments/gateways.py` ya valida que el
campo `kr-hash-key` del payload coincida con el canal esperado antes de
aceptar cualquier firma, así que una credencial en el lugar equivocado
falla de forma ruidosa (firma inválida) en vez de aprobar pagos por error.

Las credenciales de **producción** se guardan solo en el gestor de secretos
del proveedor de hosting. Nunca en el repositorio, nunca en un `.env`
compartido por chat, nunca en el frontend — salvo `IZIPAY_PUBLIC_KEY`, que
es pública por diseño y sí viaja al navegador dentro de la respuesta de
`POST /api/checkout/orders/`.

## 3. Encender el entorno de pruebas

1. Completa las ocho variables de la tabla con el juego de **pruebas**.
2. `PAYMENT_GATEWAY=izipay`, `IZIPAY_MODE=test`.
3. Despliega (o corre local con `config.settings.dev`).
4. Verifica `python manage.py check` — si algo quedó a medias,
   `payments.W001`/`W002` lo dicen.
5. Corre los nueve escenarios de §8.8 contra el entorno de pruebas del
   proveedor, con las tarjetas de prueba reales del Back Office:

   | # | Escenario | Cómo probarlo |
   |---|---|---|
   | 1 | Pago aprobado | Compra completa con tarjeta de prueba "aprobada"; confirma `PAID`, entradas emitidas, email recibido |
   | 2 | Pago rechazado | Tarjeta de prueba "rechazada"; confirma `FAILED`, inventario liberado, sin entradas |
   | 3 | IPN duplicado | Reenvía el mismo IPN desde el Back Office (o repite el webhook manualmente); confirma que no se duplican entradas |
   | 4 | IPN con firma inválida | Modifica un byte del payload antes de reenviarlo; confirma `400` y que la orden queda intacta |
   | 5 | IPN con importe distinto | Compara con una orden de otro monto; confirma `400` y marca para revisión |
   | 6 | IPN antes que el navegador | Cierra la pestaña de pago apenas envías la tarjeta; confirma que la orden igual queda `PAID` por el IPN |
   | 7 | Navegador cerrado tras pagar | Igual que el anterior: las entradas deben llegar por email sin que el navegador vuelva a abrirse |
   | 8 | Pago después de vencida la orden | Deja pasar los 15 minutos de retención antes de pagar; confirma que se acepta si hay cupo, o `FAILED` + aviso si no |
   | 9 | Pasarela caída al crear la sesión | Apaga temporalmente las credenciales (o usa una IP bloqueada); confirma `503 PAYMENT_UNAVAILABLE` y que no queda una orden fantasma |

   **Tarjetas de prueba.** Lista oficial:
   <https://secure.micuentaweb.pe/doc/es-PE/rest/V4.0/api/kb/test_cards.html>.
   En modo test el formulario muestra además una barra de depuración
   ("Métodos de prueba") que autocompleta la tarjeta al hacer clic. Fecha y
   CVV son libres (p. ej. `12/30` y `123`). Las más útiles:

   | Tarjeta | Resultado esperado |
   |---|---|
   | `4970 1100 0000 1029` (Visa) | aceptado, 3DS2 sin interacción |
   | `4970 1100 0000 1003` (Visa) | aceptado, 3DS2 con challenge |
   | `4970 1000 0000 0063` (Visa) | rechazado, falla la autenticación 3DS |
   | `4970 1000 0000 0071` (Visa) | rechazado, fondos insuficientes |
   | `36000000000008` (Diners) | aceptado, sin 3DS de Visa/Mastercard |

   **Error 227 / `PSP_727` "Unable to authenticate".** Si *todas* las
   Visa/Mastercard se rechazan con este código, incluidas las de "pago
   aceptado", y Diners sí pasa, el problema no está en el código: la tienda
   de pruebas exige 3DS y su autenticación 3DS no está habilitada. Lo
   resuelve Izipay; pásales el UUID de una transacción rechazada (Back
   Office → Gestión → Transacciones de TEST).

   **En local el IPN no llega** (Izipay no alcanza `localhost`). La orden
   se confirma por el retorno del navegador: `KR.onSubmit` entrega
   `{rawClientAnswer, hash, hashKey}`, que la pantalla reenvía a
   `POST /api/checkout/orders/{code}/confirm/`. Un pago rechazado no
   dispara `onSubmit`, así que en local la orden queda `PENDING` hasta
   vencer; el `FAILED` llega solo por IPN.

   Los cinco primeros ya están automatizados contra `FakeGateway`
   (`backend/tests/test_payments.py`) y corren en cada commit; en este paso
   se repiten contra el proveedor real porque son los que dependen de su
   comportamiento efectivo, no del nuestro.

## 4. Pasar a producción

1. Repite el paso 3 con el juego de credenciales de **producción** y
   `IZIPAY_MODE=production` en el gestor de secretos del hosting — nunca
   en un archivo del repositorio.
2. Confirma que el servidor corre con `DJANGO_SETTINGS_MODULE=config.settings.prod`
   (`DEBUG=False`). Si `IZIPAY_MODE=production` y `DEBUG=True` a la vez,
   `python manage.py check` lo bloquea con una advertencia (`payments.W002`).
3. Da de alta la URL de IPN de producción en el Back Office (punto 1) y
   confirma con una compra real de bajo monto antes de anunciar el evento.
4. Revisa que las alertas de observabilidad (§13/§14 del plan) cubran: IPN
   con firma inválida, órdenes `PAID` sin entradas emitidas, y `5xx` en
   `/api/checkout/`.

## 5. Volver atrás sin drama

Si algo falla en producción y hay que cortar los cobros de inmediato:
`PAYMENT_GATEWAY=disabled` y reiniciar. El sitio sigue en pie y la tienda
avisa de un problema técnico temporal, pero no se crean órdenes ni se retiene
inventario — `get_gateway()` falla cerrado antes de tocar el cupo.

> **Nunca pongas `fake` en producción.** `FakeGateway` aprueba cualquier
> cosa: la pantalla de pago muestra el botón «Simular pago aprobado» y
> emitiría entradas reales sin cobrar un sol. Es el modo de desarrollo, no
> un modo de emergencia. El interruptor de emergencia es `disabled`.
