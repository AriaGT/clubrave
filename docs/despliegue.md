# Despliegue a producción

Runbook para llevar Club Rave de "funciona en mi máquina" a un evento real.
Sigue §14 del plan; este documento es la versión ejecutable de esa sección.

## 1. Topología

```
clubrave.pe            → Tienda (Next.js, apps/store)
panel.clubrave.pe       → Panel del organizador (Next.js, apps/organizer)
api.clubrave.pe         → API Django (backend/, contenedor + Gunicorn)
cdn.clubrave.pe         → Bucket S3 público tras CDN (imágenes de eventos)
                          Postgres gestionado, con copias diarias
```

**Despliegue gratuito (MVP/demo)**: Vercel Hobby (tienda + panel, dos
proyectos del mismo repo) + Render free (API, Docker) + Neon free
(Postgres) + Cloudflare R2 (bucket S3-compatible, ya es el DNS del
dominio) + Resend/Brevo (email). Ver aviso de uso comercial en la sección
9.

Requisitos mínimos: 1 vCPU / 1 GB para la API (2-3 workers de Gunicorn), la
instancia más chica de Postgres. El tráfico se concentra en el anuncio del
evento y en la puerta — escalar es sumar workers, no rediseñar nada.

## 2. Antes de desplegar (checklist)

