"""
Schedule routes.
TODO: Implement in Phase 4
"""

from fastapi import APIRouter

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.get("")
async def list_schedules():
    """List schedules. TODO: Phase 4"""
    pass


@router.get("/today")
async def get_today_schedules():
    """Get today schedules. TODO: Phase 4"""
    pass


@router.post("")
async def create_schedule():
    """Create schedule. TODO: Phase 4"""
    pass


@router.put("/{id}")
async def update_schedule(id: int):
    """Update schedule. TODO: Phase 4"""
    pass


@router.delete("/{id}")
async def delete_schedule(id: int):
    """Delete schedule. TODO: Phase 4"""
    pass
