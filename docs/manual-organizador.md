# Club Rave — manual del organizador

> **Sobre este manual.** Cubre los controles del organizador definidos en
> [`plan-controles-organizador.md`](./plan-controles-organizador.md) — las 16
> historias de usuario (H01–H16) ya están implementadas y verificadas de
> punta a punta. Todo lo que describe este documento funciona hoy.

---

## Crear y publicar un evento (menos de 5 minutos)

1. Entra a **panel.tudominio.pe** con tu email y contraseña.
2. Toca **Nuevo evento**.
3. **Paso 1 — Información**: título, fecha y hora, lugar, edad mínima. Se
   guarda solo con escribir el título; puedes cerrar la app y seguir después.
4. **Paso 2 — Imágenes**: hay tres tipos, y en cada uno puedes subir varias
   (arrastra o toca la cámara) y elegir con la estrella la que se muestra:
   - **Flyer** (obligatorio): la portada del evento en la tienda y al
     compartir el enlace.
   - **Zonas** (opcional): el plano del local con las zonas de cada entrada.
     El comprador lo ve junto a la lista de entradas.
   - **Mapa de ubicación** (opcional): cómo llegar. Se ve en la sección
     *Lugar*, junto a la dirección.

   La primera imagen que subas de cada tipo queda elegida.
5. **Paso 3 — Entradas**: crea cada tipo (nombre, precio, cantidad, máximo
   por compra). Puedes agregar varias — Preventa, General, VIP, etc.
6. **Paso 4 — Publicación**: revisa la lista de requisitos (todos en verde) y
   toca **Publicar evento**. Te da un enlace y un código QR: compártelos en
   redes.

**Para publicar necesitas, como mínimo:** título, fecha futura, lugar, un
flyer, y un tipo de entrada activo con aforo mayor a cero.

## Editar un evento ya publicado

Desde **Eventos**, toca el evento y luego **Tipos de entrada** para agregar,
editar o desactivar entradas. No puedes bajar el aforo por debajo de lo ya
vendido, ni borrar un tipo de entrada con ventas — solo desactivarlo.

### Corregir la información (fecha, lugar, título)

Desde el resumen del evento, **Editar**. Cambia lo que necesites y guarda.

- El **enlace del evento no cambia** aunque cambies el título: lo que ya
  compartiste en redes sigue funcionando.
- Si el evento ya tiene ventas y cambias **fecha, hora o lugar**, al guardar
  te avisa cuántas personas compraron y te ofrece mandarles un comunicado.
  **Nunca se envía solo** — tú decides.
- Un evento cancelado no se puede editar.

### Cambiar el flyer, las zonas o el mapa

Desde el resumen del evento, **Imágenes**. Cada tipo (Flyer, Zonas, Mapa de
ubicación) tiene su propia sección, y en cada una puedes:

- **Subir** nuevas (arrastra o toca la cámara).
- **Elegir la que se muestra**: toca la estrella. En el flyer es la
  *portada*; en zonas y mapa, la *principal*. Elegir una no cambia la de los
  otros tipos.
- **Reordenar**: las flechas mueven cada imagen a izquierda o derecha dentro
  de su tipo.
- **Borrar**: el tacho. Si el evento está publicado no te deja borrar el
  último flyer — sube el nuevo primero. Zonas y mapa sí se pueden quedar
  vacíos. Si borras la elegida, la siguiente de su tipo toma su lugar
  automáticamente.

### Avisar a los que ya compraron

Desde el resumen del evento, **Enviar comunicado**. Escribe asunto y mensaje,
revisa la vista previa, y confirma: te dice a cuántas personas exactas va.

Llega solo a quienes **pagaron** — nunca a órdenes canceladas o vencidas. Las
respuestas van al email de contacto de tu organización. Máximo 3 comunicados
por evento al día.

## Ver cómo va la venta

En el resumen del evento verás, actualizado cada 30 segundos: recaudado
total, entradas vendidas por tipo, y cuántas ya ingresaron. En **Ventas**
puedes buscar una orden por email o código, y exportar todo a CSV para
contabilidad. En **Asistentes** ves quién ya entró y quién no.

### Buscar una venta con alguien esperando

