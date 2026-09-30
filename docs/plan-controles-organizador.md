# Plan de controles del organizador

Estado: **propuesta**, no implementado. Este documento define el trabajo; el
código todavía no existe salvo donde se indique explícitamente
("ya existe en el backend").

El portal del organizador sabe **crear** y **observar**. No sabe **corregir**.
Todo lo que se crea en el wizard es, en la práctica, inmutable desde la
interfaz: no hay forma de cambiar un flyer, mover una fecha, parar una venta,
anular una compra fraudulenta ni deshacer un escaneo equivocado. Para un
producto que mueve dinero y se usa a las 11 de la noche en la puerta de un
local, eso no es un MVP presentable: es una demo.

Este plan agrega esa capa de control.

---

## 1. Diagnóstico: qué hay hoy

| Flujo | Backend | UI del organizador | Veredicto |
|---|---|---|---|
| Crear evento (wizard 4 pasos) | ✅ | ✅ | Completo |
| Publicar evento | ✅ `POST /events/{id}/publish/` | ✅ solo dentro del wizard | Inalcanzable desde el detalle |
| Editar información del evento | ✅ `PATCH /events/{id}/` | ⚠️ solo escribiendo a mano `?event=<id>` | Sin punto de entrada |
| Subir / borrar / marcar portada | ✅ | ⚠️ solo dentro del wizard | Sin ruta propia |
| Reordenar imágenes | ✅ campo `position` | ❌ `onMove` es un no-op | No funciona |
| Despublicar | ✅ `POST /events/{id}/unpublish/` | ❌ | Endpoint huérfano |
| Cancelar evento | ✅ `POST /events/{id}/cancel/` | ❌ | Endpoint huérfano |
| Borrar evento | ✅ `DELETE /events/{id}/` | ❌ | Endpoint huérfano |
| Pausar la venta sin bajar el evento | ❌ | ❌ | No existe |
| Tipos de entrada (crear/editar/desactivar) | ✅ | ✅ | Completo |
| Ver detalle de una orden | ❌ | ❌ | No existe |
| Anular una venta | ❌ | ❌ | No existe |
| Marcar una orden como reembolsada | ⚠️ el estado `REFUNDED` existe, nada lo escribe | ❌ | No existe |
| Reenviar entradas por email | ⚠️ comando de consola `resend_pending_ticket_emails` | ❌ | No hay botón |
| Buscar una venta | ⚠️ `?status=` | ❌ sin buscador | Solo scroll |
| Anular una entrada suelta | ⚠️ `Ticket.Status.VOID` existe, solo lo escribe `cancel_event` | ❌ | No existe |
| Deshacer un ingreso escaneado por error | ❌ | ❌ | No existe |
| Comunicado a compradores | ❌ | ❌ | No existe |
| Bitácora de quién hizo qué | ❌ | ❌ | No existe |

El patrón es claro: **el backend tiene más control del que la interfaz
expone**, y donde falta control falta en los dos lados a la vez — todo lo que
toca dinero ya vendido.

## 2. Los defectos reales que hay que arreglar de paso

No son "nice to have": son bugs que se ven en una demo.

**D1 — Cancelar un evento no devuelve el inventario retenido.**
[`cancellation.py:26`](../backend/apps/orders/services/cancellation.py) pasa las
órdenes `PENDING` a `CANCELLED` con un `.update()` que **no** decrementa
`quantity_reserved`, cosa que `release_expired_orders` sí hace. El contador
queda inflado para siempre: `available` miente en las métricas y en el CSV.

**D2 — Al cancelar, el comprador pierde su entrada de la vista sin explicación.**
`MyTicketsView` filtra `order__status=PAID`. Tras la cancelación la orden queda
`CANCELLED`, así que las entradas desaparecen de *Activas*, *Usadas* y
*Vencidas* a la vez. El comprador abre "Mi cuenta" y no hay nada — ni la
entrada, ni el aviso. `TicketCard` ya tiene un estado `void` ("Anulada", rojo)
que hoy es inalcanzable.

**D3 — El detalle del evento es un callejón sin salida.**
[`events/[id]/page.tsx`](../apps/organizer/app/(app)/events/[id]/page.tsx) ofrece
cuatro botones: tipos de entrada, ventas, asistentes, escanear. Un evento en
`DRAFT` abierto desde la lista **no se puede publicar ni editar desde ahí**.

**D4 — El reordenamiento de imágenes es un comentario.**
`onMove={() => { /* llega en una iteración posterior */ }}` en
[`ImagesStep.tsx`](../apps/organizer/features/wizard/ImagesStep.tsx). Las flechas
se pintan y no hacen nada.

**D5 — Se puede borrar la última imagen de un evento publicado.**
No hay guarda en `OrganizerEventImageViewSet.destroy`. El evento queda en vivo
incumpliendo sus propios requisitos de publicación.

**D6 — `unpublish` no mira si hay ventas.**
Despublicar un evento con órdenes pagadas mata el enlace que ya circuló por
redes y deja a los compradores con entradas de un evento invisible.

**D7 — `cancel_event` no exige motivo, no es idempotente y el email no dice a quién escribir.**
El correo actual dice "contacta al organizador" sin dar el contacto, aunque
`Organization.contact_email` existe.

---

## 3. Principios de diseño de los controles

Cinco reglas que aplican a todo lo que sigue. Existen para que "dar control"
no se convierta en "dar cuerda para ahorcarse".

