"""Deterministic quiz generation from existing flashcards."""

import random
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Flashcard
from app.schemas.quiz import QuizQuestion


async def build_quiz(
    db: AsyncSession,
    user_id: UUID,
    doc_id: Optional[int] = None,
    limit: int = 10,
) -> list[QuizQuestion]:
    query = select(Flashcard).where(Flashcard.user_id == user_id)
    if doc_id is not None:
        query = query.where(Flashcard.doc_id == doc_id)
    result = await db.execute(query.order_by(Flashcard.id.asc()))
    cards = list(result.scalars().all())

    rng = random.Random()
    question_cards = cards[:]
    rng.shuffle(question_cards)
    question_cards = question_cards[: max(1, min(limit, len(question_cards)))]

    questions: list[QuizQuestion] = []
    for card in question_cards:
        wrong_pool = list({
            other.back_text
            for other in cards
            if other.id != card.id and other.back_text != card.back_text
        })
        rng.shuffle(wrong_pool)

        options = [card.back_text]
        for wrong in wrong_pool:
            options.append(wrong)
            if len(options) == 4:
                break

        if len(options) < 4:
            continue

        options = options[:4]
        rng.shuffle(options)
        questions.append(
            QuizQuestion(
                card_id=card.id,
                question=card.front_text,
                options=options,
                correct_option_index=options.index(card.back_text),
            )
        )

    return questions