En **Ventas**, el buscador de arriba filtra por **código, email o nombre** a
medida que escribes. Las pestañas de estado (Todas · Pagadas · Pendientes ·
Anuladas) traen el número de cada una.

Toca cualquier fila para abrir el **detalle de la orden**: comprador completo,
qué compró, cuánto pagó, por qué pasarela, si le llegó el email de entradas y
cuándo, y la lista de entradas emitidas con su estado (Válida / Ingresó /
Anulada) y, si ingresó, la hora y quién la validó.

## Escanear en la puerta

Toca **Escanear** en la barra inferior, elige el evento, y apunta la cámara
al QR de cada persona.

- **Verde ("Adelante")**: entrada válida, ya quedó registrado el ingreso.
  Se cierra solo en 2 segundos.
- **Ámbar ("Ya ingresó")**: esta entrada ya se usó — muestra a qué hora y
  quién la validó. Requiere que toques para cerrar: es tu momento de
  resolver la duda con la persona.
- **Rojo ("No válida")**: no es una entrada de este evento, es falsa, o la
  venta fue anulada.

**Si la cámara falla o la pantalla está rota**: toca el ícono de teclado
(arriba a la derecha) y escribe el código de la entrada a mano — el
comprador lo tiene visible debajo de su QR, en bloques de 4 caracteres.

### Deshacer un ingreso escaneado por error

Pasa: se escanea el celular equivocado y la persona correcta llega después y
le sale ámbar.

En la pantalla **ámbar**, toca **Deshacer ingreso**, elige el motivo (escaneo
por error / doble escaneo / otro) y listo: esa entrada vuelve a estar válida y
el siguiente escaneo da verde.

El ingreso anterior no se borra — queda en **Actividad** con la hora y quién
lo hizo. También puedes deshacer desde **Asistentes**, buscando a la persona
por nombre.

## Códigos de invitado (entradas de cortesía)

Desde el resumen del evento, **Invitados**. Necesitas tener al menos un tipo
de entrada creado: cada código da **una** entrada gratis de un tipo concreto,
y ese tipo define la zona. Si quieres una zona solo para invitados, crea un
tipo de entrada (p. ej. "VIP Invitados") y desactívalo: no se vende en la
tienda, pero sí se puede regalar con códigos.

