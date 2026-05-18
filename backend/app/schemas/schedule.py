"""
Schedule request and response schemas.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator, model_validator


class ScheduleBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_recurring: bool = False
    recurrence_rule: Optional[str] = None
    reference_doc_id: Optional[int] = None

    @field_validator("title")
    @classmethod
    def title_must_not_be_empty(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("title must not be empty")
        return title

    @field_validator("description", "recurrence_rule", mode="before")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def end_time_must_be_after_start_time(self) -> "ScheduleBase":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ScheduleCreate(ScheduleBase):
    """Payload for creating a schedule."""


class ScheduleUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_recurring: Optional[bool] = None
    recurrence_rule: Optional[str] = None
    reference_doc_id: Optional[int] = None

    @field_validator("title")
    @classmethod
    def title_must_not_be_empty(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        title = value.strip()
        if not title:
            raise ValueError("title must not be empty")
        return title

    @field_validator("description", "recurrence_rule", mode="before")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ScheduleResponse(BaseModel):
    id: int
    user_id: uuid.UUID
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_recurring: bool
    recurrence_rule: Optional[str] = None
    reference_doc_id: Optional[int] = None
    created_at: datetime
    flashcard_due_count: int = 0

    model_config = {"from_attributes": True}
