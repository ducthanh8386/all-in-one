"""
Flashcard schemas.
TODO: Implement in Phase 3
"""

from pydantic import BaseModel


class FlashcardResponse(BaseModel):
    id: int
    front_text: str
    back_text: str
    next_review_date: str

    class Config:
        from_attributes = True