1. **Toda acción destructiva muestra su impacto antes de ejecutarse.**
   No "¿Seguro?", sino "Vas a anular **47 entradas** de **31 compradores** por
   **S/ 2 350**. 12 personas ya ingresaron."
2. **Toda acción destructiva exige un motivo.** Lista de motivos frecuentes +
   texto libre. El motivo viaja al email del comprador y a la bitácora.
3. **Lo irreversible se escribe, no se toca.** Cancelar un evento pide escribir
   el título del evento. Anular una venta, no (es reversible en la práctica:
   se puede volver a vender el cupo).
4. **Nada desaparece en silencio.** Si se anula algo, el comprador lo ve con su
   motivo en "Mi cuenta", y queda en la bitácora con autor y hora.
5. **El dinero no se mueve solo.** Este MVP **no** llama a la pasarela para
   devolver plata (§16 del plan: reembolsos son fase 2). Anular una venta
   libera el cupo, anula el QR y avisa; la devolución se coordina fuera y se
   **registra** aquí. La interfaz dice esto con todas sus letras, no lo insinúa.

---

## 4. Historias de usuario

Formato: situación real primero, porque el criterio de aceptación sin la
situación es una lista de deseos.

### Épica A — Control del evento en vivo

---

**H01 · Corregir la información de un evento ya publicado**

> *Publiqué "Sesión 02" con el local equivocado: puse el del mes pasado.
> Ya hay 12 entradas vendidas y no pienso cancelar por un typo.*

**Como** organizador, **quiero** editar título, descripción, fecha, hora, lugar
y edad mínima de un evento publicado, **para** corregir errores sin cancelar.

Criterios de aceptación:
- Desde el detalle del evento hay un botón **Editar** que abre el formulario
  con los datos actuales precargados.
- Guardar actualiza el evento y la tienda refleja el cambio en el siguiente
  ISR/refresco.
- Si el evento tiene órdenes pagadas y cambio **fecha, hora o lugar**, al
  guardar aparece un aviso: *"12 personas ya compraron. ¿Les avisamos?"* con
  acceso directo a H02. Nunca se envía solo.
- El `slug` **no** cambia al editar el título: el enlace que ya circuló sigue
  funcionando. (Hoy ya es así — `slug` es `read_only` — pero ahora es una
  garantía documentada, no un accidente.)
- No se puede poner una fecha pasada en un evento publicado.

---

**H02 · Avisar a los compradores de un cambio**

> *Movimos la hora de 10 pm a 11 pm. Necesito que los 31 que ya compraron se
> enteren hoy, no en la puerta.*

**Como** organizador, **quiero** enviar un mensaje por email a todos los que
compraron un evento, **para** comunicar cambios sin exportar el CSV y usar
Gmail a mano.

Criterios de aceptación:
- Desde el detalle del evento: **Enviar comunicado**.
- Formulario con asunto (máx. 120) y mensaje (máx. 2 000). Vista previa antes
  de enviar y confirmación con el número exacto de destinatarios.
- Destinatarios: el `buyer_email` de las órdenes **pagadas** de ese evento,
  deduplicado. Nunca las canceladas ni las vencidas.
- El email sale con el nombre del evento en el asunto y el
  `contact_email` de la organización como respuesta.
- Límite: 3 comunicados por evento por día (evita el botón de spam accidental).
- Queda en la bitácora: quién, cuándo, a cuántos, y el texto enviado.

---

**H03 · Cambiar los flyers después de publicar**

> *El diseñador me mandó la versión buena del flyer el día después de publicar.
> Quiero que la portada sea esa.*

**Como** organizador, **quiero** subir, borrar, reordenar y cambiar la portada
de las imágenes de un evento ya publicado, **para** que la tienda muestre el
arte correcto.

Criterios de aceptación:
- Ruta propia `/events/{id}/images`, alcanzable desde el detalle del evento.
- Subir, borrar y marcar portada funcionan igual que en el wizard.
- **Las flechas de reordenar funcionan de verdad** (arregla D4): persisten
  `position` y el orden se ve reflejado en la tienda.
- **No se puede borrar la última imagen de un evento publicado** (arregla D5):
  el botón explica *"Un evento publicado necesita al menos una imagen. Sube la
  nueva antes de borrar esta."*
- Si borro la imagen que era portada y quedan otras, la primera pasa a ser
  portada automáticamente — nunca queda un evento sin portada.

---

**H04 · Pausar la venta sin bajar el evento**

> *Se llenó el aforo real del local, no el que puse en el sistema. Necesito
> frenar la venta 20 minutos mientras confirmo con el local, pero sin que se
> caiga el link que está en la bio de Instagram.*

**Como** organizador, **quiero** pausar y reanudar la venta de un evento con un
interruptor, **para** frenar compras sin despublicar ni cancelar.

Criterios de aceptación:
- Interruptor **Pausar venta** en el detalle del evento. Un toque, reversible,
  sin motivo obligatorio.
- Con la venta pausada: la página del evento en la tienda **sigue visible** con
  toda su información y un aviso claro *"Venta pausada temporalmente"*; los
  botones de compra están desactivados.
- Un intento de checkout sobre un evento pausado devuelve `SALES_PAUSED` (409).
- Las órdenes `PENDING` en curso **no** se cancelan: pueden terminar de pagar
  dentro de sus 15 minutos.
- Reanudar es igual de inmediato.

---

**H05 · Despublicar un evento que se publicó por error**

> *Publiqué el evento de noviembre con los precios de prueba. Nadie compró
> todavía. Quiero bajarlo, arreglarlo y volver a publicarlo.*

