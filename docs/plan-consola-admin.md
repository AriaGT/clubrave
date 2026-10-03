# Plan: consola de administración (`/admin`) y panel del organizador simplificado

Estado: **fase 1 (backend aditivo) implementada**; las fases 2 a 4 siguen siendo
propuesta. Este documento define el trabajo; el código del frontend todavía no
existe salvo donde se indique ("ya existe").

Hoy el panel mezcla dos públicos. El organizador entra a crear eventos y
vender, y en **Ajustes** se encuentra con credenciales de pasarelas, la marca
de la tienda y cuentas de empleados con contraseñas que él mismo define. Nada
de eso es su trabajo, y parte de ello ni siquiera debería poder tocarlo.

El plan separa el panel en tres experiencias con un solo login cada una:

| Quién | Entra por | Ve |
|---|---|---|
| **Administrador del sistema** (superusuario de Django) | `panel.clubrave.pe/admin` (ruta oculta) | Consola: organizaciones, usuarios, pagos, sitio web, bitácora global |
| **Organizador** | `panel.clubrave.pe/login` | Inicio, Eventos, Escanear, Cuenta |
| **Portero** | `panel.clubrave.pe/login` | Solo el escáner (igual que hoy) |

El organizador deja de crear empleados: todas las cuentas del panel son
**usuarios** que da de alta el administrador.

---

## 1. Diagnóstico: qué hay hoy

| Función | Dónde está | Quién puede | Problema |
|---|---|---|---|
| Modo de cobro y credenciales de pasarelas | Ajustes › Configuración avanzada › Medios de pago (`/api/org/payments/`) | Cualquier dueño de organización (`IsOrganizationOwner`) | `PaymentSettings` y `PaymentProvider` son **de toda la plataforma**. Con dos organizadores, uno puede cambiar o apagar las credenciales con las que cobran los eventos del otro. |
| Logo, contacto y redes de la tienda | Ajustes › Sitio web (`/api/org/site/`) | Cualquier dueño | Igual: `SiteSettings` es la marca de la tienda entera, no de una organización. |
| Empleados de seguridad | Ajustes › Empleados (`/api/org/employees/`) | El dueño, sobre su organización | El organizador administra contraseñas de terceros. Por decisión de producto, pasa al administrador. |
| Alta de organizadores | `manage.py create_organizer` o el admin de Django | Quien tenga consola en el servidor | No hay interfaz. |
| Desactivar una organización | `Organization.is_active` en el admin de Django | — | **No tiene efecto sobre el organizador**: `IsOrganizer` solo lee los claims del JWT. Solo el login de porteros lo revisa. |
| Quitarle el acceso a un organizador | Borrar su `Membership` en el admin de Django | — | Su access token sigue sirviendo hasta 30 min: `IsOrganizer` no vuelve a verificar la membresía (`IsDoorStaff` sí lo hace). |
| Bitácora de ajustes de plataforma | `SITE_SETTINGS_UPDATED`, `PAYMENT_SETTINGS_UPDATED` | — | Se guardan con la organización del dueño que los cambió y aparecen en *su* bitácora, aunque afectan a todas. |
| Pantalla de Ajustes | — | — | Lo primero que ve el organizador es el UUID de su organización. |

Los tres primeros puntos son la razón de ser del plan. Los defectos de
permisos (desactivar una organización, quitar acceso, bitácora) se arreglan
de paso: en cuanto el administrador gestione organizadores desde una
interfaz, sus botones tienen que surtir efecto de inmediato.

## 2. Modelo de roles

**No cambia el esquema de usuarios.** Los valores ya existen; solo cambia
quién los administra y cómo se llaman en pantalla.

| Rol en pantalla | En la base | Sesión (JWT `scope`) |
|---|---|---|
| Administrador del sistema | `User.is_superuser = True` | `admin` (nuevo) |
| Organizador | `User.role = ORGANIZER` + `Membership.role = OWNER` | `org` (ya existe) |
| Portero | `User.role = STAFF` + `Membership.role = SECURITY` | `door` (ya existe) |
| Comprador | `User.role = CUSTOMER` | `customer` (ya existe) |

- La fuente de verdad del administrador es **`is_superuser`**, no
  `role = ADMIN`. `createsuperuser` ya pone las dos cosas
  (`UserManager.create_superuser`), pero el permiso mira solo `is_superuser`.
