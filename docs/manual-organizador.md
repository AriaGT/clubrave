# Club Rave â€” manual del organizador

> **Sobre este manual.** Cubre los controles del organizador definidos en
> [`plan-controles-organizador.md`](./plan-controles-organizador.md) â€” las 16
> historias de usuario (H01â€“H16) ya estÃ¡n implementadas y verificadas de
> punta a punta. Todo lo que describe este documento funciona hoy.

---

## Crear y publicar un evento (menos de 5 minutos)

1. Entra a **panel.tudominio.pe** con tu email y contraseÃ±a.
2. Toca **Nuevo evento**.
3. **Paso 1 â€” InformaciÃ³n**: tÃ­tulo, fecha y hora, lugar, edad mÃ­nima. Se
   guarda solo con escribir el tÃ­tulo; puedes cerrar la app y seguir despuÃ©s.
4. **Paso 2 â€” Flyers**: sube una o varias fotos (arrastra o toca la cÃ¡mara).
   La primera que subas es la portada; puedes cambiarla con la estrella.
5. **Paso 3 â€” Entradas**: crea cada tipo (nombre, precio, cantidad, mÃ¡ximo
   por compra). Puedes agregar varias â€” Preventa, General, VIP, etc.
6. **Paso 4 â€” PublicaciÃ³n**: revisa la lista de requisitos (todos en verde) y
   toca **Publicar evento**. Te da un enlace y un cÃ³digo QR: compÃ¡rtelos en
   redes.

**Para publicar necesitas, como mÃ­nimo:** tÃ­tulo, fecha futura, lugar, una
imagen, y un tipo de entrada activo con aforo mayor a cero.

## Editar un evento ya publicado

Desde **Eventos**, toca el evento y luego **Tipos de entrada** para agregar,
editar o desactivar entradas. No puedes bajar el aforo por debajo de lo ya
vendido, ni borrar un tipo de entrada con ventas â€” solo desactivarlo.

### Corregir la informaciÃ³n (fecha, lugar, tÃ­tulo)

Desde el resumen del evento, **Editar**. Cambia lo que necesites y guarda.

- El **enlace del evento no cambia** aunque cambies el tÃ­tulo: lo que ya
  compartiste en redes sigue funcionando.
- Si el evento ya tiene ventas y cambias **fecha, hora o lugar**, al guardar
  te avisa cuÃ¡ntas personas compraron y te ofrece mandarles un comunicado.
  **Nunca se envÃ­a solo** â€” tÃº decides.
- Un evento cancelado no se puede editar.

### Cambiar los flyers

Desde el resumen del evento, **ImÃ¡genes**. AhÃ­ puedes:

- **Subir** nuevas (arrastra o toca la cÃ¡mara).
- **Cambiar la portada**: toca la estrella de la imagen que quieras primera.
- **Reordenar**: las flechas mueven cada imagen a izquierda o derecha, y ese
  orden es el que ve el comprador.
- **Borrar**: el tacho. Si el evento estÃ¡ publicado no te deja borrar la
  Ãºltima imagen â€” sube la nueva primero. Si borras la que era portada, la
  siguiente toma su lugar automÃ¡ticamente.

### Avisar a los que ya compraron

Desde el resumen del evento, **Enviar comunicado**. Escribe asunto y mensaje,
revisa la vista previa, y confirma: te dice a cuÃ¡ntas personas exactas va.

Llega solo a quienes **pagaron** â€” nunca a Ã³rdenes canceladas o vencidas. Las
respuestas van al email de contacto de tu organizaciÃ³n. MÃ¡ximo 3 comunicados
por evento al dÃ­a.

## Ver cÃ³mo va la venta

En el resumen del evento verÃ¡s, actualizado cada 30 segundos: recaudado
total, entradas vendidas por tipo, y cuÃ¡ntas ya ingresaron. En **Ventas**
puedes buscar una orden por email o cÃ³digo, y exportar todo a CSV para
contabilidad. En **Asistentes** ves quiÃ©n ya entrÃ³ y quiÃ©n no.

### Buscar una venta con alguien esperando

En **Ventas**, el buscador de arriba filtra por **cÃ³digo, email o nombre** a
medida que escribes. Las pestaÃ±as de estado (Todas Â· Pagadas Â· Pendientes Â·
Anuladas) traen el nÃºmero de cada una.

