"""
Flashcard routes.
TODO: Implement in Phase 3
"""

from fastapi import APIRouter

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


@router.get("/due")
async def get_due_flashcards():
    """Get flashcards due today. TODO: Phase 3"""
    pass


@router.get("")
async def list_flashcards():
    """List flashcards. TODO: Phase 3"""
    pass


@router.post("")
async def create_flashcard():
    """Create flashcard. TODO: Phase 3"""
    pass


@router.put("/{id}")
async def update_flashcard(id: int):
    """Update flashcard. TODO: Phase 3"""
    pass


@router.delete("/{id}")
async def delete_flashcard(id: int):
    """Delete flashcard. TODO: Phase 3"""
    pass


@router.post("/{id}/review")
async def review_flashcard(id: int):
    """Review flashcard (SM-2). TODO: Phase 3"""
    pass
