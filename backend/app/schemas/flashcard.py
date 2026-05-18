"""
Flashcard Pydantic schemas — Phase 3.

Covers: create, read (response), update, and SM-2 review request.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


# ─── Create ──────────────────────────────────────────────────────────────────

class FlashcardCreate(BaseModel):
    """Payload to manually create a new flashcard."""
    front_text: str
    back_text: str
    doc_id: Optional[int] = None

    @field_validator("front_text", "back_text")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field must not be empty.")
        return v.strip()


# ─── Update ──────────────────────────────────────────────────────────────────

class FlashcardUpdate(BaseModel):
    """Payload to update front/back text of a flashcard."""
    front_text: Optional[str] = None
    back_text: Optional[str] = None

    @field_validator("front_text", "back_text", mode="before")
    @classmethod
    def strip_if_present(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Field must not be empty if provided.")
        return v.strip() if v else v


# ─── Review ──────────────────────────────────────────────────────────────────

class ReviewRequest(BaseModel):
    """
    SM-2 review quality score.
    quality: int in range 0–5
      0 = Complete blackout
      1 = Wrong, but correct answer felt familiar
      2 = Wrong, but correct answer was easy to recall
      3 = Correct, but required significant difficulty
      4 = Correct, after hesitation
      5 = Perfect response
    """
    quality: int

    @field_validator("quality")
    @classmethod
    def quality_in_range(cls, v: int) -> int:
        if not 0 <= v <= 5:
            raise ValueError("quality must be an integer between 0 and 5 (inclusive).")
        return v


# ─── Response ─────────────────────────────────────────────────────────────────

class FlashcardResponse(BaseModel):
    """Full flashcard representation returned from the API."""
    id: int
    doc_id: Optional[int]
    user_id: uuid.UUID          # Pydantic v2 auto-serialises UUID → str in JSON
    front_text: str
    back_text: str
    repetition_count: int
    ease_factor: float
    interval_days: int
    next_review_date: datetime

    model_config = {"from_attributes": True}


# ─── Generate ─────────────────────────────────────────────────────────────────

class GenerateResponse(BaseModel):
    """Response returned after triggering AI flashcard generation."""
    document_id: int
    generated_count: int
    message: str
