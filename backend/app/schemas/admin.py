"""Admin request and response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AdminUserResponse(BaseModel):
    id: UUID
    username: str
    email: str
    role: str
    ai_quota: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PaginatedUsersResponse(BaseModel):
    total: int
    limit: int
    offset: int
    users: List[AdminUserResponse]


class UpdateQuotaRequest(BaseModel):
    ai_quota: int = Field(..., ge=0, le=100000)


class UpdateStatusRequest(BaseModel):
    is_active: bool


class AdminUserFilter(BaseModel):
    role: Optional[str] = None
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
