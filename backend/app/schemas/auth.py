"""
Authentication schemas.
TODO: Implement in Phase 1
"""

from pydantic import BaseModel
from typing import Optional


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    ai_quota: int
    is_active: bool

    class Config:
        from_attributes = True