**Como** organizador, **quiero** devolver un evento a borrador, **para**
corregirlo sin que nadie lo vea.

Criterios de aceptación:
- Botón **Despublicar** disponible solo si el evento **no tiene órdenes
  pagadas** (arregla D6).
- Si las tiene, el botón está deshabilitado y explica: *"Este evento ya tiene
  ventas. Usa **Pausar venta** si quieres frenar las compras, o **Cancelar
  evento** si no se va a realizar."*
- Al despublicar, el evento sale de la cartelera y su URL devuelve 404 en la
  tienda.
- Vuelve a publicarse con el flujo normal (revisa los requisitos de nuevo).

---

**H06 · Cancelar el evento sabiendo exactamente qué se rompe**

> *Se cayó el DJ internacional. El evento no va. Tengo que anular 180 entradas
> y avisar a todo el mundo antes de que empiecen a llegar al local.*

**Como** organizador, **quiero** cancelar un evento viendo el impacto exacto
antes de confirmar, **para** no equivocarme de evento y poder explicar el
motivo a los compradores.

Criterios de aceptación:
- Pantalla dedicada (no un diálogo pequeño): `/events/{id}/cancel`.
- Muestra el impacto calculado en el servidor, antes de ejecutar nada:
  órdenes pagadas, entradas a anular, entradas que **ya ingresaron**, monto
  bruto vendido, y personas distintas afectadas.
- Exige seleccionar un motivo (*Problema con el local · Aforo insuficiente ·
  Cancelación del artista · Clima · Otro*) y permite texto libre.
- Exige **escribir el título del evento** para habilitar el botón.
- Al confirmar: evento a `CANCELLED`, órdenes pagadas a `CANCELLED`, entradas
  a `VOID`, órdenes `PENDING` a `CANCELLED` **con el inventario devuelto**
  (arregla D1), email a cada comprador **con el motivo y el contacto de la
  organización** (arregla D7).
- El email dice explícitamente que el reembolso se coordina con el organizador
  y da el `contact_email` de la organización.
- Cancelar un evento ya cancelado devuelve un error claro, no reenvía emails
  (arregla D7).
- Un evento cancelado es terminal: no se puede editar, publicar ni vender.
  Sigue siendo consultable (ventas, asistentes, bitácora) para cerrar cuentas.

### Épica B — Control del dinero

---

**H07 · Ver el detalle de una venta**

> *Un chico me escribe por WhatsApp: "compré 4 entradas pero solo me llegaron
> 3". Necesito abrir su orden y ver qué se emitió.*

**Como** organizador, **quiero** abrir una orden y ver todo, **para** resolver
un reclamo sin entrar al Django admin.

Criterios de aceptación:
- `/events/{id}/sales/{code}` muestra: código, estado, fecha, comprador
  (nombre, email, teléfono, documento), líneas de la orden, total, pasarela y
  referencia, si se envió el email de entradas y cuándo.
- Lista de entradas emitidas con su código en bloques de 4, su estado
  (Válida / Ingresó / Anulada) y, si ingresó, la hora y quién la validó.
- Desde aquí se llega a todas las acciones de H08, H09, H10 y H12.

---

**H08 · Anular una venta**

> *Detecté una compra con tarjeta robada: cuatro entradas VIP, el banco ya me
> avisó del contracargo. Esos cuatro QR no pueden entrar, y quiero esos cuatro
> cupos de vuelta a la venta.*

**Como** organizador, **quiero** anular una orden pagada, **para** invalidar sus
entradas y, si quiero, devolver los cupos al inventario.

Criterios de aceptación:
- Acción **Anular venta** en el detalle de la orden, con motivo obligatorio
  (*Fraude / contracargo · Compra duplicada · Pedido del comprador · Error del
  organizador · Otro*).
- Interruptor **Devolver los cupos a la venta** (encendido por defecto si el
  evento no ha terminado). Apagado, los cupos quedan consumidos.
- Todas las entradas `VALID` de esa orden pasan a `VOID`.
- Las entradas que **ya ingresaron** (`CHECKED_IN`) **no** se tocan, y la
  pantalla lo advierte antes de confirmar: *"2 de estas 4 entradas ya
  ingresaron. Anular la venta no las saca del local."*
- La orden pasa a `CANCELLED` y queda registrada con su motivo y su autor.
- El comprador recibe un email con el motivo y el contacto de la organización.
- Una orden `PENDING` también se puede anular: pasa a `CANCELLED` y libera su
  retención de inventario inmediatamente.
- El escáner rechaza en rojo cualquier QR de una orden anulada. *(El backend
  ya lo hace: `check_in` rechaza si `order.status != PAID`.)*

---

**H09 · Registrar que ya devolví el dinero**

> *Al chico de la compra duplicada le devolví los S/ 120 por Yape. Quiero que
> el sistema lo diga, porque en dos semanas no me voy a acordar y el CSV es lo
> que le doy al contador.*

**Como** organizador, **quiero** marcar una orden anulada como reembolsada,
**para** que la contabilidad cuadre.

Criterios de aceptación:
- En una orden `CANCELLED`, acción **Marcar como reembolsada** con un campo
  opcional de referencia (número de operación, "Yape 12/03", etc.).
- La orden pasa a `REFUNDED`. Es terminal.
- La interfaz deja claro, con todas sus letras, que **esto no devuelve dinero**:
  es un registro de algo que ocurrió fuera de la plataforma.
- El CSV de ventas incorpora columnas `motivo_anulacion`, `anulada_en` y
  `referencia_reembolso`.

