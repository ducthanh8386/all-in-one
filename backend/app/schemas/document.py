"""
Document schemas.
TODO: Implement in Phase 2
"""

from pydantic import BaseModel
from typing import Optional


class DocumentResponse(BaseModel):
    id: int
    title: str
    status: str
    created_at: str

    class Config:
        from_attributes = True
