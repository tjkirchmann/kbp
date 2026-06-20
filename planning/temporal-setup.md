# Temporal Self-Host Setup

## Context

KBP runs background work via **Procrastinate** (Postgres-backed task queue) —
see `src/backend/app/core/procrastinate.py` and the `procrastinate_worker`
compose service. We want to add **Temporal** as a self-hosted service so we can
reasonably kick off durable, multi-step workflows from the **Python SDK**.

For now it's self-host only (a single Docker stack). If the project grows we'll
migrate to **Temporal Cloud**. So the design priority — beyond "just works
locally" — is that the eventual cloud migration is **ergonomic**: ideally an
env-var change with no code edits.

This is additive. Procrastinate stays as-is for the existing cron/sync
machinery; Temporal is the new home for durable workflows.

---

## Goals / Non-goals

- **Goal:** Temporal server + Web UI + a Python worker in `docker-compose.yml`,
  executing a real workflow end-to-end.
- **Goal:** One connection seam (`get_temporal_client()`) so moving to Temporal
  Cloud = setting env vars (API key + TLS + namespace/address), no code changes.
- **Goal:** A sample workflow + activity + starter that proves it works and acts
  as the copy-paste template for future workflows.
- **Non-goal:** Elasticsearch / advanced-visibility tuning, mTLS, multi-cluster,
  HA, dynamic-config tuning. Postgres-native visibility only.
- **Non-goal:** Migrating existing Procrastinate tasks to Temporal.
- **Non-goal:** Production self-host hardening — the target is managed Cloud, so
  the `auto-setup` image is acceptable for dev.

---

## Approach

### 1. Temporal server (docker-compose) — lean, reuse existing Postgres

Add three services, backed by the **existing `db` Postgres 16** (no new DB
container — keeps it to one stack):

- **`temporal`** — `temporalio/auto-setup`. Env: `DB=postgres12` (the postgres12
  plugin supports PG 12+, incl. 16), `POSTGRES_SEEDS=db`,
  `POSTGRES_USER/PWD=postgres`, `DBNAME=temporal`,
  `VISIBILITY_DBNAME=temporal_visibility`. `auto-setup` creates both databases
  and runs schema setup on first boot. Exposes `7233`, `depends_on: db`. Add a
  healthcheck so the worker can wait for `service_healthy`.
- **`temporal-ui`** — `temporalio/ui` on `8080`, `TEMPORAL_ADDRESS=temporal:7233`.
- **`temporal-admin-tools`** — `temporalio/admin-tools` (sleeps; provides the
  `temporal` CLI inside the stack via `docker compose exec`).

**Tradeoff:** sharing the app Postgres couples Temporal storage with app data
locally. That's fine for dev and keeps the stack to one DB; the migration target
is managed Temporal Cloud, so this never reaches prod.

### 2. Python SDK + the migration seam

- Add `temporalio` to `src/backend/pyproject.toml` (resolve current-stable
  version at build via `uv`).
- **`src/backend/app/core/temporal.py`** — `async def get_temporal_client()`,
  mirroring the role of `app/core/procrastinate.py`. **This is the single
  cloud-migration seam:**
  - Local self-host: plain `Client.connect(target_host=settings.temporal_address,
    namespace=settings.temporal_namespace)`.
  - Temporal Cloud: if `settings.temporal_api_key` is set → add `api_key=...` +
    `tls=True`; else if `settings.temporal_tls` → `tls=True`.
  - Same worker/starter code in both worlds — migration is an env change.
- **`src/backend/app/temporal/`** package (parallels `app/tasks/`):
  - `workflows.py` — sample `GreetingWorkflow`, using the standard
    `workflow.unsafe.imports_passed_through()` pattern (avoids the workflow
    sandbox import error) + `workflow.execute_activity`.
  - `activities.py` — sample `compose_greeting` activity.
  - `worker.py` — entrypoint (`python -m app.temporal.worker`): connect with a
    small retry loop (server schema setup takes time), build the `Worker` on
    `settings.temporal_task_queue` with the workflows + activities, `worker.run()`.
    Mirrors `app/worker.py`.
  - `starter.py` — `python -m app.temporal.starter`: gets the client, starts
    `GreetingWorkflow`, prints the result. Proves "kick off a workflow."

### 3. Config

Add to `Settings` in `src/backend/app/core/config.py`:

```python
temporal_address: str = "temporal:7233"
temporal_namespace: str = "default"
temporal_task_queue: str = "kbp-default"
temporal_tls: bool = False
temporal_api_key: str = ""
```

### 4. Worker compose service

`temporal_worker` mirroring `procrastinate_worker`: build from `src/backend`,
`command: python -m app.temporal.worker`, `env_file: .env`,
`TEMPORAL_ADDRESS=temporal:7233` (+ `DATABASE_URL` for parity so activities can
hit the DB later), `depends_on: temporal` (`condition: service_healthy`).

### 5. Wiring / docs

- `.env.example` — Temporal block with local defaults **and** commented Temporal
  Cloud values, documenting the env-only migration path.
- `Makefile` — `logs-temporal`, `logs-temporal-worker` shortcuts; a
  `temporal-run` convenience that runs the starter via `docker compose run`.
- `AGENTS.md` — short note: new services, the `get_temporal_client()` seam, and
  the shared-Postgres tradeoff.

---

## Affected files

| File | Change |
|---|---|
| `docker-compose.yml` | + `temporal`, `temporal-ui`, `temporal-admin-tools`, `temporal_worker` |
| `src/backend/pyproject.toml` | + `temporalio` dependency |
| `src/backend/app/core/temporal.py` | **new** — `get_temporal_client()` (cloud seam) |
| `src/backend/app/core/config.py` | + Temporal settings |
| `src/backend/app/temporal/__init__.py` | **new** |
| `src/backend/app/temporal/workflows.py` | **new** — sample `GreetingWorkflow` |
| `src/backend/app/temporal/activities.py` | **new** — sample activity |
| `src/backend/app/temporal/worker.py` | **new** — worker entrypoint |
| `src/backend/app/temporal/starter.py` | **new** — kick-off script |
| `.env.example` | + Temporal env block (local + cloud notes) |
| `Makefile` | + log/run shortcuts |
| `AGENTS.md` | brief note on services + migration seam |

---

## Verification

1. `docker compose config` — validates the merged compose file.
2. `docker compose up -d db temporal temporal-ui temporal_worker` — confirm
   `temporal` reaches healthy and the worker logs it's polling `kbp-default`.
3. `docker compose run --rm temporal_worker python -m app.temporal.starter` →
   prints the greeting result.
4. Web UI at `http://localhost:8080` → the completed workflow execution is visible.
5. **Fallback if Docker can't run in CI/sandbox:** `docker compose config` +
   `python -c` import of every new module to catch syntax / registration errors.
   Report which path was used.

---

## Open questions

- None blocking. Decided to **reuse the existing Postgres** (vs a dedicated
  Temporal DB) per "don't over-optimize / one stack"; tradeoff flagged above.
  Exact image tags + `temporalio` SDK version resolved to current-stable at
  build time.
