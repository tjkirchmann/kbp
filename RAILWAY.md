# Railway Deployment

This project runs 3 services on Railway. The backend API and the Procrastinate worker both run inside the single `backend` service managed by supervisord. Background jobs (CFBD + ESPN sync) run on Procrastinate, backed by Postgres — there is no Redis or Celery.

## Services

| Service | Root Directory | Notes |
|---------|---------------|-------|
| `frontend` | `src/frontend` | nginx, serves built React app |
| `backend` | `src/backend` | uvicorn + procrastinate worker via supervisord |
| `postgres` | Railway managed | also backs the Procrastinate job queue |

## Setting Up a New Environment

### 1. Add managed services
In the Railway project, add:
- **PostgreSQL** plugin

### 2. Create application services
Create two services pointing at this repo:
- `frontend` → Root Directory: `src/frontend`
- `backend` → Root Directory: `src/backend`

Both have `railway.toml` files that tell Railway which Dockerfile to use and how to health-check them. No start command override needed — `backend` runs `./start.sh` which runs migrations, applies the Procrastinate schema, then starts supervisord (which manages uvicorn and the procrastinate worker).

### 3. Set environment variables

**`backend` service:**
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
ALLOWED_ORIGINS=https://your-frontend.up.railway.app
CLERK_SECRET_KEY=sk_live_...
OPENAI_API_KEY=sk-...
CFBD_API_KEY=...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

**`frontend` service (build-time):**
```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_URL=https://your-backend.up.railway.app
```

### 4. Deploy order
Deploy `postgres` first (Railway resolves `${{...}}` references automatically). Then deploy the two application services. `backend` runs Alembic migrations on startup before any processes come up.

## Local Development

Local dev uses `docker compose up --build` from the repo root. The Procrastinate worker runs as a separate container locally (better log isolation, can restart independently). supervisord is only used in the production container.

Copy `.env.example` to `.env` and fill in your secrets — that's the only setup required.