---

**H10 · Reenviar las entradas**

> *"No me llegó nada." Es el mensaje número uno que recibo. Casi siempre está
> en spam, pero el reenvío lo resuelve en 10 segundos.*

**Como** organizador, **quiero** reenviar el email de entradas de una orden
pagada, **para** resolver el reclamo más frecuente sin soporte técnico.

Criterios de aceptación:
- Botón **Reenviar entradas** en el detalle de una orden `PAID`.
- Reenvía al `buyer_email` de la orden. **No** permite cambiar el destinatario
  (sería un vector de fuga de entradas ajenas).
- Muestra cuándo se envió por última vez.
- Límite: 5 reenvíos por orden por día.
- Deshabilitado en órdenes que no son `PAID`, con el motivo a la vista.

---

**H11 · Encontrar una venta en segundos**

> *Tengo a la persona delante mío en la puerta diciendo que pagó. Tengo su
> email. No voy a scrollear 300 órdenes.*

**Como** organizador, **quiero** buscar órdenes por email, código o nombre y
filtrar por estado, **para** encontrar una venta con una persona esperando.

Criterios de aceptación:
- Buscador en `/events/{id}/sales` que filtra por `code`, `buyer_email` y
  `buyer_name` (coincidencia parcial, sin distinguir mayúsculas).
- Filtro por estado con contadores: Todas · Pagadas · Pendientes · Anuladas.
- Resultados en menos de un segundo con 1 000 órdenes (índice ya existente
  sobre `(event, status)`; se añade el de búsqueda).

### Épica C — Control en la puerta

---

**H12 · Anular una entrada suelta**

> *De una compra de 6, una persona no va a venir y me pidió devolución solo de
> la suya. No voy a anular las 6.*

**Como** organizador, **quiero** anular una entrada individual, **para** actuar
a nivel de entrada y no solo de orden completa.

Criterios de aceptación:
- Acción **Anular entrada** en la lista de asistentes y en el detalle de la
  orden, con motivo obligatorio.
- Solo sobre entradas `VALID`. Una entrada `CHECKED_IN` no se puede anular: la
  interfaz dice *"Esta persona ya ingresó"* y ofrece H13 si fue un error.
- Opción de devolver ese cupo a la venta.
- La orden **no** cambia de estado: sigue `PAID`, con una entrada menos.
- El comprador lo ve en "Mi cuenta" con el motivo (H16).

---

**H13 · Deshacer un ingreso escaneado por error**

> *El chico de la puerta escaneó el QR del celular del amigo que todavía estaba
> en la cola. Ahora esa persona llega y le sale ámbar "ya ingresó". Son las 12
> de la noche y hay 40 personas detrás.*

**Como** organizador, **quiero** deshacer un check-in, **para** resolver el
problema en la puerta en vez de discutirlo.

Criterios de aceptación:
- Desde la pantalla ámbar del escáner (*"Ya ingresó"*) hay un botón
  **Deshacer ingreso**, y también desde la lista de asistentes.
- Pide motivo (*Escaneo por error · Doble escaneo · Otro*), en un toque.
- La entrada vuelve a `VALID` con `checked_in_at` y `checked_in_by` en blanco.
- El check-in anterior (hora y quién) queda guardado en la bitácora: el dato
  no se pierde, solo deja de bloquear la puerta.
- Deshacer requiere una sesión de organizador. *(Nota: hoy solo los `OWNER`
  obtienen token de organización —`org_tokens_for_user` exige `OWNER`—, así
  que la distinción con `STAFF` no aplica todavía; el permiso queda preparado
  para cuando exista el login de personal de puerta.)*

### Épica D — Rastro y confianza

---

**H14 · Ver qué se tocó, quién y cuándo**

> *Alguien de mi equipo anuló tres ventas el viernes. No sé quién ni por qué.*

**Como** organizador, **quiero** una bitácora de las acciones de control,
**para** poder auditar y explicar lo que pasó.

Criterios de aceptación:
- `/events/{id}/activity` muestra, en orden cronológico inverso: acción, autor
  (email), fecha y hora en `America/Lima`, objetivo (código de orden o entrada,
  o el evento) y motivo.
- Se registran: publicar, despublicar, pausar/reanudar, editar información,
  cancelar evento, anular orden, marcar reembolsada, anular entrada, deshacer
  ingreso, reenviar entradas, enviar comunicado, borrar imagen.
- La bitácora es **solo lectura**: no se edita ni se borra desde la interfaz.
- El registro guarda una copia del identificador legible del objetivo
  (`TK-XXXX`, título del evento), para que siga teniendo sentido aunque el
  objeto se borre después.

---

**H15 · Ninguna acción destructiva ocurre por un toque accidental**

**Como** organizador, **quiero** que toda acción irreversible pida confirmación
proporcional al daño, **para** no arruinar un evento con el pulgar.

Criterios de aceptación:
- Tres niveles: *toque simple* (pausar venta, reanudar), *confirmar + motivo*
  (anular orden, anular entrada, deshacer ingreso, despublicar), *escribir el
  título + motivo* (cancelar evento, borrar evento).
- Los botones destructivos usan la variante `danger` y viven en una zona
  visualmente separada ("Zona de riesgo") al final del detalle del evento,
  nunca junto a los botones de navegación.
- Ningún diálogo destructivo se cierra tocando fuera: hay que decidir.

---

**H16 · El comprador entiende qué pasó con su entrada**

