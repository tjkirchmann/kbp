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
