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
├── docker-compose.yml         ← frontend, backend, db, workers (procrastinate + temporal), discord_bot, temporal server/ui
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
│   │   ├── tailwind.config.ts
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
| Styling | Tailwind CSS 4 + shadcn/ui + Radix UI | v4 — `@theme` in CSS, not `tailwind.config.ts` |
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

- **CSS variables** are in `src/frontend/src/index.css` under `:root` and `@theme`. Do not put design tokens in `tailwind.config.ts` — Tailwind v4 reads `@theme` directly.
- **Semantic color classes** (`bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, etc.) are all wired up and ready to use.
- **Page background** is the warm tan graph-paper grid — set on `html, body` in `index.css`. Don't apply `bg-background` to page wrappers; let it inherit.
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
```

| Skill file | Use when |
|---|---|
| `.claude/skills/frontend-component.md` | Building or editing any UI component — contains the full design system |
| `.claude/skills/frontend-logic.md` | TanStack Query hooks, Zustand slices, auth patterns |
| `.claude/skills/backend.md` | New FastAPI route, service, or model |
| `.claude/skills/migration.md` | Any Alembic migration — includes the Postgres ENUM gotcha |
| `.claude/skills/data-modeling.md` | Schema decisions — soft deletes, table conventions, CFBD API shape, all locked-in decisions |

---

## Things to know that aren't obvious from the code

- **Railway DATABASE_URL**: Railway's Postgres plugin injects `postgresql://` (sync scheme). `app/core/database.py` replaces it with `postgresql+asyncpg://` at engine creation time. Don't remove that line.
- **Railway PORT**: The backend `Dockerfile` uses shell-form `CMD` so `${PORT:-8000}` expands at runtime. Don't switch it to exec form.
- **Geist font**: Imported via `@fontsource/geist` in `index.css`. If you add a new CSS entry point, re-import it.
- **shadcn not yet initialized**: `components.json` doesn't exist yet. Run `npx shadcn@latest init` inside the frontend container before adding components.
- **`lucide-react` is in `package.json`** but was installed manually in the running container — it will be present after the next `make up` rebuild.
- **No dark mode** (intentionally). Don't add `dark:` variants. The design is light-only.
- **Logo**: Temporary KBP amber badge in `src/pages/Home.tsx`. Will be extracted to `src/components/Logo.tsx` when real pages are built. Owner will supply final logo asset.

---

## Temporal (durable workflows)

Self-hosted Temporal runs alongside the app for durable, multi-step workflows.
It's **separate from Procrastinate** — Procrastinate (`app/tasks/`) owns the
remaining cron/sync jobs (cfbd_sync, cfbd_facts, cfbd_plays, espn_poller);
Temporal (`app/temporal/`) is the home for durable workflows. The **CFBD
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