> *Si le anulo la entrada a alguien y abre la app y no ve nada, me va a escribir
> igual. Y con razón.*

**Como** comprador, **quiero** ver mis entradas anuladas con el motivo, **para**
saber qué pasó sin tener que preguntar.

Criterios de aceptación (arregla D2):
- "Mi cuenta → Entradas" gana una pestaña **Anuladas** con las entradas `VOID`
  y las de órdenes `CANCELLED`/`REFUNDED`.
- Cada una se muestra con el estado `void` de `TicketCard` (ya existe: badge
  rojo "Anulada"), el motivo y el contacto de la organización.
- El QR de una entrada anulada **no** se renderiza.
- En "Mis compras", una orden cancelada muestra su motivo y, si aplica, que
  fue marcada como reembolsada.

---

## 5. Modelo de datos

### 5.1 Nuevo: `AuditLog` (`apps/common`)

```python
class AuditLog(models.Model):
    """Rastro de acciones de control. Solo escritura desde los servicios;
    nunca se edita ni se borra desde la API."""

    class Action(models.TextChoices):
        EVENT_PUBLISHED    = "EVENT_PUBLISHED"
        EVENT_UNPUBLISHED  = "EVENT_UNPUBLISHED"
        EVENT_UPDATED      = "EVENT_UPDATED"
        EVENT_CANCELLED    = "EVENT_CANCELLED"
        EVENT_SALES_PAUSED = "EVENT_SALES_PAUSED"
        EVENT_SALES_RESUMED= "EVENT_SALES_RESUMED"
        EVENT_ANNOUNCED    = "EVENT_ANNOUNCED"
        IMAGE_DELETED      = "IMAGE_DELETED"
        ORDER_VOIDED       = "ORDER_VOIDED"
        ORDER_REFUND_MARKED= "ORDER_REFUND_MARKED"
        TICKETS_RESENT     = "TICKETS_RESENT"
        TICKET_VOIDED      = "TICKET_VOIDED"
        CHECKIN_UNDONE     = "CHECKIN_UNDONE"

    id            = UUIDField(pk)
    created_at    = DateTimeField(auto_now_add=True, db_index=True)
    organization  = FK(Organization, on_delete=CASCADE, related_name="audit_logs")
    actor         = FK(User, on_delete=SET_NULL, null=True)
    actor_email   = CharField(150)          # fotografía: sobrevive al borrado
    action        = CharField(32, choices=Action.choices)
    target_type   = CharField(16)           # "event" | "order" | "ticket" | "image"
    target_id     = UUIDField(null=True)
    target_label  = CharField(150)          # "TK-7F3A", "Sesión 02" — fotografía
    event         = FK(Event, on_delete=SET_NULL, null=True, related_name="audit_logs")
    reason        = TextField(blank=True)
    metadata      = JSONField(default=dict) # impacto: {"tickets_voided": 47, ...}

    class Meta:
        ordering = ["-created_at"]
        indexes = [Index(["organization", "-created_at"]),
                   Index(["event", "-created_at"]),
                   Index(["target_type", "target_id"])]
```

`event` se denormaliza aparte de `target_*` para que la bitácora de un evento
sea una sola consulta, incluya o no acciones sobre órdenes y entradas suyas.

Helper en `apps/common/audit.py`:

```python
def record(*, actor, organization, action, target, reason="", event=None, **metadata) -> AuditLog
```

### 5.2 Campos nuevos en modelos existentes

| Modelo | Campo | Tipo | Para qué |
|---|---|---|---|
| `Event` | `sales_paused_at` | `DateTimeField(null=True)` | H04. `None` = venta abierta |
| `Event` | `cancelled_at` | `DateTimeField(null=True)` | H06 |
| `Event` | `cancellation_reason` | `CharField(200, blank=True)` | H06, va al email |
| `Order` | `voided_at` | `DateTimeField(null=True)` | H08 |
| `Order` | `void_reason` | `CharField(200, blank=True)` | H08, CSV, vista del comprador |
| `Order` | `refund_reference` | `CharField(120, blank=True)` | H09 |
| `Ticket` | `voided_at` | `DateTimeField(null=True)` | H12 |
| `Ticket` | `void_reason` | `CharField(200, blank=True)` | H12, H16 |

El motivo se denormaliza además de estar en `AuditLog` porque lo consumen el
email al comprador, el CSV de contabilidad y la vista de "Mi cuenta" — tres
lecturas calientes que no deben hacer *join* con la bitácora.

Una sola migración por app: `events/0003_control_fields`,
`orders/0002_void_fields`, `common/0001_auditlog`.

### 5.3 Códigos de error nuevos (`apps/common/errors.py`)

| Código | HTTP | Cuándo |
|---|---|---|
| `SALES_PAUSED` | 409 | Checkout sobre un evento con la venta pausada |
| `EVENT_CANCELLED` | 409 | Cualquier acción de edición sobre un evento cancelado |
| `EVENT_HAS_SALES` | 409 | Despublicar o borrar un evento con órdenes pagadas |
| `ORDER_NOT_VOIDABLE` | 409 | Anular una orden ya anulada, vencida o fallida |
| `TICKET_NOT_VOIDABLE` | 409 | Anular una entrada ya usada o ya anulada |
| `CHECKIN_NOT_UNDOABLE` | 409 | Deshacer un ingreso en una entrada que no está `CHECKED_IN` |
| `LAST_IMAGE` | 409 | Borrar la última imagen de un evento publicado |

---

## 6. Contrato de la API

Todos bajo `IsOrganizer` y acotados por `organization_id` del JWT (regla A6).

