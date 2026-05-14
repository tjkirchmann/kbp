# Skill: Database Migration

You are helping create or modify a database migration for a FastAPI + SQLAlchemy 2.0 + Alembic project.

## Rules
- Models live in `src/backend/app/models/`. One file per domain entity (e.g. `user.py`, `pool.py`).
- All models inherit from `Base` (imported from `app.core.database`).
- Re-export every model from `app/models/__init__.py` so `import app.models` registers them all with `Base.metadata`.
- Always use SQLAlchemy 2.0 mapped column syntax: `Mapped[int] = mapped_column(Integer, nullable=False)`
- Never edit a migration that has already been applied to a shared/prod DB.
- Use `make migrate-new` to generate, `make migrate` to apply, `make migrate-down` to rollback.

## Package manager
The backend uses **uv** (not pip). `pyproject.toml` and `uv.lock` are source of truth in `src/backend/`.
- Add dependencies: `uv add <package>` (run from `src/backend/`)
- Do not edit `requirements.txt` — it is no longer used.

## Running migrations locally
`make migrate` (or `cd src/backend && ./migrate.sh`) will:
1. Load `.env` from repo root
2. Print a dry-run SQL preview
3. Ask for confirmation before applying

Connects directly to local dev DB (`localhost:5432`) using psycopg2 (strips `+asyncpg` from `DATABASE_URL` automatically).

## Running migrations in prod / Docker
`src/backend/start.sh` runs `alembic upgrade head` on container startup before uvicorn. No manual step needed.

## Postgres ENUMs — critical
SQLAlchemy's `Enum` type registers a metadata event that emits `CREATE TYPE` automatically when the model is imported — which `env.py` does at startup. This causes a duplicate DDL error if the migration also tries to create the type.

**Always use `sqlalchemy.dialects.postgresql.ENUM` with `create_type=False` in migration column definitions, and emit the type manually with `op.execute`:**

```python
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

my_enum = PG_ENUM('val1', 'val2', name='my_enum', create_type=False)

def upgrade():
    op.execute("CREATE TYPE my_enum AS ENUM ('val1', 'val2')")
    op.create_table('my_table',
        ...
        sa.Column('status', my_enum, nullable=True),
        ...
    )

def downgrade():
    op.drop_table('my_table')
    op.execute("DROP TYPE my_enum")
```

## Model template
```python
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class MyModel(Base):
    __tablename__ = "my_models"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
```

## Checks after migration
1. `docker compose exec backend alembic current` → confirm head
2. `docker compose exec db psql -U postgres -d app -c "\d <table>"` → confirm schema
