"""
Security utilities: password hashing, JWT token management, and auth dependencies.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.db.session import get_db
from app.db.models import User, UserRole

# Password hashing context
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12
)

# HTTP Bearer for JWT token extraction
security = HTTPBearer()


def hash_password(password: str) -> str:
    """
    Hash a plain text password using bcrypt.
    """
    # Fix lỗi bcrypt 72 bytes: Cắt mật khẩu dài quá 72 ký tự
    truncated_password = password[:72]
    return pwd_context.hash(truncated_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a hashed password.
    """
    # Fix lỗi bcrypt 72 bytes: Cắt mật khẩu tương tự như khi hash
    truncated_password = plain_password[:72]
    return pwd_context.verify(truncated_password, hashed_password)


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT access token.
    """
    to_encode = data.copy()
    # Fix warning: Thay utcnow() bằng datetime.now(timezone.utc)
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.access_token_expire_minutes
        )
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=settings.algorithm
    )
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """
    Create a JWT refresh token.
    """
    to_encode = data.copy()
    # Fix warning: Thay utcnow() bằng datetime.now(timezone.utc)
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=settings.algorithm
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """
    Decode and validate a JWT token.
    Returns payload if valid, None otherwise.
    """
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm]
        )
        return payload
    except JWTError:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Dependency to extract and validate the current user from JWT token.
    Raises 401 if token is missing, expired, or invalid.
    """
    token = credentials.credentials
    payload = decode_token(token)
    
    unauthorized_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "UNAUTHORIZED", "message": "Invalid or expired token", "details": None}
    )
    
    if payload is None:
        raise unauthorized_exception
    
    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise unauthorized_exception
    
    # Ép chuỗi string từ token về lại object UUID để SQLAlchemy không bị lỗi trên SQLite
    try:
        user_id_obj = uuid.UUID(user_id_str)
    except ValueError:
        raise unauthorized_exception
    
    query = select(User).where(User.id == user_id_obj)
    result = await db.execute(query)
    user = result.scalars().first()

    if user is None or not user.is_active:
        raise unauthorized_exception
        
    return user


async def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency to verify the current user has ADMIN role.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Admin access required", "details": None}
        )
    return current_user