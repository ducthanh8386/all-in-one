"""
Schedule API endpoints.
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.models import Schedule, User
from app.db.session import get_db
from app.schemas.schedule import ScheduleCreate, ScheduleResponse, ScheduleUpdate
from app.services import schedule_service

router = APIRouter(prefix="/schedules", tags=["schedules"])


def _error(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"error": {"code": code, "message": message, "details": None}},
    )


async def _get_schedule_or_404(
    schedule_id: int,
    current_user: User,
    db: AsyncSession,
) -> Schedule:
    schedule = await schedule_service.get_schedule_by_id(
        db,
        current_user.id,
        schedule_id,
    )
    if not schedule:
        raise _error("NOT_FOUND", f"Schedule with id {schedule_id} does not exist.", 404)
    return schedule


@router.get("", response_model=List[ScheduleResponse])
async def list_schedules(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List schedules for the current user, optionally filtered by time range."""
    if start is not None and end is not None and end <= start:
        raise _error("VALIDATION_ERROR", "end query parameter must be after start.", 400)

    schedules = await schedule_service.list_schedules(
        db,
        current_user.id,
        start=start,
        end=end,
    )
    return await schedule_service.serialize_schedules(db, current_user.id, schedules)


@router.get("/today", response_model=List[ScheduleResponse])
async def get_today_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return today's schedules with due flashcard counts."""
    schedules = await schedule_service.list_today_schedules(db, current_user.id)
    return await schedule_service.serialize_schedules(db, current_user.id, schedules)


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new schedule."""
    try:
        schedule = await schedule_service.create_schedule(db, current_user.id, payload)
    except RuntimeError as exc:
        if str(exc) == "SCHEDULE_OVERLAP":
            raise _error("SCHEDULE_OVERLAP", "Schedule overlaps an existing schedule.", 400)
        raise
    except ValueError as exc:
        raise _error("VALIDATION_ERROR", str(exc), 400)

    response = await schedule_service.serialize_schedules(db, current_user.id, [schedule])
    return response[0]


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: int,
    payload: ScheduleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a schedule."""
    schedule = await _get_schedule_or_404(schedule_id, current_user, db)
    try:
        updated = await schedule_service.update_schedule(
            db,
            current_user.id,
            schedule,
            payload,
        )
    except RuntimeError as exc:
        if str(exc) == "SCHEDULE_OVERLAP":
            raise _error("SCHEDULE_OVERLAP", "Schedule overlaps an existing schedule.", 400)
        raise
    except ValueError as exc:
        raise _error("VALIDATION_ERROR", str(exc), 400)

    response = await schedule_service.serialize_schedules(db, current_user.id, [updated])
    return response[0]


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a schedule."""
    schedule = await _get_schedule_or_404(schedule_id, current_user, db)
    await schedule_service.delete_schedule(db, schedule)
