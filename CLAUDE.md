# KBP - Agentic Coding Pair Programmer Guidelines and Beliefs

Ask, don't assume. If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements.

Simplest solution first. Always implement the simplest thing that could work. Do not add abstractions or flexibility that weren't explicitly requested.

Don't touch unrelated code. If a file or function is not directly part of the current task, do not modify it, even if you think it could be improved.

Flag uncertainty explicitly. If you are not confident about an approach or technical detail, say so before proceeding. Confidence without certainty causes more damage than admitting a gap.

I'm always open to ideas on better ways to do things. Please don't hesitate to suggest a better way, or one that has long lasting impact over a tactical change.

# KBP — Agent Orientation Guide

Start here. Read this before touching any file.

---

## What this repo is

**Kirchmann Bowl Pool (KBP)** — a private web app for a family college football bowl pool. ~50–60 users pick winners and margins for post-season games and get scored. Two admins manage the pool. See `kbp-context.md` for full product context and `DESIGN.md` for visual/component design rules.

---

## Repo layout

```
kbp/
├── AGENTS.md                  ← you are here
├── DESIGN.md                  ← visual design system (read before any UI work)
├── kbp-context.md             ← product context, features, deferred decisions
├── PROJECT_CHARTER.md         ← original technical scaffold spec
├── Makefile                   ← dev commands (make up, make migrate, etc.)
├── docker-compose.yml         ← frontend, backend, db, temporal + workers, discord_bot
├── .env / .env.example        ← secrets (never commit .env)
│
├── src/
│   ├── frontend/              ← Vite + React 18 + TypeScript
│   │   ├── src/
│   │   │   ├── main.tsx       ← app entry (Clerk + QueryClient + Router)
│   │   │   ├── App.tsx        ← route definitions
│   │   │   ├── index.css      ← Tailwind import + CSS variables + dot-grid bg
│   │   │   ├── pages/         ← one file per route
│   │   │   ├── components/    ← shared components; ui/ is shadcn output
│   │   │   ├── services/      ← TanStack Query hooks (server state)
│   │   │   ├── store/         ← Zustand slices (UI state only)
│   │   │   └── lib/utils.ts   ← cn() helper
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── backend/               ← FastAPI + SQLAlchemy 2.0 async
│       ├── main.py            ← app factory, CORS, lifespan, route mounting
│       ├── requirements.txt
│       ├── alembic.ini
│       ├── alembic/           ← migration files
│       └── app/
│           ├── core/
│           │   ├── config.py  ← pydantic-settings (reads .env)
│           │   ├── database.py← async engine, SessionLocal, Base
│           │   └── auth.py    ← Clerk JWT → user_id
│           ├── models/        ← SQLAlchemy ORM models
│           ├── schemas/       ← Pydantic request/response
│           ├── routers/       ← FastAPI routers (thin — call services)
│           └── services/      ← business logic (no ORM calls here)
│
└── .claude/
    └── skills/                ← load these for domain-specific work
        ├── frontend-component.md  ← UI components (includes full design system)
        ├── frontend-logic.md      ← TanStack Query + Zustand patterns
        ├── backend.md             ← FastAPI router/service/model patterns
        └── migration.md           ← Alembic workflow
```

---

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript (strict) + Vite | |
| Styling | Tailwind CSS 4 + shadcn/ui + Radix UI | v4 — `@theme` in CSS, no JS config needed |
| Icons | Lucide React | Only icon library; see DESIGN.md for assignments |
| Font | Geist Sans (`@fontsource/geist`) | Imported in `index.css` |
| Data fetching | TanStack Query v5 | All server state |
| Client state | Zustand | UI state only (modals, filters) |
| Routing | React Router v6 | |
| Auth | Clerk v6 (`@clerk/react`) | Google SSO primary, email OTP fallback |
| Backend | FastAPI + Pydantic v2 + Uvicorn | |
| ORM | SQLAlchemy 2.0 async | asyncpg driver; Railway injects `postgresql://` — `database.py` replaces prefix to `postgresql+asyncpg://` |
| Migrations | Alembic | Sync URL used in `env.py` (strip `+asyncpg`) |
| Database | Postgres 16 | Docker locally; Railway Postgres plugin in prod |
| AI | OpenAI SDK | Direct, not via framework |
| Deploy | Railway | Auto-deploys `main` branch; separate frontend + backend services |

---

## Dev workflow

```bash
make up          # start all 3 containers (builds if needed)
make down        # stop containers
make migrate     # run alembic upgrade head inside backend container
make migrate-new # generate a new migration (prompts for name)
make migrate-down# rollback one migration
```

Frontend dev server: `http://localhost:5173` (HMR — changes reflect instantly)
Backend API + docs: `http://localhost:8000/docs`

---

## Linting & pre-commit

