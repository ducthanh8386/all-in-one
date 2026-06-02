"""Flashcard endpoints for manual study, SM-2 review, and CSV import."""

import csv
import io
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.models import Document, Flashcard, User
from app.db.session import get_db
from app.schemas.flashcard import (
    FlashcardCreate,
    FlashcardResponse,
    FlashcardUpdate,
    GenerateResponse,
    ImportFlashcardsResponse,
    ImportErrorItem,
    ReviewRequest,
)
from app.services import flashcard_service
from app.services.exam_planner_service import assert_subject_chapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


def _error(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"error": {"code": code, "message": message, "details": None}},
    )


async def _assert_document_owner(
    db: AsyncSession,
    doc_id: int,
    current_user: User,
) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    document = result.scalars().first()
    if not document:
        raise _error("DOCUMENT_NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)
    return document


async def _get_card_or_404(
    card_id: int,
    current_user: User,
    db: AsyncSession,
) -> Flashcard:
    card = await flashcard_service.get_flashcard_by_id(db, card_id, current_user.id)
    if not card:
        raise _error("FLASHCARD_NOT_FOUND", f"Flashcard with id {card_id} does not exist.", 404)
    return card


@router.post(
    "/generate/{document_id}",
    response_model=GenerateResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
async def generate_flashcards(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI generation is intentionally disabled in the non-AI MVP."""
    await _assert_document_owner(db, document_id, current_user)
    raise _error(
        "AI_FEATURE_IN_DEVELOPMENT",
        "Tính năng AI đang phát triển.",
        status.HTTP_501_NOT_IMPLEMENTED,
    )


@router.get("/due", response_model=List[FlashcardResponse])
async def get_due_flashcards(
    doc_id: Optional[int] = Query(None, description="Filter by document"),
    subject_id: Optional[int] = Query(None, description="Filter by subject"),
    chapter_id: Optional[int] = Query(None, description="Filter by chapter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if doc_id is not None:
        await _assert_document_owner(db, doc_id, current_user)
    if subject_id is not None:
        try:
            await assert_subject_chapter(db, current_user.id, subject_id, chapter_id)
        except ValueError:
            raise _error("SUBJECT_OR_CHAPTER_NOT_FOUND", "Subject or chapter not found.", 404)
    return await flashcard_service.get_due_cards(db, current_user.id, doc_id, subject_id=subject_id, chapter_id=chapter_id)


@router.get("", response_model=List[FlashcardResponse])
async def list_flashcards(
    doc_id: Optional[int] = Query(None, description="Filter by document id"),
    subject_id: Optional[int] = Query(None, description="Filter by subject id"),
    chapter_id: Optional[int] = Query(None, description="Filter by chapter id"),
    due_for_review: bool = Query(False, description="Return only due cards"),
    q: Optional[str] = Query(None, description="Search front, back, or tag"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if doc_id is not None:
        await _assert_document_owner(db, doc_id, current_user)
    if subject_id is not None:
        try:
            await assert_subject_chapter(db, current_user.id, subject_id, chapter_id)
        except ValueError:
            raise _error("SUBJECT_OR_CHAPTER_NOT_FOUND", "Subject or chapter not found.", 404)
    return await flashcard_service.list_user_flashcards(
        db,
        current_user.id,
        doc_id=doc_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
        due_only=due_for_review,
        q=q,
    )


@router.post("", response_model=FlashcardResponse, status_code=status.HTTP_201_CREATED)
async def create_flashcard(
    payload: FlashcardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.doc_id is not None:
        await _assert_document_owner(db, payload.doc_id, current_user)
    if payload.subject_id is not None:
        try:
            await assert_subject_chapter(db, current_user.id, payload.subject_id, payload.chapter_id)
        except ValueError:
            raise _error("SUBJECT_OR_CHAPTER_NOT_FOUND", "Subject or chapter not found.", 404)

    return await flashcard_service.create_flashcard(
        db,
        user_id=current_user.id,
        front_text=payload.front_text,
        back_text=payload.back_text,
        doc_id=payload.doc_id,
        subject_id=payload.subject_id,
        chapter_id=payload.chapter_id,
        tag=payload.tag,
    )


@router.post("/import", response_model=ImportFlashcardsResponse)
async def import_flashcards(
    file: UploadFile = File(...),
    doc_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    if not filename.endswith(".csv") and content_type not in {"text/csv", "application/vnd.ms-excel"}:
        raise _error("INVALID_FILE_TYPE", "Only CSV files are accepted.", 415)

    if doc_id is not None:
        await _assert_document_owner(db, doc_id, current_user)

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            raise _error("INVALID_CSV_FORMAT", "CSV file must be UTF-8 encoded.", 400)

    if not text.strip():
        return ImportFlashcardsResponse(created=0, skipped=0, errors=[])

    reader = csv.DictReader(io.StringIO(text))
    fieldnames = {name.strip().lower() for name in (reader.fieldnames or []) if name}
    if not {"front", "back"}.issubset(fieldnames):
        raise _error("INVALID_CSV_FORMAT", "CSV must include front and back columns.", 400)

    rows: list[dict] = []
    errors: list[ImportErrorItem] = []
    skipped = 0

    for row_number, row in enumerate(reader, start=2):
        normalized = {str(k).strip().lower(): (v or "").strip() for k, v in row.items() if k}
        if not any(normalized.values()):
            continue
        front = normalized.get("front", "")
        back = normalized.get("back", "")
        tag = normalized.get("tag") or None
        if not front or not back:
            skipped += 1
            errors.append(ImportErrorItem(row=row_number, message="Missing front or back."))
            continue
        rows.append({"front": front, "back": back, "tag": tag})

    created = await flashcard_service.bulk_insert_flashcards(
        db,
        user_id=current_user.id,
        doc_id=doc_id,
        cards=rows,
    )
    return ImportFlashcardsResponse(created=created, skipped=skipped, errors=errors)


@router.put("/{card_id}", response_model=FlashcardResponse)
async def update_flashcard(
    card_id: int,
    payload: FlashcardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_or_404(card_id, current_user, db)

    if payload.front_text is None and payload.back_text is None and payload.tag is None and payload.subject_id is None and payload.chapter_id is None:
        raise _error("VALIDATION_ERROR", "Nothing to update.", 400)
    if payload.subject_id is not None:
        try:
            await assert_subject_chapter(db, current_user.id, payload.subject_id, payload.chapter_id)
        except ValueError:
            raise _error("SUBJECT_OR_CHAPTER_NOT_FOUND", "Subject or chapter not found.", 404)

    return await flashcard_service.update_flashcard(
        db,
        card,
        front_text=payload.front_text,
        back_text=payload.back_text,
        tag=payload.tag if "tag" in payload.model_fields_set else flashcard_service.UNSET,
        subject_id=payload.subject_id if "subject_id" in payload.model_fields_set else flashcard_service.UNSET,
        chapter_id=payload.chapter_id if "chapter_id" in payload.model_fields_set else flashcard_service.UNSET,
    )


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flashcard(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_or_404(card_id, current_user, db)
    await flashcard_service.delete_flashcard(db, card)


@router.post("/{card_id}/review", response_model=FlashcardResponse)
async def review_flashcard(
    card_id: int,
    payload: ReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_or_404(card_id, current_user, db)
    return await flashcard_service.record_review(db, card, payload.quality)