- Las sesiones no se cruzan. Un superusuario no entra por `/login`
  (`OrgLoginView` ya rechaza `role = ADMIN`), y un organizador no entra por
  `/admin`.
- "Seguridad" y "empleado" pasan a llamarse **portero** en la interfaz. En la
  base no cambia nada: `SECURITY` y `STAFF` siguen igual, así no hace falta
  ninguna migración de datos.

## 3. Backend

### 3.1 Sesión de administrador

- **`POST /api/auth/admin/login/`**: `authenticate()` y luego exige
  `is_superuser and is_active`. Si falla, responde con el mismo error
  genérico que el login del panel ("Email o contraseña incorrectos.") para
  no revelar qué cuentas son de administrador. Throttle propio
  `admin_login: 10/hour`.
- **`admin_tokens_for_user()`** en `apps/accounts/services.py`: usa el mismo
  `_tokens_for` con `scope="admin"`, sin `organization_id`. El refresh vence
  a las **12 h** (con `set_exp`, sin tocar el `REFRESH_TOKEN_LIFETIME`
  global de 30 días): una consola con llaves de pago no debe quedar abierta
  un mes.
- **`POST /api/auth/admin/refresh/`**: subclase de
  `GraceTokenRefreshSerializer` que además exige `scope == "admin"` y que el
  usuario siga siendo superusuario.
- **Permiso `IsPlatformAdmin`** en `apps/accounts/permissions.py`: exige
  `scope == "admin"`, `request.user.is_superuser` y `request.user.is_active`.
  simplejwt carga `request.user` de la base en cada petición, así que si se
  le quita el superusuario a alguien, el token deja de servirle de inmediato.
- Cruce de scopes (lo cubren las pruebas): un token `admin` recibe 403 en
  todo `/api/org/*` (`IsOrganizer` exige `org`), y los tokens `org` y `door`
  reciben 403 en todo `/api/admin/*`.

### 3.2 API `/api/admin/`

No choca con el admin de Django: ese vive en `api.clubrave.pe/admin/`, y la
API en `/api/admin/`.

| Endpoint | Para qué |
|---|---|
| `GET /api/admin/overview/` | Contadores y alertas para la pantalla Resumen |
| `GET/POST /api/admin/organizations/` | Listar (con conteo de organizadores, porteros y eventos) y crear |
| `GET/PATCH /api/admin/organizations/{id}/` | Editar nombre, email de contacto y zona horaria; activar o desactivar |
| `GET /api/admin/organizations/{id}/events/` | Eventos de la organización, para asignárselos a un portero |
| `GET/POST /api/admin/users/` | Usuarios del panel (organizadores y porteros). Filtros: `role`, `organization`, `is_active`, `q` |
| `GET/PATCH/DELETE /api/admin/users/{id}/` | Editar nombre, estado y eventos (porteros). `DELETE` solo para porteros |
| `POST /api/admin/users/{id}/reset-password/` | El admin define la contraseña nueva; cierra las sesiones abiertas |
| `POST /api/admin/users/{id}/revoke-sessions/` | Cerrar las sesiones sin cambiar la contraseña |
| `GET/PATCH /api/admin/payments/` | El `OrgPaymentSettingsView` actual, con otra ruta y otro permiso |
| `GET/PATCH /api/admin/site/` | El `OrgSiteSettingsView` actual, con otra ruta y otro permiso |
| `GET /api/admin/audit/` | Bitácora de todas las organizaciones más las acciones de plataforma |

Al crear un **organizador**, el admin elige entre crear una organización
nueva (lo que hace hoy `create_organizer`) o sumarlo a una existente como
segundo dueño. Al crear un **portero**, elige la organización y el alcance
(todos los eventos o solo algunos), igual que el formulario de empleados
actual.

### 3.3 Servicios

Se reutiliza lo que ya existe; solo cambia quién llama.

- `apps/accounts/employees.py` → **`apps/accounts/panel_users.py`**.
  `create_employee`, `update_employee`, `reset_employee_password` y
  `delete_employee` ya hacen casi todo (validación de contraseña, alcance
  de eventos, revocar sesiones al desactivar, bitácora). Hay que
  generalizarlos para que reciban la organización como parámetro en lugar
  de sacarla del token, y sumar `create_organizer`.
- **`apps/accounts/organizations.py`**: `create_organization`,
  `update_organization` y `set_organization_active`. Desactivar una
  organización cierra las sesiones de todos sus usuarios.
