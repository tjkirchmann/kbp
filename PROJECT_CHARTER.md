# Solo App — Agent Build Guide
> One-shot planning doc. Work through phases in order. Do not skip checks.

---

## Stack (Locked)

| Layer | Tech |
|---|---|
| Frontend UI | React 18 + TypeScript (strict) + Vite |
| Styling | Tailwind CSS 4 + shadcn/ui + Radix UI |
| Data fetching | TanStack Query v5 |
| Client state | Zustand |
| Routing | React Router v6 |
| Backend | FastAPI + Pydantic v2 + Uvicorn |
| ORM | SQLAlchemy 2.0 (async) |
| Migrations | Alembic |
| Auth | Clerk (frontend SDK + backend JWT verification) |
| Database | Postgres (via Docker locally, Supabase in prod) |
| AI | OpenAI SDK (direct) |
| Containerization | Docker + Docker Compose |
| Task runner | Make |
| Deployment | Railway |

---

## Repo Structure (Target)

```
.
├── Makefile
├── docker-compose.yml
├── .env.example
├── DESIGN.md                          ← placeholder, fill in later
│
├── src/
│   ├── frontend/                      ← Vite React app
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   └── ui/                ← shadcn output folder
│   │       ├── pages/
│   │       │   └── Home.tsx
│   │       ├── services/              ← TanStack Query hooks
│   │       ├── store/                 ← Zustand slices
│   │       └── lib/
│   │           └── utils.ts
│   │
│   └── backend/                       ← FastAPI app
│       ├── main.py
│       ├── requirements.txt
│       ├── alembic.ini
│       ├── .claude/
│       │   └── skills/                ← agent skills (see below)
│       ├── alembic/
│       │   └── versions/
│       ├── app/
│       │   ├── core/
│       │   │   ├── config.py          ← Settings via pydantic-settings
│       │   │   ├── database.py        ← async engine + session
│       │   │   └── auth.py            ← Clerk JWT verification
│       │   ├── models/                ← SQLAlchemy models
│       │   ├── schemas/               ← Pydantic request/response schemas
│       │   ├── routers/               ← FastAPI routers (one per domain)
│       │   └── services/              ← business logic (no ORM calls here)
│       └── Dockerfile
│
├── .claude/
│   └── skills/                        ← top-level agent skills
```

---

## Makefile

Create `Makefile` at repo root. Tabs are required (not spaces).

```makefile
.PHONY: up down deploy migrate frontend-component backend frontend-logic

# ── Dev ──────────────────────────────────────────────────────────────────────

up:
	docker compose up --build

down:
	docker compose down

# ── Deploy ───────────────────────────────────────────────────────────────────

deploy:
	@echo "Pushing to Railway..."
	railway up

# ── Database ─────────────────────────────────────────────────────────────────

migrate:
	docker compose exec backend alembic upgrade head

migrate-new:
	@read -p "Migration name: " name; \
	docker compose exec backend alembic revision --autogenerate -m "$$name"

migrate-down:
	docker compose exec backend alembic downgrade -1

# ── Agent skills ─────────────────────────────────────────────────────────────

frontend-component:
	@echo "Loading frontend component skill..."
	@cat .claude/skills/frontend-component.md

backend:
	@echo "Loading backend skill..."
	@cat .claude/skills/backend.md

frontend-logic:
	@echo "Loading frontend logic skill..."
	@cat .claude/skills/frontend-logic.md

migration:
	@echo "Loading migration skill..."
	@cat .claude/skills/migration.md
```

---

## docker-compose.yml

```yaml
version: "3.9"

services:
  frontend:
    build:
      context: ./src/frontend
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"
    volumes:
      - ./src/frontend:/app
      - /app/node_modules
    environment:
      - VITE_API_URL=http://localhost:8000
      - VITE_CLERK_PUBLISHABLE_KEY=${CLERK_PUBLISHABLE_KEY}
    depends_on:
      - backend

  backend:
    build:
      context: ./src/backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./src/backend:/app
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/app
      - CLERK_SECRET_KEY=${CLERK_SECRET_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

  db:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: app
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

---

## .env.example

```bash
# Clerk
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# OpenAI
OPENAI_API_KEY=sk-...

# DB (local Docker — don't change unless using remote)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/app
```

---

## Phase 1 — Repo & Docker Skeleton

**Goal:** `make up` works. Both containers start. Postgres is reachable.

### Steps

1. Create repo structure as shown above (empty files are fine)
2. Create `docker-compose.yml` (above)
3. Create `Makefile` (above)
4. Create `src/backend/Dockerfile`:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

5. Create `src/frontend/Dockerfile.dev`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

6. Create minimal `src/backend/requirements.txt`:

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
pydantic==2.8.0
pydantic-settings==2.4.0
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
alembic==1.13.0
httpx==0.27.0
python-jose[cryptography]==3.3.0
openai==1.45.0
```

