"""
Authentication routes.
TODO: Implement in Phase 1
"""

from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register():
    """Register new user. TODO: Phase 1"""
    pass


@router.post("/login")
async def login():
    """Login user. TODO: Phase 1"""
    pass


@router.post("/refresh")
async def refresh():
    """Refresh access token. TODO: Phase 1"""
    pass


@router.post("/logout")
async def logout():
    """Logout user. TODO: Phase 1"""
    pass


@router.get("/me")
async def get_current_user():
    """Get current user. TODO: Phase 1"""
    pass