- `create_organizer` (el comando de consola) pasa a llamar al servicio, así
  la consola y el comando no se separan con el tiempo.
- Pagos y sitio web no tienen servicio nuevo: `update_payment_settings` y
  `SiteSettingsSerializer` se usan tal cual; solo se mueven las vistas.

### 3.4 Bitácora

- **Migración**: `AuditLog.organization` pasa a `null=True`. Las acciones de
  plataforma (pagos, sitio web) se registran sin organización y dejan de
  aparecer en la bitácora de un organizador cualquiera.
- **Acciones nuevas**: `ORGANIZATION_CREATED`, `ORGANIZATION_UPDATED`,
  `ORGANIZATION_DEACTIVATED`, `ORGANIZATION_REACTIVATED`,
  `ORGANIZER_CREATED`, `ORGANIZER_UPDATED`, `ORGANIZER_DEACTIVATED`,
  `ORGANIZER_REACTIVATED`, `ORGANIZER_PASSWORD_RESET` y `SESSIONS_REVOKED`.
- Los porteros siguen usando `EMPLOYEE_*` para no reescribir el historial;
  solo cambia la etiqueta en pantalla. Se guardan con la organización del
  portero, así el organizador ve en su Actividad que el administrador dio
  de alta a un portero para sus eventos.

### 3.5 Endurecimiento del permiso de organizador

- `IsOrganizer` vuelve a verificar en cada petición la membresía `OWNER` y
  `organization.is_active`, igual que ya hace `IsDoorStaff`. Es una
  consulta por petición y la deja en `request` para reutilizarla.
- `org_tokens_for_user` rechaza las organizaciones inactivas.

Con esto, *desactivar organización* y *quitar organizador* tienen efecto
inmediato, no a los 30 minutos.

### 3.6 Lo que se retira (en la fase 3, no antes)

- `/api/org/employees/` (`employee_views.py`), `/api/org/payments/` y
  `/api/org/site/`.
- `IsOrganizationOwner`: sin esos tres endpoints no lo usa nadie más.
- Se suma **`GET /api/org/me/`** (nombre de la organización, email y nombre
  del usuario) para la nueva pantalla Cuenta, que hoy muestra un UUID.

## 4. Frontend

### 4.1 Estructura de rutas en `apps/organizer`

```
app/
  layout.tsx                    QueryProvider (ya no monta la sesión)
  (panel)/layout.tsx            SessionProvider del organizador/portero  ← se mueve aquí
  (panel)/(app)/...             igual que hoy (las URL no cambian)
  (panel)/(auth)/login/
  (panel)/confirmar-contrasena/
  admin/layout.tsx              AdminSessionProvider + robots noindex
  admin/login/page.tsx
  admin/(console)/layout.tsx    guardia de sesión + AdminShell (barra lateral)
  admin/(console)/page.tsx                  Resumen
  admin/(console)/organizations/            lista y [id]
  admin/(console)/users/                    lista, new y [id]
  admin/(console)/payments/page.tsx         movido desde settings/payments
  admin/(console)/site/page.tsx             movido desde settings/site
  admin/(console)/audit/page.tsx
  api/admin-auth/{login,refresh,logout}/route.ts
```

El grupo `(panel)` existe para que `/admin` no monte la sesión del
organizador; si no, al abrir la consola se intentaría refrescar una cookie
que no le corresponde. Los grupos de rutas no cambian las URL.

### 4.2 Sesión de la consola

- La cookie es propia, **`admin_refresh_token`**: `httpOnly`,
  `sameSite: "strict"`, `path: "/api/admin-auth"` (solo viaja a esas tres
  rutas) y `maxAge` de 12 h. Es independiente de `org_refresh_token`, así
  que se puede tener abierta la consola y el panel de un organizador de
  prueba en el mismo navegador sin que una sesión pise a la otra.
- `lib/admin-session.tsx` es una versión reducida de `lib/session.tsx`. Para
  reutilizarlo, `lib/auth-refresh.ts` se parametriza con la URL de refresh y
  el nombre del candado entre pestañas.
- `useAdminApi()` funciona como `useApi()`, pero con el token del admin.

### 4.3 "Oculta" significa sin enlaces, no sin protección

- Ninguna pantalla del panel enlaza a `/admin`, tampoco aparece en el
  manifiesto y `admin/layout.tsx` declara `robots: { index: false, follow: false }`.
