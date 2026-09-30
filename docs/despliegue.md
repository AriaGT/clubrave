# Despliegue a producciÃ³n

Runbook para llevar Club Rave de "funciona en mi mÃ¡quina" a un evento real.
Sigue Â§14 del plan; este documento es la versiÃ³n ejecutable de esa secciÃ³n.

## 1. TopologÃ­a

```
clubrave.pe            â†’ Tienda (Next.js, apps/store)
panel.clubrave.pe       â†’ Panel del organizador (Next.js, apps/organizer)
api.clubrave.pe         â†’ API Django (backend/, contenedor + Gunicorn)
cdn.clubrave.pe         â†’ Bucket S3 pÃºblico tras CDN (imÃ¡genes de eventos)
                          Postgres gestionado, con copias diarias
```

**Despliegue gratuito (MVP/demo)**: Vercel Hobby (tienda + panel, dos
proyectos del mismo repo) + Render free (API, Docker) + Neon free
(Postgres) + Cloudflare R2 (bucket S3-compatible, ya es el DNS del
dominio) + Resend/Brevo (email). Ver aviso de uso comercial en la secciÃ³n
9.

Requisitos mÃ­nimos: 1 vCPU / 1 GB para la API (2-3 workers de Gunicorn), la
instancia mÃ¡s chica de Postgres. El trÃ¡fico se concentra en el anuncio del
evento y en la puerta â€” escalar es sumar workers, no rediseÃ±ar nada.

## 2. Antes de desplegar (checklist)

