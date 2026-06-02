"""Admin routes for user and quota management."""

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.admin import (
    AdminStatsResponse,
    AdminUserResponse,
    CreateUserRequest,
    PaginatedUsersResponse,
    UpdateQuotaRequest,
    UpdateStatusRequest,
    UpdateUserRequest,
)
from app.services import admin_service

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_admin_user)],
)


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(db: AsyncSession = Depends(get_db)):
    """Get platform-wide admin dashboard statistics."""
    return await admin_service.get_admin_stats(db)


@router.get("/users", response_model=PaginatedUsersResponse)
async def list_users(
    role: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List users with pagination and optional role filter."""
    total, users = await admin_service.list_users(
        db,
        role=role,
        limit=limit,
        offset=offset,
    )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "users": users,
    }


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a user as an admin."""
    return await admin_service.create_user(db, data)


@router.put("/users/{id}", response_model=AdminUserResponse)
async def update_user(
    id: str,
    data: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a user's profile, role, password, quota, or status."""
    return await admin_service.update_user(db, id, data)


@router.put("/users/{id}/quota", response_model=AdminUserResponse)
async def update_user_quota(
    id: str,
    data: UpdateQuotaRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a user's AI quota."""
    return await admin_service.update_user_quota(db, id, data.ai_quota)


@router.put("/users/{id}/status", response_model=AdminUserResponse)
async def update_user_status(
    id: str,
    data: UpdateStatusRequest,
    db: AsyncSession = Depends(get_db),
):
    """Activate or deactivate a user."""
    return await admin_service.update_user_status(db, id, data.is_active)


@router.delete("/users/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    id: str,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user and dependent data."""
    await admin_service.delete_user(db, id, current_admin.id)
