# Pagos: cómo elegir y configurar la pasarela

Punto de entrada de todo lo relacionado con cobros. La pasarela es un detalle
reemplazable detrás de una interfaz (`PaymentGateway` en
`backend/apps/payments/gateways.py`): se cambia con **una variable de
entorno**, sin desplegar código distinto.

## Los cuatro modos de `PAYMENT_GATEWAY`

| Valor | Para qué sirve | ¿Cobra de verdad? |
|---|---|---|
| `mercadopago` | **Producción.** Checkout Pro con redirección → [guía](./mercadopago-activacion.md) | Sí |
| `izipay` | Alternativa: formulario incrustado → [guía](./izipay-activacion.md) | Sí |
| `fake` | **Solo desarrollo y tests.** Botones de aprobar/rechazar | No |
| `disabled` | **Interruptor de emergencia.** Bloquea las compras | No |

### `fake` nunca va a producción

`FakeGateway` aprueba cualquier cosa. En producción, la pantalla de pago
mostraría el botón «Simular pago aprobado» y **emitiría entradas reales sin
cobrar**. Es el modo de desarrollo; existe para que todo el flujo de compra
(retención de inventario, emisión de entradas, email, QR) se pueda ejercitar
y testear sin credenciales de nadie.

### `disabled` es el interruptor de emergencia

Si hay que cortar los cobros en caliente: `PAYMENT_GATEWAY=disabled` y
reiniciar. `get_gateway()` falla cerrado **antes** de retener inventario, el
checkout responde `503 PAYMENT_DISABLED` y la tienda muestra un aviso de
problema técnico temporal en lugar del botón de compra. No queda ninguna
orden fantasma ocupando cupo.

## Cuál usar

**Mercado Pago (Checkout Pro)** es el camino implementado y verificado con
tests, y el recomendado para empezar a cobrar:

- El comprador paga en el entorno de Mercado Pago, así que la tarjeta nunca
  pasa por nuestro servidor: **quedamos fuera del alcance PCI**.
- En Perú cubre tarjeta de crédito/débito, cuenta Mercado Pago y **Yape**.
- Activarlo son **dos credenciales** y dar de alta una URL de webhook.

**Izipay** usa formulario incrustado (el comprador no sale del sitio) y pide
cuatro credenciales por entorno más coordinación con el Back Office del
proveedor. Tiene sentido si el organizador ya tiene comercio con Izipay o
quiere la tarjeta dentro de su propia página.

Los dos conviven en el código: cambiar de uno a otro es cambiar la variable.

## Lo que comparten los dos (y no depende de la pasarela)

Esto está construido una vez y vale para cualquier proveedor:

- **El estado de la orden no lo decide el navegador.** El resultado del cobro
  siempre sale de un canal servidor-a-servidor: el webhook/IPN firmado, y en
  Mercado Pago además una reconsulta directa de la order. Que el comprador
  vuelva (o no) a la pantalla de éxito es irrelevante.
- **Idempotencia.** `PaymentEvent` es único por `order + kind + external_id`
  y `mark_paid` corta en seco si la orden ya está `PAID`: una notificación
  repetida no duplica entradas.
- **Validación de importe.** Si lo que informa la pasarela no coincide
  exactamente con el total de la orden, no se emite nada (`400`).
- **Retención de inventario** con vencimiento (`ORDER_HOLD_MINUTES`), y
  liberación automática cuando el pago falla o la orden vence.
- **Bitácora.** Todo lo que ocurre con un pago queda en `PaymentEvent`, con
  el payload crudo, para soporte y conciliación. Nunca se expone por la API.

## Antes de tocar cualquier pasarela

Confirma que el flujo funciona con `PAYMENT_GATEWAY=fake` (el valor por
defecto): crea un evento, compra una entrada, simula el pago aprobado en
`/checkout/{code}/pay` y verifica que llegan las entradas por email. Si eso
no funciona, el problema no es la pasarela — arréglalo primero.

## Reutilización en otros proyectos

El objetivo es extraer esto a `@arialabs/payments`. El núcleo de Mercado Pago
(`backend/apps/payments/mercadopago.py`) no importa Django ni los modelos del
proyecto: es HTTP y HMAC sobre tipos planos. El acoplamiento con la ticketera
vive aparte, en `MercadoPagoGateway`. Ver la sección final de la
[guía de Mercado Pago](./mercadopago-activacion.md#reutilización-como-librería).
