"""Admin business logic."""

from __future__ import annotations

import uuid
from typing import Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.models import Document, Flashcard, RefreshToken, Schedule, User, UserRole
from app.schemas.admin import CreateUserRequest, UpdateUserRequest


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


async def _ensure_unique_identity(
    db: AsyncSession,
    *,
    username: Optional[str],
    email: Optional[str],
    exclude_user_id: Optional[uuid.UUID] = None,
) -> None:
    filters = []
    if username:
        filters.append(User.username == username)
    if email:
        filters.append(User.email == email)
    if not filters:
        return

    query = select(User).where(*filters) if len(filters) == 1 else select(User).where(filters[0] | filters[1])
    result = await db.execute(query)
    existing = result.scalars().first()
    if existing and existing.id != exclude_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_error("VALIDATION_ERROR", "Username or email already exists."),
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


async def get_admin_stats(db: AsyncSession) -> dict:
    total_users = int((await db.execute(select(func.count()).select_from(User))).scalar_one())
    active_users = int(
        (await db.execute(select(func.count()).select_from(User).where(User.is_active.is_(True)))).scalar_one()
    )
    role_counts_result = await db.execute(
        select(User.role, func.count(User.id)).group_by(User.role)
    )
    role_counts = {role.value if isinstance(role, UserRole) else str(role): int(count) for role, count in role_counts_result.all()}

    quota_result = await db.execute(
        select(
            func.coalesce(func.sum(User.ai_quota), 0),
            func.coalesce(func.avg(User.ai_quota), 0),
        )
    )
    total_ai_quota, average_ai_quota = quota_result.one()

    total_documents = int((await db.execute(select(func.count()).select_from(Document))).scalar_one())
    total_flashcards = int((await db.execute(select(func.count()).select_from(Flashcard))).scalar_one())
    total_schedules = int((await db.execute(select(func.count()).select_from(Schedule))).scalar_one())
    recent_users = list(
        (
            await db.execute(
                select(User)
                .order_by(User.created_at.desc())
                .limit(5)
            )
        )
        .scalars()
        .all()
    )

    return {
        "total_users": total_users,
        "active_users": active_users,
        "disabled_users": total_users - active_users,
        "admin_users": role_counts.get(UserRole.ADMIN.value, 0),
        "moderator_users": role_counts.get(UserRole.MODERATOR.value, 0),
        "regular_users": role_counts.get(UserRole.USER.value, 0),
        "total_ai_quota": int(total_ai_quota or 0),
        "average_ai_quota": round(float(average_ai_quota or 0), 2),
        "total_documents": total_documents,
        "total_flashcards": total_flashcards,
        "total_schedules": total_schedules,
        "recent_users": recent_users,
    }


async def create_user(db: AsyncSession, data: CreateUserRequest) -> User:
    role = _parse_role(data.role) or UserRole.USER
    await _ensure_unique_identity(db, username=data.username, email=str(data.email))

    user = User(
        username=data.username,
        email=str(data.email),
        hashed_password=hash_password(data.password),
        role=role,
        ai_quota=data.ai_quota,
        is_active=data.is_active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user_id: str, data: UpdateUserRequest) -> User:
    target_id = _parse_user_id(user_id)
    user = await db.get(User, target_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_error("NOT_FOUND", "User does not exist."),
        )

    payload = data.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_error("VALIDATION_ERROR", "Nothing to update."),
        )

    await _ensure_unique_identity(
        db,
        username=payload.get("username"),
        email=str(payload["email"]) if "email" in payload else None,
        exclude_user_id=target_id,
    )

    if "username" in payload:
        user.username = payload["username"]
    if "email" in payload:
        user.email = str(payload["email"])
    if "password" in payload:
        user.hashed_password = hash_password(payload["password"])
    if "role" in payload:
        user.role = _parse_role(payload["role"]) or UserRole.USER
    if "ai_quota" in payload:
        user.ai_quota = payload["ai_quota"]
    if "is_active" in payload:
        user.is_active = payload["is_active"]
        if not user.is_active:
            await db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == target_id)
                .values(revoked=True)
            )

    await db.commit()
    await db.refresh(user)
    return user


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


async def delete_user(db: AsyncSession, user_id: str, current_admin_id: uuid.UUID) -> None:
    target_id = _parse_user_id(user_id)
    if target_id == current_admin_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_error("VALIDATION_ERROR", "Admins cannot delete their own account."),
        )

    user = await db.get(User, target_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_error("NOT_FOUND", "User does not exist."),
        )

    await db.delete(user)
    await db.commit()


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
