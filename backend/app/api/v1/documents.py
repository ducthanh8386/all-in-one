"""
Document routes.
TODO: Implement in Phase 2
"""

from fastapi import APIRouter

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("")
async def list_documents():
    """List user documents. TODO: Phase 2"""
    pass


@router.post("/upload")
async def upload_document():
    """Upload PDF document. TODO: Phase 2"""
    pass


@router.get("/{id}")
async def get_document(id: int):
    """Get document detail. TODO: Phase 2"""
    pass


@router.delete("/{id}")
async def delete_document(id: int):
    """Delete document. TODO: Phase 2"""
    pass


@router.post("/{id}/chat")
async def chat_with_document(id: int):
    """Chat with document (SSE streaming). TODO: Phase 2"""
    pass
