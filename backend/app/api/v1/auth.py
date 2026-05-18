"""
Authentication routes.
"""

from fastapi import APIRouter, Depends, Response, Request, Cookie, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.services import auth_service
from app.core.config import settings
from app.core.security import get_current_user
from app.db.models import User

from app.core.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


def _cookie_secure() -> bool:
    return settings.app_env.lower() == "production"


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
@limiter.limit("10/minute")
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register new user."""
    user = await auth_service.register_user(db, data)
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, response: Response, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login user, return access token, and set refresh token in cookie."""
    result = await auth_service.login_user(db, data)
    
    # Set HttpOnly Cookie
    response.set_cookie(
        key="brainsync_refresh",
        value=result["refresh_token"],
        httponly=True,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        samesite="lax",
        secure=_cookie_secure(),
        path="/",
    )
    
    return {"access_token": result["access_token"], "token_type": "bearer"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(response: Response, brainsync_refresh: str = Cookie(None), db: AsyncSession = Depends(get_db)):
    """Refresh access token."""
    if not brainsync_refresh:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Refresh token missing", "details": None}
        )
        
    result = await auth_service.refresh_access_token(db, brainsync_refresh)
    return result


@router.post("/logout")
async def logout(response: Response, brainsync_refresh: str = Cookie(None), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Logout user and revoke refresh token."""
    if brainsync_refresh:
        await auth_service.logout_user(db, brainsync_refresh)
    
    # Properly delete the cookie with same settings as set
    response.delete_cookie(
        key="brainsync_refresh",
        path="/",
        samesite="lax",
        secure=_cookie_secure(),
        httponly=True
    )
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user."""
    return current_user
