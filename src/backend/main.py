from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401 — registers models with Base.metadata
from app.core.auth import get_current_user
from app.core.config import settings
from app.routers.admin import router as admin_router
from app.routers.cfbd_admin import router as cfbd_admin_router
from app.routers.library import router as library_router
from app.routers.pools import router as pools_router
from app.routers.struct_output import router as struct_output_router
from app.routers.temporal_admin import router as temporal_admin_router
from app.routers.submissions import router as submissions_router
from app.routers.teams import router as teams_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is owned by Alembic (make migrate) — no create_all here, so the DB
    # never drifts ahead of the migration chain.
    # Ensure the built-in "none" channel exists so any consumer can be silenced
    # without first hand-creating one. It's protected from deletion (see admin
    # router); idempotent on every boot.
    from app.core.database import SessionLocal
    from app.services.notify_config import ensure_none_channel

    async with SessionLocal() as db:
        await ensure_none_channel(db)
    # All background work runs on Temporal now (app/temporal/*); the API process no
    # longer opens a Procrastinate pool or defers startup tasks — Temporal Schedules
    # and the workflows' own coverage self-heal cover "ensure data present on boot."
    yield


app = FastAPI(title="KBP API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(cfbd_admin_router)
app.include_router(pools_router)
app.include_router(submissions_router)
app.include_router(teams_router)
app.include_router(library_router)
app.include_router(struct_output_router)
app.include_router(temporal_admin_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/me")
async def me(user=Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_admin": user.is_admin,
        "is_banned": user.is_banned,
    }