7. Create minimal `src/backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="App API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

8. Create minimal `src/frontend/package.json` then run `npm create vite@latest . -- --template react-ts` inside `src/frontend/`

9. Copy `.env.example` to `.env` and fill in keys

### ✅ Phase 1 Checks

```bash
make up
# Expected: all 3 containers start, no crash loops

curl http://localhost:8000/health
# Expected: {"status":"ok"}

curl http://localhost:8000/docs
# Expected: FastAPI Swagger UI loads

# In browser
open http://localhost:5173
# Expected: Vite default React page (will replace in Phase 2)

docker compose logs db | grep "ready to accept"
# Expected: line confirming Postgres is accepting connections
```

---

## Phase 2 — Frontend Shell (Bare Bones)

**Goal:** A real page at `localhost:5173` with only a header. No content. Clean slate.

### Steps

1. Install frontend deps inside `src/frontend/`:

```bash
npm install @tanstack/react-query zustand react-router-dom @clerk/react
npm install -D tailwindcss@next @tailwindcss/vite
npx shadcn@latest init
```

2. `src/frontend/src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClerkProvider } from '@clerk/react'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>
)
```

3. `src/frontend/src/App.tsx`:

```tsx
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
```

4. `src/frontend/src/pages/Home.tsx` — bare bones header, nothing else:

```tsx
export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <span className="font-semibold text-foreground tracking-tight">
            My App
          </span>
        </div>
      </header>
    </div>
  )
}
```

5. `src/frontend/src/index.css` — Tailwind base:

```css
@import "tailwindcss";
```

6. `src/frontend/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: true,
    port: 5173,
  },
})
```

### ✅ Phase 2 Checks

```bash
# Rebuild with new deps
make down && make up

open http://localhost:5173
# Expected: Page with only a top header bar, nothing else. Clean white/dark bg.

# No console errors in browser devtools
# Tailwind classes applying (inspect header element — should have h-16, border-b)
# TypeScript compiles with no errors:
docker compose exec frontend npx tsc --noEmit
```

---

## Phase 3 — Backend Foundation

**Goal:** DB connected. Alembic initialized. Auth middleware working.

### Steps

1. `src/backend/app/core/config.py`:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    clerk_secret_key: str
    openai_api_key: str

    class Config:
        env_file = ".env"

settings = Settings()
```

2. `src/backend/app/core/database.py`:

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
```

3. `src/backend/app/core/auth.py` — Clerk JWT verification:

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials
    try:
        # Fetch Clerk JWKS and verify
        async with httpx.AsyncClient() as client:
            r = await client.get("https://api.clerk.com/v1/jwks")
            jwks = r.json()
        # Decode — Clerk signs with RS256
        payload = jwt.decode(token, jwks, algorithms=["RS256"])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return {"user_id": user_id}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
```

4. Initialize Alembic (run inside backend container):

```bash
docker compose exec backend alembic init alembic
```

5. Edit `src/backend/alembic/env.py` — import Base and models so autogenerate works:

```python
# At top of env.py, after existing imports:
from app.core.database import Base
from app.core.config import settings
# import all models here so Alembic sees them:
# from app.models import user  # add as you create models

target_metadata = Base.metadata

# In run_migrations_online(), replace sqlalchemy.url with:
# connectable = create_engine(settings.database_url.replace("+asyncpg", ""))
```

6. Update `main.py` to include lifespan and a protected route example:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.core.auth import get_current_user

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="App API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/me")
async def me(user=Depends(get_current_user)):
    return {"user_id": user["user_id"]}
```

### ✅ Phase 3 Checks

```bash
make down && make up

curl http://localhost:8000/health
# Expected: {"status":"ok"}

curl http://localhost:8000/docs
# Expected: /health and /me both appear in Swagger

# Check DB connection
docker compose exec backend python -c "
import asyncio
from app.core.database import engine
async def test():
    async with engine.connect() as c:
        print('DB connected OK')
asyncio.run(test())
"
# Expected: "DB connected OK"

# Run first migration
make migrate-new
# type: initial
make migrate
# Expected: "Running upgrade -> <hash>, initial"

docker compose exec db psql -U postgres -d app -c "\dt"
# Expected: alembic_version table exists
```

---

## Phase 4 — Alembic Migration Workflow (Ongoing)

From here forward, every model change follows this flow:

```bash
# 1. Edit/add a model in src/backend/app/models/
# 2. Import the model in alembic/env.py
# 3. Generate migration
make migrate-new    # prompts for name

# 4. Review the generated file in alembic/versions/ — always read it before applying
# 5. Apply
make migrate

