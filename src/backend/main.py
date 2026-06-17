from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.procrastinate import procrastinate_app
from app.routers.admin import router as admin_router
from app.routers.pools import router as pools_router
from app.routers.submissions import router as submissions_router
from app.routers.teams import router as teams_router
import app.models  # noqa: F401 — registers models with Base.metadata

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Ensure the built-in "none" channel exists so any consumer can be silenced
    # without first hand-creating one. It's protected from deletion (see admin
    # router); idempotent on every boot.
    from app.services.notify_config import ensure_none_channel
    from app.core.database import SessionLocal
    async with SessionLocal() as db:
        await ensure_none_channel(db)
    # Open Procrastinate's connection pool so admin endpoints can defer jobs.
    async with procrastinate_app.open_async():
        # Defer tasks flagged run_on_startup in admin_notify_config (queueing_lock
        # dedupes restarts; staleness windows honored).
        from app.tasks.startup import defer_startup_tasks
        await defer_startup_tasks(procrastinate_app)
        yield

app = FastAPI(title="App API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(pools_router)
app.include_router(submissions_router)
app.include_router(teams_router)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/me")
async def me(user=Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "name": user.name, "is_admin": user.is_admin, "is_banned": user.is_banned}
