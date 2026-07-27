---
title: Setup
nav_order: 3
---

# Setup

emma-cookbook supports two main setup styles. For local development on your own machine, SQLite is the easiest and recommended default. For a fuller deployment that runs the complete stack in containers, the supported path uses Docker with PostgreSQL.

## Local Setup On Your Machine Or For Dev

If you just want to get the project running quickly, this is the easiest place to start.

Use the helper script:

```sh
./scripts/setup_local.sh
```

That creates a local SQLite-backed backend, runs migrations, and creates or updates a superuser for you. The database is stored in `backend/db.sqlite3`.

If you want to choose your own local admin credentials, you can pass them in like this:

```sh
LOCAL_SUPERUSER_USERNAME=admin LOCAL_SUPERUSER_PASSWORD=change-me ./scripts/setup_local.sh
```

If you want to wipe the local data and start fresh again, use:

```sh
./scripts/destroy_local.sh
```

If you want both frontend and backend running together during development, use:

```sh
./scripts/run.sh
```

That launcher reads from `dev_env` by default, starts the Django backend on `http://127.0.0.1:8000`, starts the frontend on `http://127.0.0.1:8080`, and runs migrations before the backend comes up.

SQLite is the recommended default for day-to-day development because it is quick to reset and avoids Docker or PostgreSQL state drift while you are iterating.

## Docker production setup

The supported production path runs PostgreSQL, Redis, Django, Celery worker and beat, and the frontend in Docker. PostgreSQL, Redis, Django, and Ollama are internal-only by default; only the frontend is published.

Run the interactive installer:

```sh
./scripts/setup_docker_production.sh
```

It performs preflight checks, generates the Django and PostgreSQL secrets, initializes the irreversible application mode explicitly, waits for container health checks, and verifies the frontend and API before reporting success. Existing `emma-cookbook` containers or volumes are refused unless setup is deliberately resumed with `--allow-existing`.

For a reproducible non-interactive installation:

```sh
./scripts/setup_docker_production.sh \
  --non-interactive \
  --app-mode single_user \
  --public-url https://example-domain.com \
  --proxy external \
  --frontend-bind 127.0.0.1:8082 \
  --ollama container \
  --vosk default \
  --source registry \
  --version v1.1.0
```

The installer writes `.env.production`, a non-secret `.env` for routine Compose commands, and `.emma-compose.env` for lifecycle scripts. Afterwards these work without exporting `ENV_FILE` or repeating Compose overrides:

```sh
docker compose ps
docker compose logs backend
docker compose up -d
docker compose down
./scripts/update_docker_production.sh v1.2.3
./scripts/export_db.sh
./scripts/import_db.sh backups/cookbook.sql
```

Use `docker-compose.dev.yml` when host access to PostgreSQL, Redis, Django, or Ollama is needed during development:

```sh
ENV_FILE=dev_env docker compose -f docker-compose.yml -f docker-compose.ollama.yml -f docker-compose.dev.yml up -d
```

If Instagram or YouTube downloads need an authenticated session, place a Netscape-format cookie export at `docker-data/import-cookies/cookies.txt`.

### Proxy modes

The installer offers three modes:

- `direct`: publishes the frontend directly, defaulting to `0.0.0.0:80`.
- `bundled`: starts the included Caddy service and keeps the frontend on `127.0.0.1:8080`.
- `external`: does not start Caddy and defaults the frontend to `127.0.0.1:8082`.

For external Caddy:

```caddyfile
cookbook.home.arpa {
    tls internal
    reverse_proxy 127.0.0.1:8082
}
```

The generated public URL and frontend binding may use different ports; clients use the public URL while the external proxy uses the loopback binding.

## Single-user and multi-user mode

Set `APP_MODE=multi_user` (the default) to require individual accounts for writes, or use `APP_MODE=single_user` on a new database to run with one shared owner and no login screen. “Single-user” means one shared identity, not one simultaneous visitor: several people, browsers, and devices can use it together. Favorites, collections, notes, ratings, and preferences are shared. Recipe edits use revision checks. 

Single-user mode is not an access-control boundary: every person or device that can reach the application can change its data and instance settings. Put it behind a trusted LAN, VPN, or authenticated reverse proxy.

The lifecycle is one-way. A single-user instance can be promoted to multi-user mode, but a database that has ever run in multi-user mode cannot be changed to single-user mode. This is enforced in database metadata, including after restores.

Fresh setup calls `initialize_instance_mode --fresh-installation`; imports and upgrades call `--existing-installation`; ordinary backend starts use `--validate-only`. Migration history is never used to guess installation intent.

To promote, stop frontend/backend/worker writes, take a database backup, create the destination account, then run:

```bash
python manage.py promote_to_multi_user USERNAME --dry-run
python manage.py promote_to_multi_user USERNAME --confirm
```

After the command succeeds, set `APP_MODE=multi_user` and restart the backend, worker, beat, and frontend stack together. There is no reverse command.

Bundled Caddy keeps the frontend on loopback HTTP while Caddy serves ports `80` and `443`. After first start, trust the generated root certificate on each client device from:

To update a deployment that uses published release images:

```sh
./scripts/update_docker_production.sh v1.2.3
```