# 6. Rollback if needed
make migrate-down
```

### ✅ Migration Checks (run after every migration)

```bash
# Check current revision
docker compose exec backend alembic current
# Expected: your latest hash (head)

# Check history is clean
docker compose exec backend alembic history --verbose

# Verify schema in DB
docker compose exec db psql -U postgres -d app -c "\d <your_table_name>"
# Expected: columns match your model exactly
```

---

## Phase 5 — Deploy

**Prereq:** Railway account + `railway` CLI installed (`npm i -g @railway/cli`)

### One-time setup

```bash
railway login
railway init          # creates project, link to repo
railway add           # add Postgres plugin inside Railway dashboard
```

### Environment variables to set in Railway dashboard

```
CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
OPENAI_API_KEY
DATABASE_URL          ← Railway auto-injects this from Postgres plugin
```

### Ongoing deploy

```bash
make deploy
# Pushes current branch to Railway
# Railway builds Docker images and restarts services

# After deploy, run migrations on prod:
railway run alembic upgrade head
```

### ✅ Deploy Checks

```bash
# Health check
curl https://<your-app>.up.railway.app/health
# Expected: {"status":"ok"}

# Docs available (disable in prod if sensitive)
open https://<your-app>.up.railway.app/docs

# Frontend loads and header renders
open https://<your-frontend>.up.railway.app
```

---

## Agent Skills

Place these files in `.claude/skills/` at repo root. The Makefile `make <skill>` command prints them. You can also pass them as context when prompting the agent.

---

### `.claude/skills/migration.md`

````markdown
# Skill: Database Migration

You are helping create or modify a database migration for a FastAPI + SQLAlchemy 2.0 + Alembic project.

## Rules
- Models live in `src/backend/app/models/`. One file per domain entity.
- All models inherit from `Base` (imported from `app.core.database`).
- Always use SQLAlchemy 2.0 mapped column syntax: `mapped_column(String, nullable=False)`
- Import every new model in `src/backend/alembic/env.py` or autogenerate will miss it.
- After generating, READ the migration file before running it. Fix any issues.
- Never edit a migration that has already been applied to a shared/prod DB.
- Use `make migrate-new` to generate, `make migrate` to apply, `make migrate-down` to rollback.

## Model template
```python
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime, func
from app.core.database import Base
import uuid

class MyModel(Base):
    __tablename__ = "my_models"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), onupdate=func.now())
```

## Checks after migration
1. `docker compose exec backend alembic current` → confirm head
2. `docker compose exec db psql -U postgres -d app -c "\d <table>"` → confirm schema
````

---

### `.claude/skills/frontend-component.md`

````markdown
# Skill: Frontend Component Design

You are designing a React UI component for this app. The stack is React 18 + TypeScript + Tailwind CSS 4 + shadcn/ui + Radix UI.

## Rules
- All components go in `src/frontend/src/components/`
- Use shadcn/ui primitives first (Button, Card, Dialog, Input, etc.) — don't reinvent
- Install shadcn components with: `npx shadcn@latest add <component>`
- Use Tailwind utility classes only — no inline styles, no CSS modules
- All props must be typed with TypeScript interfaces
- Prefer composition over big monolithic components
- Keep components under ~150 lines; extract sub-components if larger
- Use `cn()` from `@/lib/utils` for conditional class merging
- No `any` types — use `unknown` + type guard if type is truly unknown

## Component template
```tsx
import { cn } from '@/lib/utils'

interface MyComponentProps {
  title: string
  className?: string
}

export function MyComponent({ title, className }: MyComponentProps) {
  return (
    <div className={cn('...base classes...', className)}>
      {title}
    </div>
  )
}
```

## Design defaults
- Dark mode aware: use semantic colors (`bg-background`, `text-foreground`, `border-border`)
- Spacing: use Tailwind scale (4, 6, 8, 12, 16 → 1rem, 1.5rem, 2rem, 3rem, 4rem)
- Header height: h-16
- Max content width: max-w-7xl mx-auto
````

---

### `.claude/skills/frontend-logic.md`

````markdown
# Skill: Frontend Data & State Logic

You are implementing data fetching, state management, or business logic for the frontend.

## Data fetching — TanStack Query
- All server state goes through TanStack Query
- Query hooks live in `src/frontend/src/services/`
- One file per backend domain (e.g., `useUsers.ts`, `useItems.ts`)
- Always type the response with a TypeScript interface matching the backend Pydantic schema
- Use `queryKey` factories for cache invalidation

```ts
// src/frontend/src/services/useExample.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export const exampleKeys = {
  all: ['examples'] as const,
  detail: (id: string) => ['examples', id] as const,
}

