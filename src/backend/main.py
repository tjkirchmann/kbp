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
    # Open Procrastinate's connection pool so admin endpoints can defer jobs.
    async with procrastinate_app.open_async():
        # Defer a one-off ESPN seed at startup; queueing_lock dedupes restarts.
        from procrastinate.exceptions import AlreadyEnqueued
        from app.tasks.espn_poller import seed_missing_espn_games
        try:
            await seed_missing_espn_games.defer_async()
        except AlreadyEnqueued:
            pass
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
