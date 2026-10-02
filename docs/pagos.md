# Pagos: cómo elegir y configurar los medios de pago

Punto de entrada de todo lo relacionado con cobros. Los medios de pago se
configuran **desde el panel**, sin tocar variables de entorno ni desplegar:
**Ajustes › Configuración avanzada › Medios de pago** (solo el dueño de la
organización).

## Los tres modos de cobro

| Modo | Para qué sirve | ¿Cobra de verdad? |
|---|---|---|
| Pasarelas reales | **Producción.** Una o varias pasarelas activas a la vez | Sí |
| Simulador | **Solo desarrollo y pruebas.** Botones de aprobar/rechazar. Desactiva las reales | No |
| Deshabilitado | **Interruptor de emergencia.** Bloquea las compras. Desactiva todo lo demás | No |

En «Pasarelas reales» se puede activar más de una. Si hay una sola, la
pantalla de pago la abre directamente, como siempre. Si hay varias, el
comprador elige en la pantalla de pago (Tarjeta / Mercado Pago) y puede
**cambiar de medio** si el primero le falla, sin perder la orden ni la
reserva de entradas.

### El simulador nunca va a producción

`FakeGateway` aprueba cualquier cosa: en producción emitiría entradas reales
sin cobrar. Existe para que todo el flujo de compra (retención de
inventario, emisión de entradas, email, QR) se pueda ejercitar y testear sin
credenciales de nadie. Fuera del modo «Simulador», el backend se niega a
usarlo aunque una orden vieja lo pida (falla cerrado).

### Deshabilitado es el interruptor de emergencia

Si hay que cortar los cobros en caliente: elegir «Deshabilitado» en el panel
y guardar. El checkout responde `503 PAYMENT_DISABLED` **antes** de retener
inventario y la tienda muestra un aviso de problema técnico temporal. No hace
falta reiniciar nada. Los códigos de invitado (gratis) siguen funcionando.

## Credenciales: cifradas y de solo escritura

- Al activar una pasarela, el panel pide sus llaves (Izipay: Shop ID, clave
  pública, password REST y clave HMAC; Mercado Pago: access token y clave
  del webhook).
- **Al guardar se validan con el proveedor**: Izipay con `Charge/SDKTest`
  (llamada autenticada que no crea ninguna operación, comprueba Shop ID y
  password); Mercado Pago consultando la cuenta del access token. No hay
  reglas de formato propias sobre las llaves (los prefijos los define el
  proveedor): si algo está mal, el proveedor lo rechaza y se muestra su
  mensaje. Si una falla, no se guarda nada. La clave pública y la clave HMAC
  de Izipay no se pueden comprobar sin un pago real: pruébalas con una
  compra de S/ 1.
- Se guardan **cifradas** (Fernet) con `PAYMENT_CREDENTIALS_KEY`, la única
  variable de pagos que queda en el entorno del servidor. Es obligatoria en
  producción (system check `payments.E010`). **No la cambies una vez en uso**:
  las credenciales guardadas quedarían ilegibles y habría que volver a
  cargarlas.
- Después de guardar, **los secretos no se vuelven a mostrar**: el panel solo
  ve los últimos 4 caracteres (los valores públicos, como la clave pública de
  Izipay, se muestran completos). Para cambiarlos se usa «Reemplazar».
- Cambiar entre pruebas y producción exige volver a ingresar todas las llaves.
- Cada cambio queda en la bitácora (`PAYMENT_SETTINGS_UPDATED`) sin valores.
- Cada pasarela muestra en el panel su **URL de notificaciones** para darla
  de alta en el Back Office / Tus integraciones del proveedor.

### Migración desde las variables de entorno

La primera vez que el sistema carga la configuración de pagos (base vacía),
importa una sola vez `PAYMENT_GATEWAY` y las llaves `IZIPAY_*` /
`MERCADOPAGO_*` del entorno, cifradas. Así un despliegue que ya cobraba sigue
cobrando sin pasar por el panel. Requisito: `PAYMENT_CREDENTIALS_KEY` debe
estar declarada **antes** de ese primer arranque. Después, esas variables
pueden borrarse del entorno: ya no se leen.

## Cuál usar

**Mercado Pago (Checkout Pro)**: el comprador paga en el entorno de Mercado
Pago, así que la tarjeta nunca pasa por nuestro servidor (**fuera del alcance
PCI**). En Perú cubre tarjeta, cuenta Mercado Pago y **Yape** → [guía](./mercadopago-activacion.md).

**Izipay**: formulario incrustado (el comprador no sale del sitio). Requiere
que Izipay active 3-D Secure en la afiliación → [guía](./izipay-activacion.md).

Pueden estar activos los dos a la vez.

## Lo que comparten todos (y no depende de la pasarela)

- **El estado de la orden no lo decide el navegador.** El resultado sale de
  un canal servidor-a-servidor firmado (IPN/webhook) o de una respuesta
  firmada que el backend verifica; en Mercado Pago además se reconsulta la
  order.
- **Cada orden usa la pasarela con la que se abrió su sesión** (`Order.gateway`).
  Un rechazo de un medio que el comprador dejó no anula el intento con el
  otro; una aprobación de cualquier medio sí paga la orden (el dinero entró).
  Si llegan dos aprobaciones, se registra como posible doble cobro para
  reembolsar a mano.
- **Reintentos de Izipay.** Un rechazo con `orderCycle: OPEN` no es final (el
  formulario deja probar otra tarjeta): la orden sigue pendiente.
- **Idempotencia.** `PaymentEvent` es único por `order + kind + external_id`
  y `mark_paid` corta en seco si la orden ya está `PAID`.
- **Validación de importe.** Si lo informado no coincide con el total, no se
  emite nada (`400`).
- **Retención de inventario** con vencimiento (`ORDER_HOLD_MINUTES`).
- **Bitácora.** Todo queda en `PaymentEvent`, con el payload crudo. Nunca se
  expone por la API.

## Agregar una pasarela nueva (PayPal, PagoEfectivo…)

1. Una clase en `backend/apps/payments/gateways.py` que implemente
   `PaymentGateway` y reciba sus credenciales en el constructor.
2. Una entrada en `PROVIDERS` (`backend/apps/payments/providers.py`): campos
   de credenciales (cuáles son secretos), función de validación contra el
   proveedor y URL de su webhook.
3. Su webhook en `backend/apps/payments/views.py`.

El panel y la pantalla de pago la toman del registro sin más cambios.

## Antes de tocar cualquier pasarela

Confirma que el flujo funciona en modo «Simulador»: crea un evento, compra
una entrada, simula el pago aprobado en `/checkout/{code}/pay` y verifica que
llegan las entradas por email. Si eso no funciona, el problema no es la
pasarela — arréglalo primero.

## Reutilización en otros proyectos

El objetivo es extraer esto a `@arialabs/payments`. El núcleo de Mercado Pago
(`backend/apps/payments/mercadopago.py`) no importa Django ni los modelos del
proyecto: es HTTP y HMAC sobre tipos planos. El acoplamiento con la ticketera
vive aparte, en `MercadoPagoGateway`. Ver la sección final de la
[guía de Mercado Pago](./mercadopago-activacion.md#reutilización-como-librería).
