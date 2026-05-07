from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.auth import require_admin, _clerk
from app.core.database import get_db
from app.models import User
from app.schemas.user import UserSchema, SetAdminBody

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


@router.get("/ping")
async def ping():
    return {"ok": True}


@router.get("/users", response_model=list[UserSchema])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


@router.post("/users/{clerk_id}/ban")
async def ban_user(clerk_id: str, db: AsyncSession = Depends(get_db)):
    await _clerk.users.ban_async(user_id=clerk_id)
    await db.execute(update(User).where(User.clerk_id == clerk_id).values(is_banned=True))
    await db.commit()
    return {"ok": True}


@router.post("/users/{clerk_id}/set-admin")
async def set_admin(clerk_id: str, body: SetAdminBody, db: AsyncSession = Depends(get_db)):
    await db.execute(update(User).where(User.clerk_id == clerk_id).values(is_admin=body.is_admin))
    await db.commit()
    return {"ok": True}
