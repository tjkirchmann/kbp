from fastapi import APIRouter, Depends
from app.core.auth import require_admin

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


@router.get("/ping")
async def ping():
    return {"ok": True}