Toca cualquier fila para abrir el **detalle de la orden**: comprador completo,
quÃ© comprÃ³, cuÃ¡nto pagÃ³, por quÃ© pasarela, si le llegÃ³ el email de entradas y
cuÃ¡ndo, y la lista de entradas emitidas con su estado (VÃ¡lida / IngresÃ³ /
Anulada) y, si ingresÃ³, la hora y quiÃ©n la validÃ³.

## Escanear en la puerta

Toca **Escanear** en la barra inferior, elige el evento, y apunta la cÃ¡mara
al QR de cada persona.

- **Verde ("Adelante")**: entrada vÃ¡lida, ya quedÃ³ registrado el ingreso.
  Se cierra solo en 2 segundos.
- **Ãmbar ("Ya ingresÃ³")**: esta entrada ya se usÃ³ â€” muestra a quÃ© hora y
  quiÃ©n la validÃ³. Requiere que toques para cerrar: es tu momento de
  resolver la duda con la persona.
- **Rojo ("No vÃ¡lida")**: no es una entrada de este evento, es falsa, o la
  venta fue anulada.

**Si la cÃ¡mara falla o la pantalla estÃ¡ rota**: toca el Ã­cono de teclado
(arriba a la derecha) y escribe el cÃ³digo de la entrada a mano â€” el
comprador lo tiene visible debajo de su QR, en bloques de 4 caracteres.

### Deshacer un ingreso escaneado por error

Pasa: se escanea el celular equivocado y la persona correcta llega despuÃ©s y
le sale Ã¡mbar.

En la pantalla **Ã¡mbar**, toca **Deshacer ingreso**, elige el motivo (escaneo
por error / doble escaneo / otro) y listo: esa entrada vuelve a estar vÃ¡lida y
el siguiente escaneo da verde.

El ingreso anterior no se borra â€” queda en **Actividad** con la hora y quiÃ©n
lo hizo. TambiÃ©n puedes deshacer desde **Asistentes**, buscando a la persona
por nombre.

## Anular ventas y entradas

**Importante: anular no devuelve el dinero.** Este sistema anula el QR, libera
el cupo y avisa al comprador. La devoluciÃ³n la haces tÃº por fuera (Yape,
transferencia, lo que uses) y despuÃ©s la registras aquÃ­ para que tu
contabilidad cuadre.

### Anular una venta completa

Entra a **Ventas â†’ la orden â†’ Anular venta**.

1. Elige el motivo: fraude o contracargo, compra duplicada, pedido del
   comprador, error tuyo, u otro.
2. Decide si **devuelves los cupos a la venta** (viene encendido si el evento
   todavÃ­a no pasÃ³). Encendido, esas entradas vuelven a estar disponibles para
   que otro las compre.
3. Confirma.

QuÃ© pasa: todas las entradas vÃ¡lidas de esa orden quedan anuladas y su QR sale
**rojo** en la puerta. El comprador recibe un email con el motivo y tu
contacto, y ve la entrada como "Anulada" en su cuenta.

**Ojo con quien ya entrÃ³**: si alguna entrada de esa orden ya ingresÃ³, la
pantalla te lo advierte antes de confirmar. Anular la venta **no saca a nadie
del local** â€” esa entrada ya se usÃ³ y se queda como usada.

Una orden **pendiente** (que nunca llegÃ³ a pagarse) tambiÃ©n se puede anular:
libera su reserva de inmediato en vez de esperar los 15 minutos.

### Anular una sola entrada

Si de una compra de 6 solo una persona no va, no anules las 6. Desde
**Asistentes** o desde el detalle de la orden, toca esa entrada y **Anular
entrada**: motivo, si devuelves el cupo, confirmar. La orden sigue pagada, con
una entrada menos.

No puedes anular una entrada que **ya ingresÃ³**. Si fue un error de escaneo,
usa **Deshacer ingreso** primero.

### Registrar que ya devolviste el dinero

En una orden anulada, **Marcar como reembolsada**. Puedes anotar la referencia
("Yape 12/03", nÃºmero de operaciÃ³n, lo que te sirva).

Esto **no mueve dinero**: solo deja constancia. Pasa a estado *Reembolsada*, y
el CSV de ventas trae las columnas de motivo, fecha de anulaciÃ³n y referencia
para tu contador.

### Reenviar las entradas a alguien que dice que no le llegaron

Es el reclamo mÃ¡s comÃºn y casi siempre estÃ¡ en spam. En el detalle de la
orden, **Reenviar entradas**. Se manda al mismo email de la compra (no se
puede cambiar el destinatario, por seguridad) y te muestra cuÃ¡ndo se enviÃ³ la
Ãºltima vez. MÃ¡ximo 5 reenvÃ­os por orden al dÃ­a.