1. Elige el **tipo de entrada / zona**, la **cantidad** (hasta 500 por lote)
   y, si quieres, una **etiqueta** para ubicarlos después ("Prensa", "Lista
   DJ").
2. Toca **Generar**. Los códigos son de 12 caracteres sin letras que se
   confundan (`K7M3-QPXR-2ND4`).
3. Compártelos: **Copiar lote** / **Compartir lote** (en el celular abre
   WhatsApp, Instagram, etc.), **CSV** para una planilla, o uno por uno con los
   íconos de copiar y compartir de cada fila. Cada invitación lleva un enlace
   directo al evento con el código ya cargado.

**Los códigos reservan cupo desde que los generas**: si generas 20 códigos de
VIP, la tienda muestra 20 VIP menos a la venta, aunque nadie los haya usado
todavía. Así un invitado nunca se queda sin lugar porque se agotó la venta.
Si **anulas** un código que no se usó, su cupo vuelve a la venta. No puedes
bajar el aforo de un tipo de entrada por debajo de lo vendido más los códigos
sin usar, ni borrar un tipo de entrada que tenga códigos (desactívalo).

El invitado entra al evento en la tienda, toca **¿Tienes un código?
Ingrésalo aquí**, ve qué entrada le toca, verifica su email y llena sus datos
como en una compra normal, pero **sin pagar**. Recibe su QR por email y en
"Mi cuenta", marcado como **INVITADO**. Cada código sirve **una sola vez**.

En la lista ves el estado de cada código: **Disponible**, **Redimido** (quién,
con qué email, cuándo y su orden) o **Anulado**. En la puerta, el escáner
muestra la etiqueta **INVITADO** y la zona. En **Ventas** la orden aparece con
la marca *Invitado* y S/ 0; **nunca suma al recaudado** ni a "Vendidas" (el
resumen muestra "+N invitados" aparte) y el CSV tiene la columna `invitado`.
Si cancelas el evento, los códigos sin usar se anulan solos.

### Empleados de Seguridad (quienes escanean por ti)

En **Ajustes → Empleados** creas una cuenta por cada persona de la puerta:
nombre, email (es su usuario) y una contraseña inicial de al menos 10
caracteres que le entregas en persona.

- Entra en **el mismo panel** con su email y contraseña, pero **solo ve el
  escáner**: no ve ventas, asistentes, eventos ni ajustes (el servidor le
  rechaza todo lo demás, no solo se esconde en pantalla).
- **Horario**: solo puede escanear desde 3 horas antes del inicio hasta el
  fin del evento (si el evento no tiene hora de fin, se toman 8 horas desde
  el inicio). Antes de eso ve "El escáner se habilita el … a las …". Tú, como
  organizador, no tienes esa restricción. La ventana se ajusta en el
  servidor con `CHECKIN_WINDOW_HOURS_BEFORE_START` y
  `CHECKIN_WINDOW_HOURS_AFTER_END`.
- **Eventos**: por defecto puede escanear todos tus eventos publicados; en
  **Editar** puedes apagar "todos los eventos" y marcar solo algunos.
- No puede **deshacer ingresos**: si hace falta, lo haces tú.
- **Desactivar** (el interruptor) le cierra la sesión al instante y no lo
  deja volver a entrar hasta que lo reactives. **Contraseña** le pone una
  nueva y cierra sus sesiones abiertas. **Eliminar** borra la cuenta.
- Cada entrada que valida un empleado queda en **Actividad** ("Ingreso
  validado por seguridad", con su email), igual que las altas, bajas y
  cambios de empleados.

## Anular ventas y entradas

**Importante: anular no devuelve el dinero.** Este sistema anula el QR, libera
el cupo y avisa al comprador. La devolución la haces tú por fuera (Yape,
transferencia, lo que uses) y después la registras aquí para que tu
contabilidad cuadre.

### Anular una venta completa

Entra a **Ventas → la orden → Anular venta**.

1. Elige el motivo: fraude o contracargo, compra duplicada, pedido del
   comprador, error tuyo, u otro.
2. Decide si **devuelves los cupos a la venta** (viene encendido si el evento
   todavía no pasó). Encendido, esas entradas vuelven a estar disponibles para
   que otro las compre.
3. Confirma.

Qué pasa: todas las entradas válidas de esa orden quedan anuladas y su QR sale
**rojo** en la puerta. El comprador recibe un email con el motivo y tu
contacto, y ve la entrada como "Anulada" en su cuenta.

**Ojo con quien ya entró**: si alguna entrada de esa orden ya ingresó, la
pantalla te lo advierte antes de confirmar. Anular la venta **no saca a nadie
del local** — esa entrada ya se usó y se queda como usada.

Una orden **pendiente** (que nunca llegó a pagarse) también se puede anular:
libera su reserva de inmediato en vez de esperar los 15 minutos.

### Anular una sola entrada

Si de una compra de 6 solo una persona no va, no anules las 6. Desde
**Asistentes** o desde el detalle de la orden, toca esa entrada y **Anular
entrada**: motivo, si devuelves el cupo, confirmar. La orden sigue pagada, con
una entrada menos.

No puedes anular una entrada que **ya ingresó**. Si fue un error de escaneo,
usa **Deshacer ingreso** primero.

### Registrar que ya devolviste el dinero

En una orden anulada, **Marcar como reembolsada**. Puedes anotar la referencia
("Yape 12/03", número de operación, lo que te sirva).

Esto **no mueve dinero**: solo deja constancia. Pasa a estado *Reembolsada*, y
el CSV de ventas trae las columnas de motivo, fecha de anulación y referencia
para tu contador.

### Reenviar las entradas a alguien que dice que no le llegaron

Es el reclamo más común y casi siempre está en spam. En el detalle de la
orden, **Reenviar entradas**. Se manda al mismo email de la compra (no se
puede cambiar el destinatario, por seguridad) y te muestra cuándo se envió la
última vez. Máximo 5 reenvíos por orden al día.

Si aun así insiste, recuérdale que **las entradas siempre están en "Mi cuenta"
de la tienda**, aunque el email se haya perdido.

## Parar la venta sin bajar el evento

¿Se llenó el aforo real del local? ¿Hay un problema que tienes que confirmar?
En el resumen del evento, el interruptor **Pausar venta**.

La página del evento **sigue viva** — el link de tu bio de Instagram no se
rompe — pero muestra "Venta pausada temporalmente" y nadie puede comprar.
Quien esté pagando en ese momento puede terminar dentro de sus 15 minutos.
Reanudar es el mismo interruptor.

Úsalo en vez de despublicar cuando el evento sí va a ocurrir.

## Despublicar un evento

Si publicaste algo por error y **nadie compró todavía**: resumen del evento →
**Zona de riesgo** → **Despublicar**. Vuelve a borrador, sale de la cartelera y
su enlace deja de funcionar. Lo corriges y lo publicas de nuevo.

Si ya hay ventas, el botón está bloqueado a propósito: despublicar dejaría a
gente con entradas de un evento invisible. Usa **Pausar venta** o **Cancelar
evento** según el caso.

## Cancelar un evento

Esto es definitivo: **no se puede deshacer**. Si el evento se recupera después,
se crea uno nuevo.

Desde el resumen del evento, **Zona de riesgo → Cancelar evento**. Antes de
confirmar verás el daño exacto:

- cuántas órdenes pagadas hay,
- cuántas personas distintas están afectadas,
- cuántas entradas se van a anular,
- cuántas **ya ingresaron**,
- y cuánto dinero representa.

Luego: elige el motivo (problema con el local, aforo, cancelación del artista,
clima, otro), agrega lo que quieras explicar, y **escribe el título del evento**
para habilitar el botón. Es a propósito: es la única acción del sistema que te
obliga a escribir.

Al confirmar: todas las entradas quedan anuladas, las órdenes pendientes
liberan su cupo, y cada comprador recibe un email **con tu motivo y el email de
contacto de tu organización**. Los reembolsos se coordinan aparte (no son
automáticos en esta versión) — el email ya le dice a la gente que te escriba.

El evento cancelado no desaparece: sigues pudiendo ver sus ventas, sus
asistentes y su actividad para cerrar cuentas.

## Ver quién hizo qué (Actividad)

Desde el resumen del evento, **Actividad**. Es la bitácora: cada acción de
control con **quién** la hizo, **cuándo** (hora de Lima), **sobre qué** y **con
qué motivo**.

Queda registrado: publicar, despublicar, pausar y reanudar, editar la
información, borrar una imagen, enviar comunicado, cancelar el evento, anular
una orden, marcarla reembolsada, anular una entrada, deshacer un ingreso y
reenviar entradas.

No se puede editar ni borrar. Si alguien de tu equipo anuló algo el viernes,
aquí está.

## Logo, contacto y redes de la tienda (Sitio web)

En **Ajustes → Sitio web** configuras lo que aparece en la barra superior y
el pie de todas las páginas de la tienda. Solo el dueño de la organización
puede cambiarlo.

- **Logo**: se muestra centrado en la barra superior y en el pie. Un PNG con
  fondo transparente se ve mejor (mínimo 64 px por lado, máximo 4 MB). Si no
  subes uno, aparece el texto "Club Rave".
- **Contacto**: teléfono, WhatsApp (con código de país, p. ej. +51), correo y
  dirección.
- **Redes sociales**: Instagram, TikTok, Facebook y YouTube. Pega el enlace
  completo del perfil; el panel te avisa si pegaste el de otra red.
- **Libro de Reclamaciones**: el enlace a tu libro virtual.

Lo que dejes en blanco no se muestra. Los cambios tardan hasta 5 minutos en
verse en la tienda.

## ¿Algo no cuadra?

- **Una venta no aparece**: revisa en **Ventas** filtrando por email; si
  dice "Pendiente" por más de 15 minutos, probablemente el pago no se
  completó y el cupo ya se liberó solo.
- **Alguien dice que pagó pero no tiene su entrada**: pídele que revise
  "Mi cuenta" en la tienda — las entradas siempre están ahí aunque el email
  se haya perdido. Si de verdad no llegó, usa **Reenviar entradas**.
- **A alguien le sale "Anulada" y no sabe por qué**: abre su orden en
  **Ventas** y mira el motivo; está también en **Actividad** con quién la
  anuló.
- **Cualquier otra cosa**: contacta a soporte técnico con el código de la
  orden (empieza con `TK-`) a mano; es lo primero que te van a pedir.
