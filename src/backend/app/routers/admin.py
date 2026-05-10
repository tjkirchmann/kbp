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
    result = await db.execute(select(User).where(User.deleted_at.is_(None)).order_by(User.created_at))
    return result.scalars().all()


@router.post("/users/{user_id}/ban")
async def ban_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    await _clerk.users.ban_async(user_id=user.clerk_id)
    await db.execute(update(User).where(User.id == user_id).values(is_banned=True))
    await db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/set-admin")
async def set_admin(user_id: int, body: SetAdminBody, db: AsyncSession = Depends(get_db)):
    await db.execute(update(User).where(User.id == user_id).values(is_admin=body.is_admin))
    await db.commit()
    return {"ok": True}
