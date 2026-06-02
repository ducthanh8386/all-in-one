"""
Authentication service.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException, status
from datetime import datetime, timedelta, timezone
import uuid

from app.db.models import User, RefreshToken
from app.schemas.auth import RegisterRequest, LoginRequest
from app.core.security import (
    hash_password, verify_password, 
    create_access_token, create_refresh_token, decode_token
)
from app.core.config import settings

def _create_error(code: str, message: str) -> dict:
    return {"code": code, "message": message, "details": None}

async def register_user(db: AsyncSession, data: RegisterRequest) -> User:
    """Register new user."""
    # Check if user exists
    query = select(User).where((User.username == data.username) | (User.email == data.email))
    result = await db.execute(query)
    existing_user = result.scalars().first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_create_error("VALIDATION_ERROR", "Username or email already registered")
        )
        
    new_user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password)
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


async def login_user(db: AsyncSession, data: LoginRequest):
    """Login user and return tokens."""
    query = select(User).where(User.username == data.username)
    result = await db.execute(query)
    user = result.scalars().first()
    
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_create_error("UNAUTHORIZED", "Incorrect username or password")
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_create_error("FORBIDDEN", "User account is disabled")
        )
        
    # Generate tokens
    access_token = create_access_token(data={"sub": str(user.id), "username": user.username, "role": user.role})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    # Save refresh token to DB
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    new_rt = RefreshToken(
        user_id=user.id,
        token=refresh_token,
        expires_at=expires_at
    )
    db.add(new_rt)
    await db.commit()
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user
    }


async def refresh_access_token(db: AsyncSession, token: str):
    """Generate new access token from refresh token."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_create_error("UNAUTHORIZED", "Invalid refresh token")
        )
        
    user_id = payload.get("sub")
    
    # Check token in DB
    query = select(RefreshToken).where(
        RefreshToken.token == token,
        RefreshToken.user_id == uuid.UUID(user_id)
    )
    result = await db.execute(query)
    rt_record = result.scalars().first()
    
    now = datetime.now(timezone.utc)
    expires_at = rt_record.expires_at if rt_record else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if not rt_record or rt_record.revoked or expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_create_error("UNAUTHORIZED", "Refresh token invalid or expired")
        )
        
    # Check user
    user_query = select(User).where(User.id == uuid.UUID(user_id))
    user_res = await db.execute(user_query)
    user = user_res.scalars().first()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_create_error("FORBIDDEN", "User not found or inactive")
        )
        
    new_access_token = create_access_token(
        data={"sub": str(user.id), "username": user.username, "role": user.role}
    )
    
    return {"access_token": new_access_token, "token_type": "bearer"}


async def logout_user(db: AsyncSession, token: str):
    """Revoke refresh token."""
    if not token:
        return
        
    stmt = update(RefreshToken).where(RefreshToken.token == token).values(revoked=True)
    await db.execute(stmt)
    await db.commit()
