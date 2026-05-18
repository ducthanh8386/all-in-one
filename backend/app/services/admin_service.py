"""Admin business logic."""

from __future__ import annotations

import uuid
from typing import Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RefreshToken, User, UserRole


def _error(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message, "details": None}}


def _parse_user_id(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_error("NOT_FOUND", "User does not exist."),
        )


def _parse_role(role: Optional[str]) -> Optional[UserRole]:
    if not role:
        return None
    try:
        return UserRole(role.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_error("VALIDATION_ERROR", "Invalid role filter."),
        )


async def list_users(
    db: AsyncSession,
    *,
    role: Optional[str],
    limit: int,
    offset: int,
) -> Tuple[int, list[User]]:
    role_filter = _parse_role(role)
    filters = []
    if role_filter:
        filters.append(User.role == role_filter)

    count_query = select(func.count()).select_from(User)
    query = select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    if filters:
        count_query = count_query.where(*filters)
        query = query.where(*filters)

    total_result = await db.execute(count_query)
    users_result = await db.execute(query)
    return int(total_result.scalar_one()), list(users_result.scalars().all())


async def update_user_quota(db: AsyncSession, user_id: str, ai_quota: int) -> User:
    target_id = _parse_user_id(user_id)
    user = await db.get(User, target_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_error("NOT_FOUND", "User does not exist."),
        )

    user.ai_quota = ai_quota
    await db.commit()
    await db.refresh(user)
    return user


async def update_user_status(db: AsyncSession, user_id: str, is_active: bool) -> User:
    target_id = _parse_user_id(user_id)
    user = await db.get(User, target_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_error("NOT_FOUND", "User does not exist."),
        )

    user.is_active = is_active
    if not is_active:
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == target_id)
            .values(revoked=True)
        )
    await db.commit()
    await db.refresh(user)
    return user
