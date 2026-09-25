# Running the whole app with Docker

`docker compose up` starts the entire Dhaka Tesla Pool app — database, API and
web frontend — from production builds, in one command.

## Quick start

```bash
# 1. Create your local config (first time only)
cp .env.example .env

# 2. Build and start every service
docker compose up --build

# 3. Open the app
open http://localhost:3000
```

Stop with `Ctrl-C` (`docker compose up` runs in the foreground). To run in the
background:

```bash
docker compose up -d --build
docker compose logs -f          # tail all services
docker compose down             # stop containers (keeps data)
```

> **Compose reads your `.env` for you.** All `${VAR}` placeholders in
> `docker-compose.yml` are resolved from a `.env` file in the repo root
> automatically — creating `.env` from `.env.example` is all you need.
> `.env.example` contains only non-secret placeholders.

## What `docker compose up` does

1. **`db`** — starts `postgres:16` with the credentials from `.env`
   (`POSTGRES_USER/PASSWORD/DB`) and a named volume (`db_data`) so data
   survives restarts. It is considered "healthy" once `pg_isready` succeeds.
2. **`api`** — builds `backend/Dockerfile` (TypeScript `tsc` build) and waits
   for `db` to be healthy. On every startup its entrypoint:
   - runs `prisma migrate deploy` against the fresh/flexible database,
   - runs `prisma db seed` to (re)create the demo fixtures — see below,
   - starts the Express server on `PORT` (default `4000`).
   It stays healthy while `GET /health` returns `200`.
3. **`web`** — builds `frontend/Dockerfile` (`next build`, with
   `NEXT_PUBLIC_API_URL` set to the compose-internal `http://api:4000`) and
   waits for `api` to be healthy before starting `next start` on port `3000`.

Run order and readiness are enforced with each service's `depends_on:
condition: service_healthy`, so `web` never starts before `api` has migrated,
seeded and is serving; `api` never starts before Postgres accepts connections.

## Service responsibilities

| Service | Image / build | Port (internal) | Healthcheck | Purpose |
| --- | --- | --- | --- | --- |
| `db` | `postgres:16` | 5432 | `pg_isready` | PostgreSQL persistence (named volume `db_data`) |
| `api` | `./backend/Dockerfile` | 4000 | `GET /health` | Express + Prisma API: auth, rides, pooling, driver flow |
| `web` | `./frontend/Dockerfile` | 3000 | `GET /login` | Next.js BFF: pages + proxy, publishes to host `3000` |

Networking notes:

- `api` and `web` talk to each other by **compose service name**
  (`api`, `db`), not `localhost`.
- The web app is the only service published to your host
  (`http://localhost:3000`). The API lives *inside* the compose network at
  `http://api:4000`; the browser never calls it directly — everything goes
  through the Next.js BFF proxy.
- To expose the API to your host (e.g. for `curl` debugging), uncomment the
  `ports:` block under `api` in `docker-compose.yml` and pick a free host port
  (if something already uses `4000` locally, use e.g. `4001:4000`).

## Seeded demo data

The API entrypoint re-seeds on every start; the seed is idempotent so running
it many times is safe. After the first `docker compose up`, these accounts
exist (all share the password `password123`):

| Name | Role | Tesla | Email | Phone |
| --- | --- | --- | --- | --- |
| Jashim | Driver | Bullet (3 seats) | jashim@example.com | 01730000001 |
| Nusrat | Passenger | — | nusrat@example.com | 01730000002 |
| Rafiq | Passenger | — | rafiq@example.com | 01730000003 |
| Shirin | Passenger | — | shirin@example.com | 01730000004 |

Eight Dhaka zones (Banani, Gulshan, Mohakhali, Dhanmondi, Mirpur, Uttara,
Farmgate, Bashundhara) are also seeded. Sign in as Jashim to drive the pool
through `http://localhost:3000/driver/dashboard`, or as any passenger to book
a ride.

## How to reset the database for a clean start

The database lives in the named volume `db_data`. To wipe it and start fresh:

```bash
docker compose down -v    # stop containers AND delete the volume
docker compose up --build # migrate + seed a brand-new database
```

`-v` also removes the volumes declared in the compose file. If you only want to
reset data without rebuilding images, `docker compose down -v && docker compose up`
works too.

## Useful commands

```bash
docker compose ps                       # status + health of each service
docker compose logs -f api              # watch the API (migrations + seed output)
docker compose logs web                 # Next.js logs
docker compose exec db psql -U tesla -d dhaka_tesla_pool   # inspect the DB
docker compose exec api node dist/server.js                # (already running; use logs)
```

## Troubleshooting

- **`api` keeps restarting / unhealthy**: check `docker compose logs api`. The
  most common cause is a bad `DATABASE_URL` (credentials must match the
  `POSTGRES_*` values) or a pending migration that Prisma could not apply.
- **`web` never becomes healthy**: it waits for `api` to be healthy first.
  Confirm `api` is `healthy` in `docker compose ps`.
- **Port `3000` already in use**: set `WEB_PORT=3001` in `.env` and re-run
  `docker compose up -d`.
- **Building fails on the Google Fonts fetch**: `next/font/google` downloads
  fonts at build time; the build needs network access.
- **Reaching the API directly fails from the host**: remember the API is not
  published by default; see *Service responsibilities* above.