| Método y ruta | Cuerpo | Historia | Estado |
|---|---|---|---|
| `PATCH /api/org/events/{id}/` | campos del evento | H01 | existe, se endurece |
| `GET /api/org/events/{id}/change-impact/` | — | H01 | nuevo |
| `POST /api/org/events/{id}/announce/` | `{subject, message}` | H02 | nuevo |
| `POST /api/org/events/{id}/images/reorder/` | `{order: [uuid, …]}` | H03 | nuevo |
| `DELETE /api/org/events/{pk}/images/{id}/` | — | H03 | existe, se endurece |
| `POST /api/org/events/{id}/pause-sales/` | `{paused: bool}` | H04 | nuevo |
| `POST /api/org/events/{id}/unpublish/` | — | H05 | existe, se endurece |
| `GET /api/org/events/{id}/cancel-preview/` | — | H06 | nuevo |
| `POST /api/org/events/{id}/cancel/` | `{reason_code, reason, confirm_title}` | H06 | existe, se reescribe |
| `GET /api/org/events/{pk}/orders/{code}/` | — | H07 | nuevo |
| `GET /api/org/events/{pk}/orders/?q=` | — | H11 | existe, gana `q` |
| `POST /api/org/orders/{code}/void/` | `{reason_code, reason, restock}` | H08 | nuevo |
| `POST /api/org/orders/{code}/mark-refunded/` | `{refund_reference}` | H09 | nuevo |
| `POST /api/org/orders/{code}/resend-tickets/` | — | H10 | nuevo |
| `POST /api/org/tickets/{code}/void/` | `{reason_code, reason, restock}` | H12 | nuevo |
| `POST /api/org/tickets/{code}/undo-checkin/` | `{reason_code, reason}` | H13 | nuevo |
| `GET /api/org/events/{pk}/audit/` | — | H14 | nuevo |
| `GET /api/org/audit/` | — | H14 | nuevo |
| `GET /api/me/tickets/?status=void` | — | H16 | existe, gana el filtro |

Límites de tasa nuevos (`DEFAULT_THROTTLE_RATES`): `announce` 3/día por evento,
`resend` 5/día por orden.

---

## 7. Plan de implementación por fases

Cada fase deja el sistema en un estado coherente y demostrable. Las
estimaciones asumen una persona.

### Fase 0 — Cimientos · ~1,5 días

Sin esto, cada fase siguiente reinventa la confirmación y el registro.

**Backend**
- `apps/common/models.py`: `AuditLog` + migración `common/0001_auditlog`.
- `apps/common/audit.py`: `record(...)`.
- `apps/common/errors.py`: los 7 códigos nuevos de §5.3.
- `apps/common/serializers.py`: `AuditLogSerializer`, `ReasonSerializer`
  (`reason_code` de una lista cerrada + `reason` libre, máx. 200).
- Endpoints `GET /api/org/audit/` y `GET /api/org/events/{pk}/audit/`
  (paginados, solo lectura).

**Frontend — `packages/ui`**
- `base/AlertDialog.tsx`: diálogo modal que **no** se cierra al tocar fuera.
  Usa `@radix-ui/react-dialog`, que ya es dependencia — sin dependencias
  nuevas.
- `composition/ConfirmDialog.tsx`: props `{title, impact?, reasons?,
  confirmPhrase?, destructive, onConfirm}`. Implementa los tres niveles de
  H15 en un solo componente.
- `domain/ActivityItem.tsx`: una línea de bitácora.
- `domain/DangerZone.tsx`: tarjeta contenedora de acciones destructivas.
- Exportar todo en `src/index.ts`. Añadir los cuatro al catálogo `/_ds`.

**Frontend — `apps/organizer`**
- `features/audit/hooks.ts`: `useEventAudit`, `useOrgAudit`.
- Ruta `/events/[id]/activity`.

**Pruebas**: `tests/test_audit.py` — el registro guarda la fotografía del
objetivo y sobrevive al borrado del objeto; aislamiento entre organizaciones.

**Listo cuando**: la bitácora se ve vacía en un evento real y
`ConfirmDialog` está en `/_ds` con los tres niveles.

---

### Fase 1 — Control del evento · ~3 días · H01, H03, H05, H06 + D1, D3, D4, D5, D6, D7

**Backend**
- `events/serializers.py`: `EventOrganizerSerializer.validate()` bloquea toda
  edición si `status == CANCELLED`; impide fecha pasada en publicados.
- `events/views.py`:
  - `unpublish`: rechaza con `EVENT_HAS_SALES` si hay órdenes `PAID` (D6).
  - `cancel`: exige `reason_code` + `confirm_title`, delega en el servicio.
  - `cancel_preview` (`@action detail=True, methods=["get"]`): devuelve el
    impacto sin tocar nada.
  - `change_impact`: cuántas órdenes pagadas y compradores distintos hay, para
    el aviso de H01.
  - `OrganizerEventImageViewSet.destroy`: `LAST_IMAGE` si es la última de un
    evento publicado (D5); si era la portada, promueve la siguiente.
  - `images/reorder/`: reescribe `position` en bloque dentro de una
    transacción, validando que los ids sean exactamente los del evento.
  - `perform_update` del evento: `audit.record(EVENT_UPDATED, metadata={campos
    cambiados})`.
