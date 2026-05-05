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