Si aun asÃ­ insiste, recuÃ©rdale que **las entradas siempre estÃ¡n en "Mi cuenta"
de la tienda**, aunque el email se haya perdido.

## Parar la venta sin bajar el evento

Â¿Se llenÃ³ el aforo real del local? Â¿Hay un problema que tienes que confirmar?
En el resumen del evento, el interruptor **Pausar venta**.

La pÃ¡gina del evento **sigue viva** â€” el link de tu bio de Instagram no se
rompe â€” pero muestra "Venta pausada temporalmente" y nadie puede comprar.
Quien estÃ© pagando en ese momento puede terminar dentro de sus 15 minutos.
Reanudar es el mismo interruptor.

Ãšsalo en vez de despublicar cuando el evento sÃ­ va a ocurrir.

## Despublicar un evento

Si publicaste algo por error y **nadie comprÃ³ todavÃ­a**: resumen del evento â†’
**Zona de riesgo** â†’ **Despublicar**. Vuelve a borrador, sale de la cartelera y
su enlace deja de funcionar. Lo corriges y lo publicas de nuevo.

Si ya hay ventas, el botÃ³n estÃ¡ bloqueado a propÃ³sito: despublicar dejarÃ­a a
gente con entradas de un evento invisible. Usa **Pausar venta** o **Cancelar
evento** segÃºn el caso.

## Cancelar un evento

Esto es definitivo: **no se puede deshacer**. Si el evento se recupera despuÃ©s,
se crea uno nuevo.

Desde el resumen del evento, **Zona de riesgo â†’ Cancelar evento**. Antes de
confirmar verÃ¡s el daÃ±o exacto:

- cuÃ¡ntas Ã³rdenes pagadas hay,
- cuÃ¡ntas personas distintas estÃ¡n afectadas,
- cuÃ¡ntas entradas se van a anular,
- cuÃ¡ntas **ya ingresaron**,
- y cuÃ¡nto dinero representa.

Luego: elige el motivo (problema con el local, aforo, cancelaciÃ³n del artista,
clima, otro), agrega lo que quieras explicar, y **escribe el tÃ­tulo del evento**
para habilitar el botÃ³n. Es a propÃ³sito: es la Ãºnica acciÃ³n del sistema que te
obliga a escribir.

Al confirmar: todas las entradas quedan anuladas, las Ã³rdenes pendientes
liberan su cupo, y cada comprador recibe un email **con tu motivo y el email de
contacto de tu organizaciÃ³n**. Los reembolsos se coordinan aparte (no son
automÃ¡ticos en esta versiÃ³n) â€” el email ya le dice a la gente que te escriba.

El evento cancelado no desaparece: sigues pudiendo ver sus ventas, sus
asistentes y su actividad para cerrar cuentas.

## Ver quiÃ©n hizo quÃ© (Actividad)

Desde el resumen del evento, **Actividad**. Es la bitÃ¡cora: cada acciÃ³n de
control con **quiÃ©n** la hizo, **cuÃ¡ndo** (hora de Lima), **sobre quÃ©** y **con
quÃ© motivo**.

Queda registrado: publicar, despublicar, pausar y reanudar, editar la
informaciÃ³n, borrar una imagen, enviar comunicado, cancelar el evento, anular
una orden, marcarla reembolsada, anular una entrada, deshacer un ingreso y
reenviar entradas.

No se puede editar ni borrar. Si alguien de tu equipo anulÃ³ algo el viernes,
aquÃ­ estÃ¡.

## Â¿Algo no cuadra?

- **Una venta no aparece**: revisa en **Ventas** filtrando por email; si
  dice "Pendiente" por mÃ¡s de 15 minutos, probablemente el pago no se
  completÃ³ y el cupo ya se liberÃ³ solo.
- **Alguien dice que pagÃ³ pero no tiene su entrada**: pÃ­dele que revise
  "Mi cuenta" en la tienda â€” las entradas siempre estÃ¡n ahÃ­ aunque el email
  se haya perdido. Si de verdad no llegÃ³, usa **Reenviar entradas**.
- **A alguien le sale "Anulada" y no sabe por quÃ©**: abre su orden en
  **Ventas** y mira el motivo; estÃ¡ tambiÃ©n en **Actividad** con quiÃ©n la
  anulÃ³.
- **Cualquier otra cosa**: contacta a soporte tÃ©cnico con el cÃ³digo de la
  orden (empieza con `TK-`) a mano; es lo primero que te van a pedir.

