"""Quiz practice API."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.models import Document, Flashcard, User
from app.db.session import get_db
from app.schemas.quiz import QuizResponse
from app.services.quiz_service import build_quiz

router = APIRouter(prefix="/quiz", tags=["quiz"])


def _error(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"error": {"code": code, "message": message, "details": None}},
    )


async def _assert_document_owner(db: AsyncSession, doc_id: int, current_user: User) -> None:
    result = await db.execute(
        select(Document.id).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    if result.scalar_one_or_none() is None:
        raise _error("DOCUMENT_NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)


@router.get("", response_model=QuizResponse)
async def get_quiz(
    doc_id: Optional[int] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if doc_id is not None:
        await _assert_document_owner(db, doc_id, current_user)

    count_query = select(func.count(func.distinct(Flashcard.back_text))).where(Flashcard.user_id == current_user.id)
    if doc_id is not None:
        count_query = count_query.where(Flashcard.doc_id == doc_id)
    total = await db.scalar(count_query)
    if (total or 0) < 4:
        raise _error(
            "QUIZ_NOT_ENOUGH_FLASHCARDS",
            "Cần ít nhất 4 đáp án khác nhau để tạo quiz trắc nghiệm.",
            400,
        )

    questions = await build_quiz(db, current_user.id, doc_id=doc_id, limit=limit)
    return QuizResponse(questions=questions)