- `orders/services/cancellation.py` **reescrito**:
  - `preview_event_cancellation(event) -> dict` — una consulta agregada, sin
    bucles: `{paid_orders, distinct_buyers, tickets_to_void,
    tickets_already_checked_in, gross}`.
  - `cancel_event(*, event, actor, reason_code, reason)`:
    idempotente (`EVENT_CANCELLED` si ya lo está), **libera
    `quantity_reserved` de las órdenes `PENDING`** (D1), escribe
    `cancelled_at`/`cancellation_reason`, registra en la bitácora, y envía el
    email con motivo y `organization.contact_email` (D7). Los emails salen en
    `transaction.on_commit`, nunca dentro de la transacción.
  - Plantilla nueva `orders/templates/orders/event_cancelled_email.html`.

**Frontend — `apps/organizer`**
- `events/[id]/page.tsx` **reorganizado** (D3): cabecera con estado y fecha →
  métricas → accesos (entradas, ventas, asistentes, escanear, **imágenes**,
  **actividad**) → botón **Publicar** si es `DRAFT` → **Zona de riesgo**
  (Despublicar · Cancelar evento).
- `events/[id]/edit/page.tsx`: reutiliza `EventInfoStep`; al guardar, si
  `change-impact` reporta compradores y cambió fecha/hora/lugar, ofrece H02.
- `events/[id]/images/page.tsx`: reutiliza `ImagesStep` con `onMove` **real**
  (D4) contra `images/reorder/`.
- `events/[id]/cancel/page.tsx`: impacto + motivo + escribir el título.
- `features/events/hooks.ts`: `useUnpublishEvent`, `useCancelEvent`,
  `useCancelPreview`, `useReorderImages`, `useChangeImpact`.

**Pruebas**: `tests/test_event_control.py` — cancelación devuelve inventario
retenido (D1); cancelar dos veces falla sin reenviar emails; despublicar con
ventas falla; borrar la última imagen de un publicado falla; el reorden
persiste; un evento cancelado rechaza `PATCH`.

**Listo cuando**: un evento publicado con ventas se puede editar, se le cambia
la portada, y se cancela desde la interfaz viendo su impacto — verificado en
el navegador con el escáner rechazando en rojo un QR de ese evento.

---

### Fase 2 — Control del dinero · ~3 días · H07, H08, H09, H10, H11

**Backend**
- `orders/services/void.py` (nuevo):
  - `void_order(*, order, actor, reason_code, reason, restock: bool)`:
    `select_for_update`; `PAID` → `CANCELLED`, `PENDING` → `CANCELLED`
    liberando la retención; entradas `VALID` → `VOID`; **las `CHECKED_IN` se
    respetan** y se devuelven en el resultado; si `restock`, decrementa
    `quantity_sold` (las `CheckConstraint` existentes son la red final);
    email al comprador; bitácora.
  - `mark_refunded(*, order, actor, refund_reference)`: solo desde
    `CANCELLED`; valida contra `Order.VALID_TRANSITIONS`.
  - `void_ticket(*, ticket, actor, reason_code, reason, restock)`:
    solo desde `VALID`; la orden **no** cambia de estado.
- `orders/services/tickets_email.py`: `resend_tickets_email(order, actor)`
  con bitácora y límite de tasa.
- `orders/views.py`: `OrganizerOrderDetailView` (por `code`),
  `OrderVoidView`, `OrderMarkRefundedView`, `OrderResendTicketsView`,
  `TicketVoidView`; `q` en `OrganizerEventOrdersView`
  (`Q(code__icontains) | Q(buyer_email__icontains) | Q(buyer_name__icontains)`);
  tres columnas nuevas en el CSV.
- Índice `Index(fields=["buyer_email"])` en `Order`.

**Frontend — `apps/organizer`**
- `events/[id]/sales/page.tsx`: buscador con *debounce*, pestañas de estado
  con contadores, filas que enlazan al detalle.
- `events/[id]/sales/[code]/page.tsx`: detalle completo + acciones.
- `features/orders/hooks.ts`: `useOrder`, `useVoidOrder`, `useMarkRefunded`,
  `useResendTickets`, `useVoidTicket`.

**Pruebas**: `tests/test_order_void.py` — anular con `restock` devuelve el
cupo y con él apagado no; las `CHECKED_IN` sobreviven; anular dos veces falla;
`mark_refunded` solo desde `CANCELLED`; el escáner rechaza un QR de orden
anulada; aislamiento entre organizaciones en los cinco endpoints nuevos.

**Listo cuando**: una compra real hecha en la tienda se anula desde el panel,
el cupo vuelve a aparecer disponible en la tienda, y su QR sale rojo en el
escáner.

---

### Fase 3 — Control en la puerta · ~1,5 días · H12, H13

**Backend**
- `checkin/services.py`: `undo_check_in(*, ticket, actor, reason_code, reason)`
  — `CHECKED_IN` → `VALID`, limpia `checked_in_at`/`checked_in_by` guardando
  ambos en `metadata` de la bitácora; `CHECKIN_NOT_UNDOABLE` si no aplica.
- `checkin/views.py`: `POST /api/org/tickets/{code}/undo-checkin/`.
- `checkin/serializers.py`: el resultado de `lookup` incluye el `id` de la
  entrada para poder actuar sobre ella.

**Frontend — `apps/organizer`**
- `ScanResult` (`packages/ui`): la variante ámbar gana un botón secundario
  **Deshacer ingreso** (opcional vía prop, para no cambiar la firma en la
  tienda).
- `app/(app)/scan/[eventId]/page.tsx`: conecta ese botón con
  `ConfirmDialog` de motivo en un toque.
