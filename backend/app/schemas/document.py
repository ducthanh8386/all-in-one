"""
Document Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum


class DocumentStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class DocumentResponse(BaseModel):
    """Response schema for a document record."""
    id: int
    title: str
    status: DocumentStatus
    vector_collection_name: Optional[str] = None
    error_message: Optional[str] = None
    file_path: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    """Response schema for a successful document upload."""
    document_id: int
    title: str
    status: DocumentStatus
    message: str


class ChatRequest(BaseModel):
    """Request schema for chatting with a document."""
    question: str

    @field_validator("question")
    @classmethod
    def question_must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Question must not be empty.")
        return v.strip()


class ChatStreamChunk(BaseModel):
    """Schema for a single SSE streaming chunk."""
    chunk: str
