# ⚽ Football Arena

Football stadium rental and booking platform for the Uzbekistan market.

Three roles share one application: **customers** find and book pitches, **owners**
(arendator) manage their stadiums and approve requests, and **admins** moderate the
platform and take a commission on every completed booking.

- **Backend** — Django 5.2 · DRF · PostgreSQL · Channels (WebSocket) · Celery · Redis
- **Frontend** — React 18 · Vite 6 · TypeScript · Tailwind · shadcn-style Radix UI · TanStack Query
- **Maps** — Yandex Maps JS API 2.1
- **Auth** — phone OTP, Google, Telegram (customers) · username + password (owners, admins)

---

## Table of contents

1. [Quick start with Docker](#quick-start-with-docker)
2. [Local development](#local-development)
3. [Environment variables](#environment-variables)
4. [Seed data and demo logins](#seed-data-and-demo-logins)
5. [API documentation](#api-documentation)
6. [Project layout](#project-layout)
7. [How booking works](#how-booking-works)
8. [Roles and access control](#roles-and-access-control)
9. [Real-time features](#real-time-features)
10. [Tests](#tests)
11. [Production deployment](#production-deployment)
12. [Troubleshooting](#troubleshooting)

---

## Quick start with Docker

Requires Docker Desktop (or Docker Engine + Compose v2).

```bash
cp .env.example .env          # then edit SECRET_KEY and any API keys
docker compose up --build
```

This starts Postgres, Redis, the Django/Daphne backend, a Celery worker, Celery beat,
and the frontend served by nginx.

| Service        | URL                            |
| -------------- | ------------------------------ |
| Frontend       | http://localhost:5173          |
| API            | http://localhost:8000/api/     |
| Swagger UI     | http://localhost:8000/api/docs/ |
| Django admin   | http://localhost:8000/django-admin/ |

Migrations run automatically on backend start. To load demo content:

```bash
docker compose exec backend python manage.py seed_data
```

> The frontend image bakes `VITE_API_URL` / `VITE_WS_URL` in at **build** time.
> If you change them in `.env`, rebuild with `docker compose up --build frontend`.

---

## Local development

Useful when you already have PostgreSQL installed and do not want to run Docker.

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 14+ (16 recommended)
- Redis 7 — **optional**, see the note below

### 1. Database

Create the database and role, then enable the `btree_gist` extension that the
booking overlap constraint depends on:

```sql
CREATE DATABASE arena;
CREATE USER arena WITH PASSWORD 'arena';
GRANT ALL PRIVILEGES ON DATABASE arena TO arena;
\c arena
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

The migration creates the extension too, so this is only needed if your database
user lacks the privilege to do so.

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp ../.env.example ../.env           # edit DATABASE_URL to match your Postgres
python manage.py migrate
python manage.py seed_data
python manage.py runserver 8000
```

`runserver` uses Daphne, so WebSockets work in development without a separate process.

**Running without Redis.** Set `REDIS_ENABLED=False` in `.env`. The dev settings then
fall back to an in-memory cache, an in-memory channel layer and eager Celery tasks.
This is fine for feature work but **must never be used in production** — the in-memory
channel layer does not broadcast across processes, so chat and notifications only reach
clients connected to the same worker.

### 3. Celery (only when `REDIS_ENABLED=True`)

```bash
cd backend
celery -A config worker -l info
celery -A config beat -l info        # in a second terminal
```

Beat drives the scheduled jobs: expiring stale pending bookings, marking finished
bookings as completed, and pruning old notifications.

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Opens on http://localhost:5173 and proxies nothing — it talks to `VITE_API_URL`
directly, so the backend's `CORS_ALLOWED_ORIGINS` must include the dev origin.

Other scripts:

```bash
npm run build      # tsc --noEmit && vite build
npm run lint       # type-check only
npm run preview    # serve the production build locally
```

---

## Environment variables

There are two templates:

- **`.env.example`** (repository root) — everything the backend and Docker Compose need.
- **`frontend/.env.example`** — the two public values Vite inlines into the bundle.

Copy both, then fill in the values below. The full annotated list lives in the
templates themselves; these are the ones you are most likely to need.

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | Django signing key. Generate a long random string; never reuse the sample. |
| `DEBUG` | `True` locally, `False` in production. |
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev`, `config.settings.prod` or `config.settings.test`. |
| `DATABASE_URL` | `postgres://user:pass@host:5432/dbname`. |
| `REDIS_ENABLED` | `False` runs dev with no Redis at all. Always `True` in production. |
| `REDIS_URL`, `CELERY_BROKER_URL` | Redis endpoints for Channels and Celery. |
| `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Comma separated. No wildcards in production. |
| `OTP_DEBUG_RETURN_CODE` | Returns the OTP in the API response. Development only — the production settings force it off. |
| `SMS_PROVIDER` | `console` prints the code to stdout; `eskiz` / `playmobile` send real SMS. |
| `GOOGLE_CLIENT_ID` | Enables the Google sign-in button. Leave blank to hide it. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Enable the Telegram login widget. |
| `YANDEX_MAPS_API_KEY` | Required for the map on the home and stadium pages. |
| `CLOUDINARY_URL` | Optional. Blank stores uploads on the local filesystem. |
| `VITE_API_URL`, `VITE_WS_URL` | Frontend only. Public by definition — never put a secret here. |

**No secret ever reaches the browser.** The Yandex key, Google client id and Telegram
bot username are public values delivered at runtime by `GET /api/config/`, so rotating
one does not require rebuilding the frontend.

---

## Seed data and demo logins

```bash
python manage.py seed_data           # idempotent — safe to re-run
python manage.py seed_data --flush   # wipe stadiums/bookings/reviews first
```

Creates amenities, an admin, three owners with stadiums across Tashkent, customers,
a spread of bookings in every status, and reviews on completed bookings.

| Role | How to sign in |
| --- | --- |
| Admin | `admin` / `Admin12345!` |
| Owner | `owner_bunyodkor`, `owner_registon`, `owner_vodiy` / `Owner12345!` |
| Customer | Phone + OTP, e.g. `+998911111110`. With `OTP_DEBUG_RETURN_CODE=True` the code comes back in the API response and the UI shows it in a toast. |

Passwords come from `SEED_ADMIN_PASSWORD` / `SEED_OWNER_PASSWORD`. **Change them
before deploying anywhere reachable.**

All three roles use the same `/login` page; the app routes you to `/`, `/owner` or
`/admin` based on the role in your token.

---

## API documentation

With the backend running:

- **Swagger UI** — http://localhost:8000/api/docs/
- **ReDoc** — http://localhost:8000/api/redoc/
- **OpenAPI schema** — http://localhost:8000/api/schema/

Every non-2xx response uses the same envelope, which the frontend's `toApiError`
helper understands:

```json
{ "success": false, "code": "slot_unavailable", "message": "…", "errors": {} }
```

A booking conflict (HTTP 409) adds an `alternatives` array of free windows on the same
day, which the booking page renders as one-tap chips.

---

## Project layout

```
.
├── backend/
│   ├── config/
│   │   ├── settings/        base · dev · prod · test
│   │   ├── asgi.py          HTTP + WebSocket routing
│   │   └── celery.py        worker config and beat schedule
│   ├── apps/
│   │   ├── users/           custom user, OTP, JWT, Google/Telegram sign-in
│   │   ├── stadiums/        stadiums, images, working hours, blackouts, availability
│   │   ├── bookings/        the booking engine and its transaction guarantees
│   │   ├── reviews/         reviews and owner replies
│   │   ├── chat/            conversations, messages, WebSocket consumer
│   │   ├── notifications/   in-app, email and Telegram delivery
│   │   ├── payments/        provider-agnostic scaffolding (Click/Payme/Uzum)
│   │   ├── analytics/       revenue and growth aggregation
│   │   ├── admin_panel/     admin-only endpoints
│   │   └── common/          settings singleton, audit log, pagination, errors
│   └── tests/
├── frontend/
│   └── src/
│       ├── api/             thin typed wrappers per domain
│       ├── components/      ui · shared · layout · admin · owner · charts
│       ├── pages/           auth · user · owner · admin · chat
│       ├── hooks/           debounce, geolocation, notification socket
│       ├── stores/          zustand auth store
│       ├── lib/             axios client, tokens, formatting, constants
│       └── types/api.ts     hand-written mirror of every serializer
├── docker-compose.yml
└── .env.example
```

---

## How booking works

A customer picks a stadium, a date, a start time and a duration. The end time and the
price are derived, never submitted:

```
total_price = stadium.price_per_hour × duration_hours
```

The client sends only `stadium_id`, `date`, `start_time` and `duration_hours`. **The
server recalculates the price from the stadium row every time** — a tampered payload
cannot change what you pay.

### Preventing double bookings

Two people tapping "book" on the same slot at the same moment is the failure this
system is built to survive. Four independent layers stop it, so a bug in any one of
them cannot let a double booking through:

1. **`select_for_update` on the stadium row** serialises concurrent attempts for the
   same stadium.
2. **An overlap scan inside that lock** rejects the request with a friendly message
   and a list of alternatives.
3. **A partial unique constraint** (`unique_active_booking_slot`) blocks an identical
   stadium + date + start time among active bookings.
4. **A PostgreSQL exclusion constraint** (`booking_no_overlap`) over
   `tstzrange(starts_at, ends_at, '[)')` with `stadium =`, backed by `btree_gist`.
   This is the last word: the database itself refuses overlapping ranges, even if
   application code is bypassed entirely.

On conflict the API returns **409** with the message
`"Bu vaqt allaqachon band qilingan. Boshqa vaqtni tanlang."` and up to five
alternative windows.

### Lifecycle

```
PENDING ──approve──► APPROVED ──(after end time)──► COMPLETED ──► review allowed
   │                     │
   ├──reject────────► REJECTED (reason required)
   └──cancel────────► CANCELLED (reason required, within the cancel window)
   └──(timeout)─────► EXPIRED
```

Reviews are only possible on a `COMPLETED` booking, one per booking, 1–5 stars.

---

## Roles and access control

| | Customer | Owner | Admin |
| --- | --- | --- | --- |
| Created by | self, via phone OTP / Google / Telegram | **admin only** | `createsuperuser` / seed |
| Home route | `/` | `/owner` | `/admin` |
| Can browse & book | yes | no | no |
| Can manage stadiums | no | own only | all |
| Can moderate | no | no | yes |

- Owners cannot self-register. The only place an owner account is created is
  **Admin → Arendatorlar → Arendator qo'shish**.
- Only `APPROVED` stadiums are visible to customers. New and edited stadiums enter a
  moderation queue; the admin can approve, reject, request changes, or block, and every
  outcome except approval requires a written note that the owner sees verbatim.
- Every route is guarded twice: `RequireRole` on the client for navigation, and DRF
  permission classes on the server for authority. `ArenaJWTAuthentication` re-checks the
  blocked flag on every request, so blocking a user takes effect immediately rather than
  when their token expires.
- Admin actions (moderation, blocking, deleting, settings changes) are written to an
  audit log with actor, target, reason and IP.

---

## Real-time features

Channels serves two WebSocket routes. Both authenticate with a JWT passed as a
`?token=` query parameter, and close with **4401** (unauthenticated) or **4403**
(not a participant).

| Route | Purpose |
| --- | --- |
| `ws/chat/<conversation_id>/` | Messages, typing indicators, read receipts |
| `ws/notifications/` | Live booking and moderation notifications |

The chat room reconnects with capped exponential backoff and **falls back to the REST
`send` endpoint when the socket is down**, so a dropped connection never loses a
message.

---

## Tests

```bash
cd backend
pytest                    # 145 tests
pytest -q --no-header
pytest tests/test_bookings.py -k overlap
```

Tests run against a real PostgreSQL database, not SQLite — the exclusion constraint
that prevents double bookings only exists in Postgres, so mocking it away would test
nothing. Coverage spans authentication and OTP, stadium moderation, the booking engine
including concurrent overlap attempts, reviews, and per-role permission boundaries.

Frontend type checking:

```bash
cd frontend
npm run lint
```

---

## Production deployment

1. **Settings** — `DJANGO_SETTINGS_MODULE=config.settings.prod`, `DEBUG=False`.
2. **Secrets** — generate a fresh `SECRET_KEY`; change every seeded password.
3. **Hosts and origins** — set `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` and
   `CSRF_TRUSTED_ORIGINS` to your real domains. The production settings reject a
   wildcard CORS origin.
4. **Redis is mandatory** — `REDIS_ENABLED=True`. The in-memory channel layer cannot
   broadcast across processes.
5. **OTP** — `OTP_DEBUG_RETURN_CODE` is forced off in production, and `SMS_PROVIDER`
   must be a real gateway (`eskiz` or `playmobile`) with credentials.
6. **TLS** — terminate HTTPS at your proxy. The production settings enable HSTS, secure
   cookies and `SECURE_SSL_REDIRECT`. Use `wss://` for `VITE_WS_URL`.
7. **Static and media** — run `collectstatic`; serve media from Cloudinary or S3 by
   setting `CLOUDINARY_URL` rather than from the app container.
8. **Processes** — Daphne for HTTP + WebSocket, plus at least one Celery worker and one
   beat scheduler.
9. **Frontend** — `npm run build` and serve `dist/` from nginx or a CDN.
   `frontend/nginx.conf.template` shows the SPA fallback and cache headers; the
   nginx image renders it with envsubst so `PORT` can be set by the host.
10. **Database** — enable `btree_gist`, take regular backups, and run migrations before
    releasing new application containers.

Already handled in the code: JWT rotation with a blacklist, hashed passwords, OTP
stored only as a SHA-256 digest, rate limiting on OTP/login/booking/chat endpoints,
upload type and size validation, ORM-only queries, and security headers.

---

## Troubleshooting

**`btree_gist` / exclusion constraint error on migrate.** The database user cannot
create extensions. Connect as a superuser and run
`CREATE EXTENSION IF NOT EXISTS btree_gist;` in the target database, then migrate again.

**WebSockets connect then close immediately.** Check the close code. `4401` means the
token was missing or expired — the frontend passes it as `?token=`. `4403` means the
account is not a participant in that conversation.

**Chat or notifications only reach some clients.** You are running with
`REDIS_ENABLED=False`. The in-memory channel layer is per-process; start Redis and set
`REDIS_ENABLED=True`.

**The map area is blank.** `YANDEX_MAPS_API_KEY` is unset. It is served through
`GET /api/config/`, so set it in the backend `.env` and reload — no frontend rebuild.

**No OTP arrives.** With `SMS_PROVIDER=console` the code is printed to the backend
console, and with `OTP_DEBUG_RETURN_CODE=True` it is also returned in the API response
and shown in a toast. Both are development-only.

**`otp_throttled` when requesting a code.** Working as intended: resends are rate
limited per phone. The message states how many seconds remain.

**CORS errors in the browser.** Add your frontend origin to `CORS_ALLOWED_ORIGINS` and
restart the backend.

**Frontend ignores a changed `VITE_API_URL` under Docker.** Those values are inlined at
image build time — rebuild with `docker compose up --build frontend`.