- Un usuario que no es superusuario recibe el mismo error genérico que con
  una contraseña equivocada.
- La protección real es `IsPlatformAdmin` en el backend. Esconder la ruta
  evita que el organizador tropiece con ella, nada más.

### 4.4 La consola

Pensada primero para escritorio: barra lateral fija (Resumen, Organizaciones,
Usuarios, Pagos, Sitio web, Bitácora) y, en el teléfono, una barra superior
que abre el menú en un `Sheet`. Usa los componentes de `@repo/ui` que ya
existen (`Card`, `Input`, `Select`, `Switch`, `Badge`, `ConfirmDialog`,
`EmptyState`, `Sheet`). Los nuevos van a `packages/ui/src/composition/`:
`AdminShell` (barra lateral y contenido) y `DataTable` (tabla simple con
encabezado fijo y filas clicables).

- **Resumen**: organizaciones activas, organizadores, porteros y próximos
  eventos. Muestra el estado de los cobros (modo, pasarelas activas y si
  están verificadas) y alertas de configuración (por ejemplo, una pasarela
  activa sin verificar o el modo simulador encendido).
- **Organizaciones**: tabla con nombre, contacto, organizadores, porteros,
  eventos y estado. En el detalle se editan los datos, se activa o
  desactiva la organización y se ven sus usuarios, con atajos para
  *Agregar organizador* y *Agregar portero*.
- **Usuarios**: tabla única con nombre, email, rol, organización, estado y
  último acceso, con filtros y búsqueda. El alta va en este orden:
  1. Rol.
  2. Organización (existente, o una nueva si es organizador).
  3. Nombre y email.
  4. Contraseña inicial: se genera, se muestra una sola vez y se copia.
  5. Solo para porteros: todos los eventos o solo algunos.

  Acciones: editar, resetear contraseña, cerrar sesiones,
  desactivar/reactivar y eliminar (solo porteros).
- **Pagos**: la página actual de *Medios de pago*, sin cambios funcionales.
- **Sitio web**: la página actual, sin cambios funcionales.
- **Bitácora**: global, filtrable por organización, acción y fecha. Las
  entradas sin organización se etiquetan "Plataforma".

### 4.5 Panel del organizador simplificado

- Barra inferior: **Inicio · Eventos · Escanear · Cuenta**. "Ajustes" pasa a
  llamarse Cuenta, porque es lo único que queda en esa pantalla.
- **Cuenta** muestra el nombre de la organización (no su UUID), el email del
  usuario, *Contraseña* y *Cerrar sesión*. Desaparecen Sitio web, Empleados,
  Medios de pago y el bloque "Configuración avanzada".
- Se borran `settings/employees`, `settings/payments`, `settings/site`,
  `features/employees` y `features/site`. `features/payments` se mueve a
  `features/admin/payments`.
- En los textos de la interfaz, "Seguridad" y "empleado" pasan a "portero":
  login, escáner y comentarios de `lib/session.tsx`.
- El portero no cambia: solo el escáner, sin barra inferior.

## 5. Datos y puesta en marcha

- **Sin migración de datos.** Los `STAFF` con membresía `SECURITY` ya son
  porteros, los `ORGANIZER` con `OWNER` ya son organizadores, y los
  singletons de pagos y sitio no se tocan.
- **Una migración de esquema**: `AuditLog.organization` nullable, más las
  acciones nuevas.
- **Superusuario en producción**: `python manage.py createsuperuser`. Si el
  hosting no da consola, se agrega una vez
  `createsuperuser --noinput` al comando de arranque, con
  `DJANGO_SUPERUSER_EMAIL` y `DJANGO_SUPERUSER_PASSWORD` en el gestor de
  secretos, y se quita después del primer despliegue (`USERNAME_FIELD` ya
  es `email` y `REQUIRED_FIELDS` está vacío, así que funciona sin más).
- El admin de Django sigue en `api.clubrave.pe/admin/` como herramienta de
  emergencia.

## 6. Pruebas

Backend (`pytest`):

- **`test_admin_auth.py`** (nuevo):
  - El superusuario entra.
  - Organizador, portero, comprador y un `role = ADMIN` sin `is_superuser`
    reciben el error genérico.
  - Un superusuario inactivo no entra.
  - A un superusuario degradado se le rechaza el token ya emitido.
  - El refresh rechaza tokens de otro scope.
  - El refresh del admin vence a las 12 h.
