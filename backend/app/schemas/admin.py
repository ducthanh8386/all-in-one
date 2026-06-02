"""Admin request and response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    email: str
    role: str
    ai_quota: int
    is_active: bool
    created_at: datetime


class PaginatedUsersResponse(BaseModel):
    total: int
    limit: int
    offset: int
    users: List[AdminUserResponse]


class AdminStatsResponse(BaseModel):
    total_users: int
    active_users: int
    disabled_users: int
    admin_users: int
    moderator_users: int
    regular_users: int
    total_ai_quota: int
    average_ai_quota: float
    total_documents: int
    total_flashcards: int
    total_schedules: int
    recent_users: List[AdminUserResponse]


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field(default="USER")
    ai_quota: int = Field(default=100, ge=0, le=100000)
    is_active: bool = True

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        username = value.strip()
        if not username:
            raise ValueError("username must not be empty")
        return username

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: str) -> str:
        return value.strip().upper()


class UpdateUserRequest(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    role: Optional[str] = None
    ai_quota: Optional[int] = Field(default=None, ge=0, le=100000)
    is_active: Optional[bool] = None

    @field_validator("username")
    @classmethod
    def normalize_optional_username(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        username = value.strip()
        if not username:
            raise ValueError("username must not be empty")
        return username

    @field_validator("role")
    @classmethod
    def normalize_optional_role(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value is not None else None


class UpdateQuotaRequest(BaseModel):
    ai_quota: int = Field(..., ge=0, le=100000)


class UpdateStatusRequest(BaseModel):
    is_active: bool


class AdminUserFilter(BaseModel):
    role: Optional[str] = None
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
