"""
Flashcard Service — Phase 3.

Implements:
  - SM-2 spaced repetition algorithm (exact formula from PRD §6.2)
  - CRUD helpers (async SQLAlchemy)
  - get_due_cards, get_by_doc
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Document, DocumentStatus, Flashcard

logger = logging.getLogger(__name__)


# ─── SM-2 Algorithm ───────────────────────────────────────────────────────────

def apply_sm2(
    repetition_count: int,
    ease_factor: float,
    interval_days: int,
    quality: int,
) -> tuple[int, float, int]:
    """
    Apply the SM-2 spaced repetition algorithm.

    Exact formula from PRD §6.2:
      If quality >= 3 (remembered):
        EF_new = EF_old + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        If EF_new < 1.3 → EF_new = 1.3
        If repetition_count == 0 → I = 1
        If repetition_count == 1 → I = 6
        If repetition_count > 1  → I = round(I_old * EF_new)
        repetition_count += 1
      If quality < 3 (forgotten):
        repetition_count = 0
        interval_days = 1
        EF unchanged

    Returns:
        (new_repetition_count, new_ease_factor, new_interval_days)
    """
    if quality >= 3:
        # Update ease factor
        ef_new = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        ef_new = max(ef_new, 1.3)

        # Calculate next interval
        if repetition_count == 0:
            new_interval = 1
        elif repetition_count == 1:
            new_interval = 6
        else:
            new_interval = round(interval_days * ef_new)

        new_repetition = repetition_count + 1
        return new_repetition, ef_new, new_interval
    else:
        # Forgotten — reset streak but keep EF
        return 0, ease_factor, 1


# ─── DB Helpers ───────────────────────────────────────────────────────────────

async def get_flashcard_by_id(
    db: AsyncSession,
    flashcard_id: int,
    user_id: UUID,
) -> Optional[Flashcard]:
    """Fetch a single flashcard by id, scoped to the requesting user."""
    result = await db.execute(
        select(Flashcard).where(
            Flashcard.id == flashcard_id,
            Flashcard.user_id == user_id,
        )
    )
    return result.scalars().first()


async def get_due_cards(
    db: AsyncSession,
    user_id: UUID,
    doc_id: Optional[int] = None,
) -> List[Flashcard]:
    """Return flashcards whose next_review_date <= now, optionally filtered by doc."""
    now = datetime.now(timezone.utc)
    query = select(Flashcard).where(
        Flashcard.user_id == user_id,
        Flashcard.next_review_date <= now,
    )
    if doc_id is not None:
        query = query.where(Flashcard.doc_id == doc_id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_flashcards_by_doc(
    db: AsyncSession,
    user_id: UUID,
    doc_id: int,
) -> List[Flashcard]:
    """Return all flashcards for a given document."""
    result = await db.execute(
        select(Flashcard).where(
            Flashcard.user_id == user_id,
            Flashcard.doc_id == doc_id,
        )
    )
    return list(result.scalars().all())


async def list_user_flashcards(
    db: AsyncSession,
    user_id: UUID,
    doc_id: Optional[int] = None,
    due_only: bool = False,
) -> List[Flashcard]:
    """
    List flashcards for a user.
    Optionally filter by doc_id and/or due_for_review.
    """
    now = datetime.now(timezone.utc)
    query = select(Flashcard).where(Flashcard.user_id == user_id)

    if doc_id is not None:
        query = query.where(Flashcard.doc_id == doc_id)
    if due_only:
        query = query.where(Flashcard.next_review_date <= now)

    query = query.order_by(Flashcard.next_review_date.asc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_flashcard(
    db: AsyncSession,
    user_id: UUID,
    front_text: str,
    back_text: str,
    doc_id: Optional[int] = None,
) -> Flashcard:
    """Create and persist a new flashcard with SM-2 default values."""
    card = Flashcard(
        user_id=user_id,
        doc_id=doc_id,
        front_text=front_text,
        back_text=back_text,
        repetition_count=0,
        ease_factor=2.5,
        interval_days=0,
        next_review_date=datetime.now(timezone.utc),
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card


async def update_flashcard(
    db: AsyncSession,
    card: Flashcard,
    front_text: Optional[str] = None,
    back_text: Optional[str] = None,
) -> Flashcard:
    """Update front/back text of an existing flashcard."""
    if front_text is not None:
        card.front_text = front_text
    if back_text is not None:
        card.back_text = back_text
    await db.commit()
    await db.refresh(card)
    return card


async def delete_flashcard(db: AsyncSession, card: Flashcard) -> None:
    """Hard-delete a flashcard."""
    await db.delete(card)
    await db.commit()


async def record_review(
    db: AsyncSession,
    card: Flashcard,
    quality: int,
) -> Flashcard:
    """
    Apply SM-2 to a flashcard and persist the updated schedule.
    Returns the updated Flashcard instance.
    """
    new_rep, new_ef, new_interval = apply_sm2(
        card.repetition_count,
        card.ease_factor,
        card.interval_days,
        quality,
    )
    card.repetition_count = new_rep
    card.ease_factor = new_ef
    card.interval_days = new_interval
    card.next_review_date = datetime.now(timezone.utc) + timedelta(days=new_interval)

    await db.commit()
    await db.refresh(card)
    return card


async def bulk_insert_flashcards(
    db: AsyncSession,
    user_id: UUID,
    doc_id: int,
    cards: List[dict],
) -> int:
    """
    Bulk-insert flashcards from a list of {"front": ..., "back": ...} dicts.
    Returns the number of cards actually inserted.
    """
    now = datetime.now(timezone.utc)
    rows = [
        Flashcard(
            user_id=user_id,
            doc_id=doc_id,
            front_text=card.get("front", "").strip(),
            back_text=card.get("back", "").strip(),
            repetition_count=0,
            ease_factor=2.5,
            interval_days=0,
            next_review_date=now,
        )
        for card in cards
        if card.get("front", "").strip() and card.get("back", "").strip()
    ]
    if rows:
        db.add_all(rows)
        await db.commit()
    logger.info("Bulk-inserted %d flashcards for doc %d", len(rows), doc_id)
    return len(rows)
