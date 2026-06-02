"""
Schedule service layer.
"""

from datetime import datetime, time, timezone
from typing import Iterable, List, Optional
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Document, DocumentStatus, Flashcard, Schedule
from app.schemas.schedule import ScheduleCreate, ScheduleResponse, ScheduleUpdate


async def check_overlap(
    db: AsyncSession,
    user_id: UUID,
    start_time: datetime,
    end_time: datetime,
    exclude_id: Optional[int] = None,
) -> bool:
    """
    Return True when a user's schedule overlaps the proposed time range.
    Overlap rule: NOT (existing.end_time <= new.start OR existing.start_time >= new.end)
    """
    query = select(Schedule.id).where(
        Schedule.user_id == user_id,
        not_(
            or_(
                Schedule.end_time <= start_time,
                Schedule.start_time >= end_time,
            )
        ),
    )
    if exclude_id is not None:
        query = query.where(Schedule.id != exclude_id)

    result = await db.execute(query.limit(1))
    return result.scalar_one_or_none() is not None


async def ensure_reference_document(
    db: AsyncSession,
    user_id: UUID,
    reference_doc_id: Optional[int],
) -> None:
    """Validate that a referenced document belongs to the current user."""
    if reference_doc_id is None:
        return

    result = await db.execute(
        select(Document.id).where(
            Document.id == reference_doc_id,
            Document.user_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise ValueError("Referenced document does not exist.")


async def list_schedules(
    db: AsyncSession,
    user_id: UUID,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> List[Schedule]:
    """List schedules for a user, optionally intersecting a date range."""
    query = select(Schedule).where(Schedule.user_id == user_id)
    if start is not None and end is not None:
        query = query.where(
            not_(
                or_(
                    Schedule.end_time <= start,
                    Schedule.start_time >= end,
                )
            )
        )
    elif start is not None:
        query = query.where(Schedule.end_time >= start)
    elif end is not None:
        query = query.where(Schedule.start_time <= end)

    query = query.order_by(Schedule.start_time.asc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_schedule_by_id(
    db: AsyncSession,
    user_id: UUID,
    schedule_id: int,
) -> Optional[Schedule]:
    """Fetch one schedule by id, scoped to the current user."""
    result = await db.execute(
        select(Schedule).where(
            Schedule.id == schedule_id,
            Schedule.user_id == user_id,
        )
    )
    return result.scalars().first()


async def create_schedule(
    db: AsyncSession,
    user_id: UUID,
    payload: ScheduleCreate,
) -> Schedule:
    """Create a schedule after reference-document and overlap validation."""
    await ensure_reference_document(db, user_id, payload.reference_doc_id)
    if await check_overlap(db, user_id, payload.start_time, payload.end_time):
        raise RuntimeError("SCHEDULE_OVERLAP")

    schedule = Schedule(
        user_id=user_id,
        title=payload.title,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        is_recurring=payload.is_recurring,
        recurrence_rule=payload.recurrence_rule,
        reference_doc_id=payload.reference_doc_id,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


async def update_schedule(
    db: AsyncSession,
    user_id: UUID,
    schedule: Schedule,
    payload: ScheduleUpdate,
) -> Schedule:
    """Update a schedule after validating the resulting time range."""
    data = payload.model_dump(exclude_unset=True)
    if "reference_doc_id" in data:
        await ensure_reference_document(db, user_id, data["reference_doc_id"])

    next_start = data.get("start_time", schedule.start_time)
    next_end = data.get("end_time", schedule.end_time)
    if next_end <= next_start:
        raise ValueError("end_time must be after start_time")

    if await check_overlap(db, user_id, next_start, next_end, exclude_id=schedule.id):
        raise RuntimeError("SCHEDULE_OVERLAP")

    for key, value in data.items():
        setattr(schedule, key, value)

    await db.commit()
    await db.refresh(schedule)
    return schedule


async def delete_schedule(db: AsyncSession, schedule: Schedule) -> None:
    """Delete a schedule."""
    await db.delete(schedule)
    await db.commit()


async def get_due_counts_by_doc(
    db: AsyncSession,
    user_id: UUID,
    doc_ids: Iterable[int],
) -> dict[int, int]:
    """Return due flashcard counts keyed by document id."""
    doc_id_list = [doc_id for doc_id in set(doc_ids) if doc_id is not None]
    if not doc_id_list:
        return {}

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Flashcard.doc_id, func.count(Flashcard.id))
        .where(
            Flashcard.user_id == user_id,
            Flashcard.doc_id.in_(doc_id_list),
            Flashcard.next_review_date <= now,
        )
        .group_by(Flashcard.doc_id)
    )
    return {int(doc_id): int(count) for doc_id, count in result.all() if doc_id is not None}


async def serialize_schedules(
    db: AsyncSession,
    user_id: UUID,
    schedules: Iterable[Schedule],
) -> List[ScheduleResponse]:
    """Attach due flashcard counts to Schedule ORM rows."""
    schedule_list = list(schedules)
    due_counts = await get_due_counts_by_doc(
        db,
        user_id,
        [schedule.reference_doc_id for schedule in schedule_list if schedule.reference_doc_id],
    )
    return [
        ScheduleResponse.model_validate(schedule).model_copy(
            update={"flashcard_due_count": due_counts.get(schedule.reference_doc_id or -1, 0)}
        )
        for schedule in schedule_list
    ]


async def list_today_schedules(
    db: AsyncSession,
    user_id: UUID,
) -> List[Schedule]:
    """List schedules intersecting today's configured local day."""
    try:
        local_tz = ZoneInfo(settings.app_timezone)
    except ZoneInfoNotFoundError:
        local_tz = timezone.utc

    now = datetime.now(local_tz)
    start = datetime.combine(now.date(), time.min, tzinfo=local_tz).astimezone(timezone.utc)
    end = datetime.combine(now.date(), time.max, tzinfo=local_tz).astimezone(timezone.utc)
    return await list_schedules(db, user_id, start=start, end=end)