export function useExamples() {
  return useQuery({
    queryKey: exampleKeys.all,
    queryFn: () => axios.get(`${API}/examples`).then(r => r.data),
  })
}
```

## Client state — Zustand
- Only use Zustand for UI state that is NOT server data (modals, filters, workspace state)
- Slices live in `src/frontend/src/store/`
- Keep slices small and focused

```ts
// src/frontend/src/store/useUIStore.ts
import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>(set => ({
  sidebarOpen: false,
  setSidebarOpen: open => set({ sidebarOpen: open }),
}))
```

## Auth
- Use Clerk hooks: `useUser()`, `useAuth()`, `useClerk()`
- Pass Bearer token to API: `const { getToken } = useAuth(); const token = await getToken()`
- Protect routes with `<SignedIn>` / `<SignedOut>` from `@clerk/react`
````

---

### `.claude/skills/backend.md`

````markdown
# Skill: Backend Development

You are adding a route, service, or model to a FastAPI + SQLAlchemy 2.0 + Pydantic v2 backend.

## Architecture
```
main.py                    ← mounts routers
app/
  core/
    config.py              ← Settings (pydantic-settings)
    database.py            ← engine, session, Base
    auth.py                ← Clerk JWT → user_id
  models/                  ← SQLAlchemy ORM models
  schemas/                 ← Pydantic request/response
  routers/                 ← FastAPI route handlers (thin — call services)
  services/                ← business logic (no ORM calls; uses queries or repositories)
```

## Rules
- Routers are thin: validate input, call service, return response
- No ORM queries in routers
- Pydantic schemas live in `schemas/` — separate Request and Response models
- Use `Depends(get_db)` for DB sessions, `Depends(get_current_user)` for auth
- All routes that touch user data must require auth
- Return typed Pydantic response models — never return raw dicts to client
- Async all the way: `async def`, `await session.execute()`

## Router template
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.auth import get_current_user
from app.schemas.example import ExampleCreate, ExampleResponse
from app import services

router = APIRouter(prefix="/examples", tags=["examples"])

@router.get("/", response_model=list[ExampleResponse])
async def list_examples(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await services.example.list_for_user(db, user["user_id"])

@router.post("/", response_model=ExampleResponse, status_code=201)
async def create_example(
    payload: ExampleCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return await services.example.create(db, user["user_id"], payload)
```

## Adding a new router to main.py
```python
from app.routers import example
app.include_router(example.router)
```

## Checks after adding backend code
1. `curl http://localhost:8000/docs` → new route appears
2. Hit the route with curl or Swagger UI — confirm 200/201
3. Check `docker compose logs backend` for any errors
````

---

## DESIGN.md — App Design Placeholder

```markdown
# App Design

> This file is a placeholder. Ask the agent: "Interview me about what I want this app to do, then fill in this document."

---

## What problem does this app solve?

_To be filled in._

## Who is the user?

_To be filled in._

## Core features (MVP)

_To be filled in._

## Data model (rough)

_To be filled in._

## Pages / routes

| Route | Purpose |
|---|---|
| `/` | Landing / home |
| _..._ | _..._ |

## Key user flows

_To be filled in._

## Design aesthetic

_To be filled in._

## What this app is NOT (scope cuts)

_To be filled in._

## Open questions

_To be filled in._
```

---

## Master Checklist

Run this before calling any phase "done."

| Phase | Check | Pass? |
|---|---|---|
| 1 | `make up` — all 3 containers start | ☐ |
| 1 | `curl localhost:8000/health` → 200 | ☐ |
| 1 | Postgres accepting connections | ☐ |
| 2 | `localhost:5173` loads with header only | ☐ |
| 2 | No TS errors (`tsc --noEmit`) | ☐ |
| 2 | No browser console errors | ☐ |
| 3 | DB engine connects without error | ☐ |
| 3 | `make migrate` succeeds | ☐ |
| 3 | `alembic current` shows head | ☐ |
| 5 | `make deploy` exits 0 | ☐ |
| 5 | Prod health check returns 200 | ☐ |
| 5 | Prod migrations applied | ☐ |

---

## Common Errors & Fixes

**`ModuleNotFoundError` in backend container**
→ Rebuild: `make down && docker compose build backend && make up`

**Alembic can't find models for autogenerate**
→ Make sure every model file is imported in `alembic/env.py` before `target_metadata = Base.metadata`

**CORS error in browser**
→ Check `allow_origins` in `main.py` includes `http://localhost:5173` exactly (no trailing slash)

**Tailwind classes not applying**
→ Confirm the `@tailwindcss/vite` plugin is in `vite.config.ts` and `@import "tailwindcss"` is in `index.css`

**Clerk JWT 401**
→ Confirm `CLERK_PUBLISHABLE_KEY` in frontend env and `CLERK_SECRET_KEY` in backend env are from the same Clerk app instance

**Docker volume permissions on Postgres**
→ `docker compose down -v` (removes volumes) then `make up` — only do this if you can wipe local DB data