- `events/[id]/attendees/page.tsx`: buscador por nombre y acciones **Anular
  entrada** / **Deshacer ingreso** por fila.

**Pruebas**: `tests/test_checkin_undo.py` — deshacer devuelve a `VALID` y
permite un segundo escaneo verde; el check-in anterior queda en la bitácora;
deshacer sobre `VALID` o `VOID` falla; aislamiento entre organizaciones.

**Listo cuando**: escanear dos veces el mismo QR da ámbar, se deshace desde
ahí mismo, y el tercer escaneo vuelve a dar verde — verificado en el navegador.

---

### Fase 4 — Cerrar el círculo · ~2 días · H02, H04, H16

**Backend**
- `Event.sales_paused_at` + `pause-sales/`; `create_order` rechaza con
  `SALES_PAUSED`; `EventPublicDetailSerializer` expone `sales_paused`.
- `events/services/announce.py`: `announce(*, event, actor, subject, message)`
  — destinatarios deduplicados de órdenes `PAID`, envío en `on_commit`,
  bitácora con el texto, límite de tasa.
- `MyTicketsView`: `?status=void` devuelve entradas `VOID` **y** entradas de
  órdenes `CANCELLED`/`REFUNDED`, con `void_reason` y el contacto de la
  organización en el serializador (D2).

**Frontend**
- `apps/organizer`: interruptor de pausa en el detalle;
  `events/[id]/announce/page.tsx` con vista previa y confirmación.
- `apps/store`: pestaña **Anuladas** en "Mi cuenta → Entradas" usando el
  estado `void` de `TicketCard` (ya existe), sin renderizar el QR; aviso de
  "Venta pausada" y botones desactivados en la página del evento; motivo de
  cancelación visible en "Mis compras".

**Pruebas**: `tests/test_sales_pause.py`, `tests/test_announce.py`,
`tests/test_customer_void_visibility.py`.

**Listo cuando**: anular una venta desde el panel se ve, con su motivo, en la
cuenta del comprador en la tienda.

---

## 8. Matriz de qué se puede hacer en cada estado

| Acción | `DRAFT` | `PUBLISHED` sin ventas | `PUBLISHED` con ventas | `CANCELLED` | Terminado |
|---|---|---|---|---|---|
| Editar información | ✅ | ✅ | ✅ con aviso | ❌ | ✅ |
| Gestionar imágenes | ✅ | ✅ | ✅ | ❌ | ✅ |
| Publicar | ✅ | — | — | ❌ | ❌ |
| Despublicar | — | ✅ | ❌ `EVENT_HAS_SALES` | ❌ | ❌ |
| Pausar venta | ❌ | ✅ | ✅ | ❌ | ❌ |
| Enviar comunicado | ❌ | ❌ | ✅ | ✅ | ✅ |
| Cancelar evento | ✅ | ✅ | ✅ | ❌ | ✅ |
| Borrar evento | ✅ | ✅ | ❌ | ❌ | ❌ |
| Anular orden | — | — | ✅ | — | ✅ |
| Anular entrada | — | — | ✅ | — | ✅ |
| Deshacer ingreso | — | — | ✅ | — | ✅ |

---

## 9. Lo que este plan deja fuera, a propósito

- **Reembolso automático por la pasarela.** §16 del plan lo sitúa en fase 2 y
  requiere credenciales reales de Izipay, que hoy no existen
  ([`docs/izipay-activacion.md`](./izipay-activacion.md)). Anular registra y
  comunica; la plata se mueve fuera. La interfaz no finge lo contrario.
- **Roles diferenciados para las acciones destructivas.** Hoy
  `org_tokens_for_user` solo emite token a los `OWNER`, así que no hay a quién
  restringir. `Membership.Role.STAFF` ya existe: cuando haya login de personal
  de puerta, el permiso `IsOrganizationOwner` se engancha en los mismos cuatro
  endpoints de §6 marcados como irreversibles.
- **Editar el aforo total de un tipo de entrada hacia abajo por debajo de lo
  vendido.** Ya está bloqueado en `TicketTypeSerializer` y sigue así.
- **Transferir una entrada a otra persona.** §16, fase 2.
- **Deshacer una cancelación de evento.** Es terminal por diseño: los emails ya
  salieron. Si el evento se recupera, se crea uno nuevo — y eso es lo honesto
  frente a quien ya recibió "se canceló".

---

## 10. Verificación manual antes de presentar

Recorrido completo, en el navegador, con el backend y las dos apps corriendo:

1. Crear evento → publicar → comprar 2 entradas en la tienda.
2. Editar el lugar del evento → aparece el aviso de compradores → enviar
   comunicado → el correo llega (consola en dev).
3. Cambiar la portada y reordenar los flyers → la tienda muestra el nuevo
   orden.
4. Pausar la venta → la tienda muestra el aviso y no deja comprar → reanudar.
5. Escanear una entrada → verde. Escanearla otra vez → ámbar → **deshacer
   ingreso** → escanear otra vez → verde.
6. Anular la venta con devolución de cupo → el cupo reaparece en la tienda →
   el QR sale rojo en el escáner → en "Mi cuenta" del comprador la entrada
   aparece en **Anuladas** con el motivo.
7. Marcar la orden como reembolsada → el CSV trae motivo, fecha y referencia.
8. Cancelar el evento → la pantalla muestra el impacto exacto → confirmar
   escribiendo el título → los compradores reciben el email con motivo y
   contacto.
9. Abrir la bitácora: los nueve pasos anteriores están ahí, con autor y hora.