- **Matriz de scopes**: `admin` → 403 en `/api/org/*`; `org` y `door` → 403
  en `/api/admin/*`.
- `test_security_employees.py` → **`test_admin_users.py`**: se mantiene la
  misma cobertura (alcance de eventos, contraseña, revocar sesiones, borrado
  sin perder el rastro de ingresos), ahora contra `/api/admin/users/`.
  También el alta de organizadores en una organización nueva y en una
  existente.
- `test_payment_settings.py` y `test_site_settings.py`: apuntan a
  `/api/admin/*`, más un caso que confirma que un dueño de organización
  recibe 403.
- `test_organization_isolation.py`:
  - Desactivar la organización corta el token ya emitido.
  - Borrar la membresía también.
  - El login rechaza organizaciones inactivas.
- `test_audit.py`: las acciones de plataforma quedan sin organización y no
  aparecen en `/api/org/audit/`.

Frontend: regenerar `packages/api-client/src/schema.d.ts` y verificar en el
navegador estos recorridos:

1. Login del admin.
2. Crear una organización con su organizador.
3. Crear un portero con eventos elegidos.
4. Entrar como ese portero y escanear.
5. Desactivar la organización y comprobar que el organizador queda fuera.

## 7. Orden de entrega (sin cortar el servicio)

El frontend (Vercel) y la API (Render) se despliegan por separado, así que
se agrega primero y se retira al final.

1. **Fase 1: backend aditivo.** Sesión de admin, `IsPlatformAdmin`, la API
   `/api/admin/*`, la migración de `AuditLog` y el endurecimiento de
   `IsOrganizer`. Los endpoints `/api/org/*` de pagos, sitio y empleados
   siguen funcionando. Se despliega y se crea el superusuario.
2. **Fase 2: consola `/admin`.** Grupo `(panel)`, sesión del admin,
   `AdminShell`, Resumen, Organizaciones, Usuarios, Pagos, Sitio web y
   Bitácora. En este punto el panel del organizador todavía no cambia.
3. **Fase 3: retiro y simplificación.** Se quitan las tres páginas del
   organizador y se agrega Cuenta con `/api/org/me/`. Se cambian los textos
   a "portero" y se eliminan los tres endpoints viejos junto con
   `IsOrganizationOwner`. Se actualizan `manual-organizador.md`,
   `guia-puerta.md`, `pagos.md` (Pagos pasa a estar en la consola) y
   `despliegue.md` (el paso del superusuario). Primero se despliega el
   frontend y después la API.
4. **Fase 4: opcional.** Una sección *Sistema* con las URL de webhooks para
   registrar en cada pasarela, chequeos de entorno
   (`PAYMENT_CREDENTIALS_KEY`, email, storage) y la versión desplegada.
   También mover el admin de Django a una ruta configurable.

## 8. Decisiones abiertas

Cada una trae una recomendación. Si no se indica lo contrario, el plan las
toma como decididas.

1. **¿El organizador sigue pudiendo escanear?** Recomiendo **sí**: en
   eventos chicos el organizador es el portero. El escáner no es
   configuración del sistema.
2. **¿Un portero puede trabajar para varias organizaciones?** Hoy no:
   `door_tokens_for_user` toma la primera membresía. Recomiendo **mantener
   una sola** en esta etapa. Si un portero trabaja para dos organizadores,
   tiene dos cuentas.
3. **¿El organizador ve quiénes son sus porteros?** Recomiendo **no en
   esta etapa**: lo ve en su Actividad cuando el admin los da de alta. Una
   lista de solo lectura en Cuenta puede llegar después.
4. **Contraseña inicial**: recomiendo que el admin la genere y la comunique,
   como hoy con los empleados. Una invitación por correo con enlace para
   definirla es una mejora posterior.
5. **¿Se pueden borrar organizadores?** Recomiendo **solo desactivarlos**:
   son actores de la bitácora y dueños de eventos con ventas. A los
   porteros sí se los puede borrar, como hoy.

## 9. Fuera de alcance

- **Credenciales de pago por organizador** (cada uno cobra en su propia
  cuenta). Hoy los cobros son de la plataforma y este plan no lo cambia;
  solo pone esas llaves en manos de quien corresponde.
- **Segundo factor para el administrador.** Es la siguiente mejora natural
  de la consola, pero no bloquea este plan.
- **"Entrar como" un organizador** para dar soporte.
