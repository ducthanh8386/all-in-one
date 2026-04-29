"""
Admin routes.
TODO: Implement in Phase 6
"""

from fastapi import APIRouter

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
async def list_users():
    """List all users. TODO: Phase 6"""
    pass


@router.put("/users/{id}/quota")
async def update_user_quota(id: str):
    """Update user AI quota. TODO: Phase 6"""
    pass


@router.put("/users/{id}/status")
async def update_user_status(id: str):
    """Update user status. TODO: Phase 6"""
    pass