- [ ] Dominio y subdominios de la tabla anterior apuntando al hosting elegido.
- [ ] Certificados HTTPS para los cuatro (la mayorÃ­a de hostings los
      automatizan con Let's Encrypt).
- [ ] Postgres gestionado creado, con copias diarias activadas y retenciÃ³n
      de 30 dÃ­as.
- [ ] Bucket S3 (o compatible) creado, con el CDN configurado delante.
- [ ] Proveedor de email transaccional dado de alta, con SPF/DKIM
      configurados para el dominio (si no, los correos de entradas caen en
      spam â€” es el fallo silencioso mÃ¡s comÃºn de esta parte).
- [ ] Todas las variables de la tabla de la secciÃ³n 3 cargadas en el gestor
      de secretos del hosting â€” **nunca** en el repositorio.
- [ ] `python manage.py check --deploy` corrido contra la configuraciÃ³n
      real (ver secciÃ³n 5).

## 3. Variables de entorno de producciÃ³n

**Backend** (`DJANGO_SETTINGS_MODULE=config.settings.prod`)

| Variable | Notas |
|---|---|
| `SECRET_KEY` | Generada, distinta a la de pruebas |
| `DEBUG` | `False` (lo fuerza `config.settings.prod` de todos modos) |
| `ALLOWED_HOSTS` | `api.clubrave.pe` â€” **obligatoria**: `prod.py` no arranca sin ella |
| `DATABASE_URL` | `postgres://usuario:pass@host:5432/basedatos?sslmode=require` (Neon exige `sslmode=require`) |
| `CORS_ALLOWED_ORIGINS` | `https://clubrave.pe,https://panel.clubrave.pe` |
| `TICKET_SIGNING_KEYS` | `k1:<secreto-largo-aleatorio>` â€” distinto al de pruebas |
| `TICKET_SIGNING_KEY_ID` | `k1` |
| `ORDER_HOLD_MINUTES` | `15` (o el valor que se decida) |
| `TERMS_VERSION` | Fecha de la versiÃ³n vigente de tÃ©rminos |
| `AWS_STORAGE_BUCKET_NAME` | Nombre del bucket R2 |
| `AWS_S3_ENDPOINT_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (Cloudflare Dashboard â†’ R2 â†’ Overview, o al crear el API token) â€” **no** es el custom domain |
| `AWS_S3_REGION_NAME` | `auto` (default ya aplicado en `base.py`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Del API token de R2 (permiso Object Read & Write) |
| `AWS_S3_CUSTOM_DOMAIN` | `cdn.clubrave.pe` â€” **sin** `https://` delante |
| `DEFAULT_FROM_EMAIL`, `EMAIL_HOST*` | Del proveedor de email transaccional (Resend/Brevo por SMTP) |
| `FRONTEND_STORE_URL` / `FRONTEND_PANEL_URL` | `https://clubrave.pe` / `https://panel.clubrave.pe` |
| `PAYMENT_GATEWAY`, `IZIPAY_*` | Ver [`izipay-activacion.md`](./izipay-activacion.md) â€” `fake` mientras no haya credenciales |
| `SENTRY_DSN` | Del proyecto de Sentry (secciÃ³n 6), opcional |

**Frontends** (ambas apps)

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.clubrave.pe` |
| `NEXT_PUBLIC_SITE_URL` | `https://clubrave.pe` (solo tienda) |
| `NEXT_PUBLIC_STORE_URL` | `https://clubrave.pe` (solo panel) |

## 4. Desplegar

**API** â€” imagen de `backend/Dockerfile` (ya construida en este repo):
arranca con `migrate` y luego `gunicorn`. Sonda de salud: `GET /api/health/`
(revisa base de datos y config de pagos).

```bash
docker build -t Club Rave-api backend/
docker run -e DJANGO_SETTINGS_MODULE=config.settings.prod --env-file .env.prod -p 8000:8000 Club Rave-api
```

**Frontends** â€” build estÃ¡ndar de Next.js (`pnpm --filter @app/organizer build`,
`pnpm --filter @app/store build`), desplegado en la plataforma elegida con
las variables de la secciÃ³n 3.

**Tareas programadas** (cron o el scheduler del hosting):

```
*/5 * * * *  python manage.py release_expired_orders
*/10 * * * * python manage.py resend_pending_ticket_emails
```

## 5. VerificaciÃ³n antes de anunciar el evento

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
   luego â€”si ya se activÃ³ producciÃ³nâ€” con una tarjeta real propia.
4. Escanear esa entrada en el panel y confirmar el resultado verde.
5. Repetir el escaneo y confirmar el Ã¡mbar "Ya ingresÃ³".

Si los cinco pasos funcionan, el sistema estÃ¡ listo para el evento piloto
real de Â§2.3.

## 6. Observabilidad y alertas

- **Sentry** en los tres proyectos (backend + dos frontends) vÃ­a
  `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` â€” captura excepciones no
  manejadas automÃ¡ticamente en cuanto se configura la variable.
- **Registros estructurados**: el backend ya loguea en JSON vÃ­a el logger
  estÃ¡ndar de Django; verifica que el hosting los recolecte (la mayorÃ­a de
  PaaS lo hacen solo con leer stdout/stderr del contenedor).
- **Alertas concretas a configurar** (Â§14.3): IPN con firma invÃ¡lida,
  Ã³rdenes `PAID` sin entradas emitidas, tasa de error 5xx, fallos de envÃ­o
  de email. Las tres primeras se detectan buscando en los logs los
  mensajes `logger.warning`/`logger.error` que ya emiten
  `apps/payments/views.py` y `apps/orders/services/fulfillment.py` â€” solo
  falta conectar esas lÃ­neas a un canal de alertas (Sentry ya las captura
  como eventos si el logger estÃ¡ integrado; si no, un `grep` programado
  sobre los logs alcanza para el MVP).

## 7. Copias de seguridad

- Diarias, retenciÃ³n de 30 dÃ­as â€” la mayorÃ­a de Postgres gestionados lo
  ofrecen como una casilla, no como algo que programar a mano.
- **Antes de anunciar el evento piloto**, restaura una copia en un entorno
  aparte y confirma que la aplicaciÃ³n arranca contra ella. Una copia que
  nunca se ha restaurado no es una copia â€” es una promesa.

## 8. Si algo sale mal el dÃ­a del evento

- **Los cobros fallan**: cambia `PAYMENT_GATEWAY` a `fake` para cortar el
  sangrado mientras se investiga â€” ver
  [`izipay-activacion.md`](./izipay-activacion.md#5-volver-atrÃ¡s-sin-drama).
  El checkout sigue funcionando (sin cobrar) mientras se resuelve.
- **La API cae en la puerta**: el escÃ¡ner exige red porque la validaciÃ³n es
  siempre en vivo (a propÃ³sito, ver Â§5.6 del plan) â€” no hay modo sin
  conexiÃ³n en este MVP. Ten un plan B manual (lista impresa de compradores)
  para una caÃ­da larga.
- **Un comprador no recibe su email**: dile que entre a "Mi cuenta" â€” las
  entradas siempre estÃ¡n ahÃ­. El comando `resend_pending_ticket_emails`
  reintenta los envÃ­os fallidos cada 10 minutos de todos modos.

## 9. Despliegue 100% gratuito (MVP/demo)

Para presentar el MVP sin costo, con `clubrave.pe` ya en Cloudflare (DNS
Full):

| Pieza | Servicio | Notas |
|---|---|---|
| Tienda | Vercel Hobby | Root Directory `apps/store` |
| Panel | Vercel Hobby (2Âº proyecto) | Root Directory `apps/organizer` |
| API | Render Web Service, Docker | `backend/Dockerfile`. Se duerme tras 15 min sin trÃ¡fico |
| Postgres | Neon free | No expira (el free de Render se borra a los 30 dÃ­as) |
| ImÃ¡genes | Cloudflare R2 | Custom domain vÃ­a el mismo DNS del dominio |
| Email | Resend (100/dÃ­a) o Brevo (300/dÃ­a) | SMTP, sin cambios de cÃ³digo |
| Cron | `.github/workflows/cron.yml` | Sustituye el cron del hosting (Render free no trae uno) |
| Anti-sueÃ±o | cron-job.org / UptimeRobot | Ping a `/api/health/` cada 5â€“10 min |

Pasos:

1. **Neon**: crear proyecto, copiar `DATABASE_URL` con `?sslmode=require`.
2. **Render**: Web Service Docker, Root Directory `backend`. Cargar las
   variables de la secciÃ³n 3. `ALLOWED_HOSTS=api.clubrave.pe`. Health
   Check Path `/api/health/`. Probar primero en `*.onrender.com`.
3. **Datos iniciales**: correr `create_organizer` / `seed_demo` en local
   con `DATABASE_URL` apuntando a Neon (el shell de Render no es gratis).
4. **R2**: crear bucket + API token (Object Read & Write) â†’ da
   `AWS_S3_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
   Conectar `cdn.clubrave.pe` como Custom Domain del bucket (activo solo
   si el DNS estÃ¡ en Cloudflare, que ya lo estÃ¡).
5. **Vercel**: importar el repo dos veces con las variables de la secciÃ³n
   3 (`NEXT_PUBLIC_API_URL`, y `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_STORE_URL`
   segÃºn la app).
6. **DNS en Cloudflare**: `@`/`www` â†’ Vercel (tienda), `panel` â†’ Vercel
   (panel), `api` â†’ Render, `cdn` â†’ R2, mÃ¡s los registros SPF/DKIM de
   Resend/Brevo.
7. **Secrets del repo** (Settings â†’ Secrets â†’ Actions) para
   `cron.yml`: `SECRET_KEY`, `ALLOWED_HOSTS`, `DATABASE_URL`,
   `CORS_ALLOWED_ORIGINS`, `TICKET_SIGNING_KEYS`, `TICKET_SIGNING_KEY_ID`,
   y para el segundo job `DEFAULT_FROM_EMAIL`/`EMAIL_HOST*`.
8. VerificaciÃ³n: secciÃ³n 5 completa, con `PAYMENT_GATEWAY=fake`.

**Avisos:**

- **Uso comercial**: los tÃ©rminos de Vercel Hobby lo prohÃ­ben. Sirve para
  demo/pruebas; antes de vender entradas reales, migrar a Vercel Pro o a
  Cloudflare Pages/Workers (`@opennextjs/cloudflare`, gratis y comercial).
- **Cold start de Render**: la API tarda 30â€“60 s en despertar tras estar
  dormida. El ping periÃ³dico lo evita; de todos modos, visitarla antes de
  cualquier demo.
- **Cron de GitHub Actions es aproximado**: puede atrasarse varios
  minutos. Aceptable para el MVP; migrar a un scheduler real al pasar a
  un plan pago.
- **Pagos**: con `fake` no se cobra dinero real. Activar Izipay
  (`izipay-activacion.md`) antes del evento real.
- **LÃ­mites**: Neon 0.5 GB y Resend 100/dÃ­a alcanzan para una demo o un
  evento chico; para miles de compradores, el email es lo primero que se
  queda corto.

