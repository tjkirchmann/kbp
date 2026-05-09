from datetime import datetime
from pydantic import BaseModel, ConfigDict


class UserSchema(BaseModel):
    id: int
    email: str
    name: str | None
    is_admin: bool
    is_banned: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SetAdminBody(BaseModel):
    is_admin: bool
