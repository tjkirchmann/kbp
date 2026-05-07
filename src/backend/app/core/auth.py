from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from clerk_backend_api import Clerk
from clerk_backend_api.security.verifytoken import verify_token
from clerk_backend_api.security.types import VerifyTokenOptions
from app.core.config import settings
from app.core.database import get_db
from app.models import User

security = HTTPBearer()
_verify_options = VerifyTokenOptions(secret_key=settings.clerk_secret_key)
_clerk = Clerk(bearer_auth=settings.clerk_secret_key)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = verify_token(credentials.credentials, _verify_options)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    clerk_id: str = payload.get("sub")
    if not clerk_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    try:
        clerk_user = await _clerk.users.get_async(user_id=clerk_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not fetch user from Clerk")

    primary_email = next(
        (e.email_address for e in clerk_user.email_addresses if e.id == clerk_user.primary_email_address_id),
        clerk_user.email_addresses[0].email_address if clerk_user.email_addresses else None,
    )
    if not primary_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No email on Clerk user")

    parts = [p for p in [clerk_user.first_name, clerk_user.last_name] if p]
    full_name = " ".join(parts) if parts else None

    stmt = (
        pg_insert(User)
        .values(clerk_id=clerk_id, email=primary_email, name=full_name)
        .on_conflict_do_update(
            index_elements=["clerk_id"],
            set_={"email": primary_email, "name": full_name, "updated_at": func.now()},
        )
        .returning(User)
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.scalars().one()


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return user