- [ ] Dominio y subdominios de la tabla anterior apuntando al hosting elegido.
- [ ] Certificados HTTPS para los cuatro (la mayoría de hostings los
      automatizan con Let's Encrypt).
- [ ] Postgres gestionado creado, con copias diarias activadas y retención
      de 30 días.
- [ ] Bucket S3 (o compatible) creado, con el CDN configurado delante.
- [ ] Proveedor de email transaccional dado de alta, con SPF/DKIM
      configurados para el dominio (si no, los correos de entradas caen en
      spam — es el fallo silencioso más común de esta parte).
- [ ] Todas las variables de la tabla de la sección 3 cargadas en el gestor
      de secretos del hosting — **nunca** en el repositorio.
- [ ] `python manage.py check --deploy` corrido contra la configuración
      real (ver sección 5).

## 3. Variables de entorno de producción

**Backend** (`DJANGO_SETTINGS_MODULE=config.settings.prod`)

| Variable | Notas |
|---|---|
| `SECRET_KEY` | Generada, distinta a la de pruebas |
| `DEBUG` | `False` (lo fuerza `config.settings.prod` de todos modos) |
| `ALLOWED_HOSTS` | `api.clubrave.pe` — **obligatoria**: `prod.py` no arranca sin ella |
| `DATABASE_URL` | `postgres://usuario:pass@host:5432/basedatos?sslmode=require` (Neon exige `sslmode=require`) |
| `CORS_ALLOWED_ORIGINS` | `https://clubrave.pe,https://panel.clubrave.pe` |
| `TICKET_SIGNING_KEYS` | `k1:<secreto-largo-aleatorio>` — distinto al de pruebas |
| `TICKET_SIGNING_KEY_ID` | `k1` |
| `ORDER_HOLD_MINUTES` | `15` (o el valor que se decida) |
| `TERMS_VERSION` | Fecha de la versión vigente de términos |
| `CHECKIN_WINDOW_HOURS_BEFORE_START` / `CHECKIN_WINDOW_HOURS_AFTER_END` | Opcional. Ventana del escáner del personal de Seguridad (por defecto `3` / `0`) |
| `JWT_REFRESH_ROTATE_AFTER_SECONDS` / `JWT_REFRESH_REUSE_GRACE_SECONDS` | Opcional. Rotación del refresh token (por defecto `43200` / `120`, ver `apps/accounts/tokens.py`) |
| `AWS_STORAGE_BUCKET_NAME` | Nombre del bucket R2 |
| `AWS_S3_ENDPOINT_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (Cloudflare Dashboard → R2 → Overview, o al crear el API token) — **no** es el custom domain |
| `AWS_S3_REGION_NAME` | `auto` (default ya aplicado en `base.py`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Del API token de R2 (permiso Object Read & Write) |
| `AWS_S3_CUSTOM_DOMAIN` | `cdn.clubrave.pe` — **sin** `https://` delante |
| `DEFAULT_FROM_EMAIL`, `EMAIL_HOST*` | Del proveedor de email transaccional (Resend/Brevo por SMTP) |
| `FRONTEND_STORE_URL` / `FRONTEND_PANEL_URL` | `https://clubrave.pe` / `https://panel.clubrave.pe` |
| `PAYMENT_GATEWAY`, `IZIPAY_*` | Ver [`izipay-activacion.md`](./izipay-activacion.md) — `fake` mientras no haya credenciales |
| `SENTRY_DSN` | Del proyecto de Sentry (sección 6), opcional |

**Frontends** (ambas apps)

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.clubrave.pe` |
| `NEXT_PUBLIC_SITE_URL` | `https://clubrave.pe` (solo tienda) |
| `NEXT_PUBLIC_STORE_URL` | `https://clubrave.pe` (solo panel) |

## 4. Desplegar

**API** — imagen de `backend/Dockerfile` (ya construida en este repo):
arranca con `migrate` y luego `gunicorn`. Sonda de salud: `GET /api/health/`
(revisa base de datos y config de pagos).

```bash
docker build -t umbral-api backend/
docker run -e DJANGO_SETTINGS_MODULE=config.settings.prod --env-file .env.prod -p 8000:8000 umbral-api
```

**Frontends** — build estándar de Next.js (`pnpm --filter @app/organizer build`,
`pnpm --filter @app/store build`), desplegado en la plataforma elegida con
las variables de la sección 3.

**Tareas programadas** (cron o el scheduler del hosting):

```
*/5 * * * *  python manage.py release_expired_orders
*/10 * * * * python manage.py resend_pending_ticket_emails
```

## 5. Verificación antes de anunciar el evento

```bash
DJANGO_SETTINGS_MODULE=config.settings.prod python manage.py check --deploy
```

Revisa en particular que no haya advertencias sobre `SECRET_KEY`, cookies
inseguras, o `ALLOWED_HOSTS`. Luego, de punta a punta con datos reales pero
de bajo riesgo:

1. Crear un organizador de verdad (`python manage.py create_organizer`).
2. Publicar un evento de prueba (no listado / con fecha ya pasada tras la
   prueba, para no confundir a compradores reales).
3. Comprar una entrada de bajo monto con Izipay en modo pruebas primero, y
   luego —si ya se activó producción— con una tarjeta real propia.
4. Escanear esa entrada en el panel y confirmar el resultado verde.
5. Repetir el escaneo y confirmar el ámbar "Ya ingresó".

Si los cinco pasos funcionan, el sistema está listo para el evento piloto
real de §2.3.

## 6. Observabilidad y alertas

- **Sentry** en los tres proyectos (backend + dos frontends) vía
  `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — captura excepciones no
  manejadas automáticamente en cuanto se configura la variable.
- **Registros estructurados**: el backend ya loguea en JSON vía el logger
  estándar de Django; verifica que el hosting los recolecte (la mayoría de
  PaaS lo hacen solo con leer stdout/stderr del contenedor).
- **Alertas concretas a configurar** (§14.3): IPN con firma inválida,
  órdenes `PAID` sin entradas emitidas, tasa de error 5xx, fallos de envío
  de email. Las tres primeras se detectan buscando en los logs los
  mensajes `logger.warning`/`logger.error` que ya emiten
  `apps/payments/views.py` y `apps/orders/services/fulfillment.py` — solo
  falta conectar esas líneas a un canal de alertas (Sentry ya las captura
  como eventos si el logger está integrado; si no, un `grep` programado
  sobre los logs alcanza para el MVP).

## 7. Copias de seguridad

- Diarias, retención de 30 días — la mayoría de Postgres gestionados lo
  ofrecen como una casilla, no como algo que programar a mano.
- **Antes de anunciar el evento piloto**, restaura una copia en un entorno
  aparte y confirma que la aplicación arranca contra ella. Una copia que
  nunca se ha restaurado no es una copia — es una promesa.

## 8. Si algo sale mal el día del evento

- **Los cobros fallan**: cambia `PAYMENT_GATEWAY` a `fake` para cortar el
  sangrado mientras se investiga — ver
  [`izipay-activacion.md`](./izipay-activacion.md#5-volver-atrás-sin-drama).
  El checkout sigue funcionando (sin cobrar) mientras se resuelve.
- **La API cae en la puerta**: el escáner exige red porque la validación es
  siempre en vivo (a propósito, ver §5.6 del plan) — no hay modo sin
  conexión en este MVP. Ten un plan B manual (lista impresa de compradores)
  para una caída larga.
- **Un comprador no recibe su email**: dile que entre a "Mi cuenta" — las
  entradas siempre están ahí. El comando `resend_pending_ticket_emails`
  reintenta los envíos fallidos cada 10 minutos de todos modos.

## 9. Despliegue 100% gratuito (MVP/demo)

Para presentar el MVP sin costo, con `clubrave.pe` ya en Cloudflare (DNS
Full):

| Pieza | Servicio | Notas |
|---|---|---|
| Tienda | Vercel Hobby | Root Directory `apps/store` |
| Panel | Vercel Hobby (2º proyecto) | Root Directory `apps/organizer` |
| API | Render Web Service, Docker | `backend/Dockerfile`. Se duerme tras 15 min sin tráfico |
| Postgres | Neon free | No expira (el free de Render se borra a los 30 días) |
| Imágenes | Cloudflare R2 | Custom domain vía el mismo DNS del dominio |
| Email | Resend (100/día) o Brevo (300/día) | SMTP, sin cambios de código |
| Cron | `.github/workflows/cron.yml` | Sustituye el cron del hosting (Render free no trae uno) |
| Anti-sueño | cron-job.org / UptimeRobot | Ping a `/api/health/` cada 5–10 min |

Pasos:

1. **Neon**: crear proyecto, copiar `DATABASE_URL` con `?sslmode=require`.
2. **Render**: Web Service Docker, Root Directory `backend`. Cargar las
   variables de la sección 3. `ALLOWED_HOSTS=api.clubrave.pe`. Health
   Check Path `/api/health/`. Probar primero en `*.onrender.com`.
3. **Datos iniciales**: correr `create_organizer` / `seed_demo` en local
   con `DATABASE_URL` apuntando a Neon (el shell de Render no es gratis).
4. **R2**: crear bucket + API token (Object Read & Write) → da
   `AWS_S3_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
   Conectar `cdn.clubrave.pe` como Custom Domain del bucket (activo solo
   si el DNS está en Cloudflare, que ya lo está).
5. **Vercel**: importar el repo dos veces con las variables de la sección
   3 (`NEXT_PUBLIC_API_URL`, y `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_STORE_URL`
   según la app).
6. **DNS en Cloudflare**: `@`/`www` → Vercel (tienda), `panel` → Vercel
   (panel), `api` → Render, `cdn` → R2, más los registros SPF/DKIM de
   Resend/Brevo.
7. **Secrets del repo** (Settings → Secrets → Actions) para
   `cron.yml`: `SECRET_KEY`, `ALLOWED_HOSTS`, `DATABASE_URL`,
   `CORS_ALLOWED_ORIGINS`, `TICKET_SIGNING_KEYS`, `TICKET_SIGNING_KEY_ID`,
   y para el segundo job `DEFAULT_FROM_EMAIL`/`EMAIL_HOST*`.
8. Verificación: sección 5 completa, con `PAYMENT_GATEWAY=fake`.

**Avisos:**

- **Uso comercial**: los términos de Vercel Hobby lo prohíben. Sirve para
  demo/pruebas; antes de vender entradas reales, migrar a Vercel Pro o a
  Cloudflare Pages/Workers (`@opennextjs/cloudflare`, gratis y comercial).
- **Cold start de Render**: la API tarda 30–60 s en despertar tras estar
  dormida. El ping periódico lo evita; de todos modos, visitarla antes de
  cualquier demo.
- **Cron de GitHub Actions es aproximado**: puede atrasarse varios
  minutos. Aceptable para el MVP; migrar a un scheduler real al pasar a
  un plan pago.
- **Pagos**: con `fake` no se cobra dinero real. Activar Izipay
  (`izipay-activacion.md`) antes del evento real.
- **Límites**: Neon 0.5 GB y Resend 100/día alcanzan para una demo o un
  evento chico; para miles de compradores, el email es lo primero que se
  queda corto.
