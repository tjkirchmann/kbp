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

## Package manager
The backend uses **uv** (not pip). `pyproject.toml` and `uv.lock` are the source of truth in `src/backend/`.
- Add dependencies: `uv add <package>` (run from `src/backend/`)
- Do not edit `requirements.txt` — it is no longer used.
- Python is pinned to 3.12 via `src/backend/.python-version`.

## Running migrations locally
`make migrate` (or `cd src/backend && ./migrate.sh`) will:
1. Load `.env` from repo root
2. Print a dry-run SQL preview
3. Ask for confirmation before applying

The script connects directly to the local dev DB (`localhost:5432`) using the psycopg2 driver (strips `+asyncpg` from `DATABASE_URL` automatically).

## Running migrations in prod / Docker
`src/backend/start.sh` runs `alembic upgrade head` automatically on container startup before starting uvicorn. No manual step needed — deploy and the migration runs.

The Dockerfile uses `uv sync --frozen --no-dev` to install dependencies and sets `PATH="/app/.venv/bin:$PATH"` so `alembic` and `uvicorn` are available in the container.

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