Linting/formatting is orchestrated by [pre-commit](https://pre-commit.com) via
`.pre-commit-config.yaml` at the repo root:

- **Backend** — [Ruff](https://docs.astral.sh/ruff/) lints and formats `src/backend`
  (config in `src/backend/pyproject.toml`).
- **Frontend** — ESLint + Prettier lint and format `src/frontend`
  (`eslint.config.js`, `.prettierrc.json`; run as `npm run lint` / `npm run format`).

```bash
make install-hooks  # one-time: install the git pre-commit hook (needs uv)
make lint           # lint + format the whole repo (pre-commit run --all-files)
```

Frontend tooling requires `npm install` in `src/frontend` first.

---

## Key conventions

### Frontend

- **CSS variables** are in `src/frontend/src/index.css` under `:root` and `@theme`. Tailwind v4 reads `@theme` directly — there is no JS config file.
- **Semantic color classes** (`bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, etc.) are all wired up and ready to use.
- **Page background** is a dark radial gradient on `html` (`bg-background` base + layered blue ellipses). `body` is transparent — don't apply `bg-background` to page wrappers; let the gradient show through.
- **Container hierarchy**: outer panels get `bg-card border border-border rounded-xl shadow-sm`; inner cards get no border, just `rounded-lg hover:bg-muted/60`.
- **shadcn/ui** — install components with `npx shadcn@latest add <name>`. Output goes to `src/components/ui/`.
- **No inline styles**. No CSS modules. Tailwind classes only.
- **Icons**: `lucide-react` only. `size-4` inline, `size-5` standalone. Always paired with text unless inside a `<Tooltip>`.
- **No Inline Components** - exceptions should only be very simple componenets, otherwise we should prepare for any potential resuability and proper organization

### Backend

- Routers are thin — validate, call service, return typed response. No ORM in routers.
- All routes touching user data require `Depends(get_current_user)`.
- Async all the way: `async def`, `await session.execute()`.
- New model → import it in `alembic/env.py` → `make migrate-new` → read the file → `make migrate`.

### Git

- `main` branch auto-deploys to Railway.
- Never commit `.env`.

---

## Skills — when to load them

Before starting a task, tell the agent which skill to use. The Makefile also prints them:

```bash
make frontend-component   # UI component work
make frontend-logic       # TanStack Query / Zustand / auth hooks
make frontend-organize    # refactor: extract inline components, remove inline styles, fix raw colors
make backend              # new route, service, or model
make migration            # schema change
make data-modeling        # adding tables, columns, or relationships
make struct-output        # LLM structured-output jobs (pydantic-ai + OpenRouter + Temporal)
```

| Skill file | Use when |
|---|---|
| `.claude/skills/frontend-component.md` | Building or editing any UI component — contains the full design system |
| `.claude/skills/frontend-logic.md` | TanStack Query hooks, Zustand slices, auth patterns |
| `.claude/skills/backend.md` | New FastAPI route, service, or model |
| `.claude/skills/migration.md` | Any Alembic migration — includes the Postgres ENUM gotcha |
| `.claude/skills/data-modeling.md` | Schema decisions — soft deletes, table conventions, CFBD API shape, all locked-in decisions |
| `.claude/skills/struct-output/SKILL.md` | LLM structured-output jobs — registry-driven pydantic-ai + OpenRouter + Temporal pattern |

---


## Temporal (durable workflows)

Self-hosted Temporal runs alongside the app for all background work — durable
workflows, scheduled syncs, and the ESPN poller. The **CFBD
dimension sync** has migrated here as `CfbdDimsWorkflow`
(`app/temporal/cfbd_dims/`): it fans out one activity per dimension entity
(teams/conferences/venues/coaches/draft) with per-activity retry, and runs on a
native **Temporal Schedule** (nightly `0 3 * * *`, overlap=SKIP) instead of the
DB-cron admin panel — so it no longer appears in the admin Sync panel.

- **Compose services**: `temporal` (`auto-setup`), `temporal-ui` (`localhost:8080`),
  `temporal-admin-tools` (the `temporal`/`tctl` CLI), and `temporal_worker` (Python
  worker). The server reuses the existing `db` Postgres in its own `temporal` /
  `temporal_visibility` databases — one stack, one Postgres. That shared-DB coupling
  is a deliberate dev-only tradeoff; the migration target is managed **Temporal
  Cloud**, so it never reaches prod.
- **The one seam that matters**: `app/core/temporal.py::get_temporal_client()`.
  Everything (worker, starters, future routes) connects through it. Local self-host
  vs. Temporal Cloud is purely env-driven (`TEMPORAL_API_KEY` + address/namespace) —
  **migrating to Cloud is an env-var change, no code edits**. See `.env.example`.
- **Try it**: `make up`, then `make temporal-run` → kicks off the sample
  `GreetingWorkflow` and prints the result; view the execution at `localhost:8080`.
  `make temporal-cfbd-dims` triggers an off-schedule CFBD-dims run ("Run now").
- **Add a workflow**: write it in `app/temporal/workflows.py` (push I/O into
  `activities.py`), then register both in `app/temporal/worker.py`. A larger
  workflow can get its own package — see `app/temporal/cfbd_dims/`
  (`activities.py` + `workflow.py` + `schedule.py`) as the worked example,
  including how to drive it with a Temporal Schedule reconciled at worker boot.
- **Struct-output schedules are gated behind `TEMPORAL_RECONCILE_STRUCT_OUTPUT`**
  (default `false`). This prevents the worker from firing LLM calls via OpenRouter
  on every dev startup. Enable in prod only. See `config.py` and `.env.example`.

## Check the logs when debugging backend, inspect the code first for frontend and if you can't figure out rendering issues, use playwright mcp

Every service writes to stdout/stderr — Docker Compose captures it all. Use these
`make` targets (or `docker compose logs` directly):

```bash
make logs                  # every service (--follow), noisy — use sparingly
make logs-backend          # FastAPI server logs, SQLAlchemy queries, stack traces
make logs-frontend         # Vite HMR, build warnings, console errors
make logs-worker           # Temporal Python worker (workflow/activity logs)
make logs-db               # Postgres startup, connections, slow queries
make logs-temporal         # Temporal server (auto-setup schema, health checks)
make logs-temporal-worker  # same as logs-worker
```

For the Discord bot (not covered by a `make` target):

```bash
docker compose logs -f discord_bot
```

**Tips:**

- Narrow the tail: `docker compose logs --tail=100 backend`
- Filter with `grep`: `docker compose logs backend 2>&1 | grep ERROR`
- Time-slice: `docker compose logs --since=5m backend`
- When the Vite HMR frontend misbehaves, check **both** `make logs-frontend` and
  the browser's DevTools console — React errors often only surface there.