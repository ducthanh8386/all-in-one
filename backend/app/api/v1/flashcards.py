"""
Flashcard API endpoints — Phase 3.

Routes (all protected by get_current_user):
  POST   /api/v1/flashcards/generate/{document_id}  — AI generation from document
  GET    /api/v1/flashcards                          — List (filter by doc_id, due_for_review)
  GET    /api/v1/flashcards/due                      — Alias: only due cards
  POST   /api/v1/flashcards                          — Manual create
  PUT    /api/v1/flashcards/{id}                     — Edit front/back
  DELETE /api/v1/flashcards/{id}                     — Delete
  POST   /api/v1/flashcards/{id}/review              — SM-2 review (quality 0-5)
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import get_current_user
from app.db.models import Document, DocumentStatus, Flashcard, User
from app.db.session import get_db
from app.schemas.flashcard import (
    FlashcardCreate,
    FlashcardResponse,
    FlashcardUpdate,
    GenerateResponse,
    ReviewRequest,
)
from app.services import flashcard_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


# ─── Error helper ─────────────────────────────────────────────────────────────

def _error(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"error": {"code": code, "message": message, "details": None}},
    )


# ─── Helper: ownership check ─────────────────────────────────────────────────

async def _get_card_or_404(
    card_id: int,
    current_user: User,
    db: AsyncSession,
) -> Flashcard:
    card = await flashcard_service.get_flashcard_by_id(db, card_id, current_user.id)
    if not card:
        raise _error("NOT_FOUND", f"Flashcard with id {card_id} does not exist.", 404)
    return card


# ─── POST /flashcards/generate/{document_id} ─────────────────────────────────
# NOTE: must be declared BEFORE /{id} routes to avoid route shadowing

@router.post(
    "/generate/{document_id}",
    response_model=GenerateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_flashcards(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger AI-based flashcard generation from an already-processed document.
    Retrieves text chunks from Qdrant, prompts Gemini, bulk-inserts results.
    """
    # ── Verify document ownership and status ──────────────────────────────────
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
    )
    document = result.scalars().first()
    if not document:
        raise _error("NOT_FOUND", f"Document with id {document_id} does not exist.", 404)

    if document.status != DocumentStatus.COMPLETED:
        raise _error(
            "VALIDATION_ERROR",
            "Document must be in COMPLETED status before generating flashcards.",
            400,
        )

    if not document.vector_collection_name:
        raise _error(
            "VALIDATION_ERROR",
            "Document has no vector collection. Re-process the document first.",
            400,
        )

    # ── Quota check ───────────────────────────────────────────────────────────
    if current_user.ai_quota <= 0:
        raise _error("QUOTA_EXCEEDED", "AI quota exhausted. Contact admin to refill.", 403)

    # ── Call AI service ───────────────────────────────────────────────────────
    try:
        from app.services.ai_service import generate_flashcards_from_document
        cards = await generate_flashcards_from_document(
            document_id=document_id,
            collection_name=document.vector_collection_name,
            db=db,
        )
    except ValueError as exc:
        raise _error("VALIDATION_ERROR", str(exc), 400)
    except Exception as exc:
        logger.exception("Flashcard generation failed for doc %d: %s", document_id, exc)
        raise _error("INTERNAL_ERROR", "Flashcard generation failed.", 500)

    # ── Deduct 1 quota per generation call ────────────────────────────────────
    current_user.ai_quota -= 1
    await db.commit()

    return GenerateResponse(
        document_id=document_id,
        generated_count=len(cards),
        message=f"Successfully generated {len(cards)} flashcards.",
    )


# ─── GET /flashcards/due ──────────────────────────────────────────────────────

@router.get("/due", response_model=List[FlashcardResponse])
async def get_due_flashcards(
    doc_id: Optional[int] = Query(None, description="Filter by document"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all flashcards due for review today (next_review_date <= now)."""
    cards = await flashcard_service.get_due_cards(db, current_user.id, doc_id)
    return cards


# ─── GET /flashcards ──────────────────────────────────────────────────────────

@router.get("", response_model=List[FlashcardResponse])
async def list_flashcards(
    doc_id: Optional[int] = Query(None, description="Filter by document id"),
    due_for_review: bool = Query(False, description="Return only due cards"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all flashcards for the authenticated user, with optional filters."""
    cards = await flashcard_service.list_user_flashcards(
        db, current_user.id, doc_id=doc_id, due_only=due_for_review
    )
    return cards


# ─── POST /flashcards ─────────────────────────────────────────────────────────

@router.post("", response_model=FlashcardResponse, status_code=status.HTTP_201_CREATED)
async def create_flashcard(
    payload: FlashcardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually create a new flashcard (optionally linked to a document)."""
    # Optionally verify doc ownership
    if payload.doc_id is not None:
        doc_result = await db.execute(
            select(Document).where(
                Document.id == payload.doc_id,
                Document.user_id == current_user.id,
            )
        )
        if not doc_result.scalars().first():
            raise _error("NOT_FOUND", f"Document with id {payload.doc_id} does not exist.", 404)

    card = await flashcard_service.create_flashcard(
        db,
        user_id=current_user.id,
        front_text=payload.front_text,
        back_text=payload.back_text,
        doc_id=payload.doc_id,
    )
    return card


# ─── PUT /flashcards/{id} ─────────────────────────────────────────────────────

@router.put("/{card_id}", response_model=FlashcardResponse)
async def update_flashcard(
    card_id: int,
    payload: FlashcardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update front_text and/or back_text of an existing flashcard."""
    card = await _get_card_or_404(card_id, current_user, db)

    if payload.front_text is None and payload.back_text is None:
        raise _error("VALIDATION_ERROR", "Nothing to update — provide front_text or back_text.", 400)

    updated = await flashcard_service.update_flashcard(
        db, card,
        front_text=payload.front_text,
        back_text=payload.back_text,
    )
    return updated


# ─── DELETE /flashcards/{id} ─────────────────────────────────────────────────

@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flashcard(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a flashcard."""
    card = await _get_card_or_404(card_id, current_user, db)
    await flashcard_service.delete_flashcard(db, card)


# ─── POST /flashcards/{id}/review ────────────────────────────────────────────

@router.post("/{card_id}/review", response_model=FlashcardResponse)
async def review_flashcard(
    card_id: int,
    payload: ReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a review result for a flashcard.
    Applies the SM-2 algorithm and updates next_review_date.

    quality: 0–5
      0-2 → card is reset (repetition_count=0, interval=1 day)
      3-5 → interval increases based on ease factor
    """
    card = await _get_card_or_404(card_id, current_user, db)
    updated = await flashcard_service.record_review(db, card, payload.quality)
    return updated
