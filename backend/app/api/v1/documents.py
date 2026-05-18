"""
Document API endpoints:
  GET  /api/v1/documents          — list user documents
  POST /api/v1/documents/upload   — upload PDF (multipart/form-data)
  GET  /api/v1/documents/{id}     — document detail / status
  DELETE /api/v1/documents/{id}   — delete document
  POST /api/v1/documents/{id}/chat — chat with document (SSE streaming)
"""

import logging
import os
import uuid as uuid_lib
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_current_user
from app.db.models import Document, DocumentStatus, Flashcard, User
from app.db.session import get_db
from app.schemas.document import DocumentResponse, UploadResponse, ChatRequest
from app.services import ai_service
from app.workers.document_tasks import process_document_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

# ─── Error helpers ────────────────────────────────────────────────────────────

def _error(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"error": {"code": code, "message": message, "details": None}},
    )


# ─── GET /documents ──────────────────────────────────────────────────────────

@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all documents belonging to the authenticated user."""
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()


# ─── POST /documents/upload ───────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a PDF document.
    - Validates content-type and size.
    - Saves to UPLOAD_DIR/{user_id}/{uuid}.pdf (no original filename kept).
    - Creates a DB record with status=PENDING.
    - Triggers Celery task process_document_task.
    - Returns 202 with document_id immediately.
    """
    # ── Validate content-type ─────────────────────────────────────────────────
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise _error("INVALID_FILE_TYPE", "Only PDF files are accepted.", 415)

    # Read into memory to check size (also validates content early)
    content = await file.read()

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise _error(
            "FILE_TOO_LARGE",
            f"File exceeds maximum size of {settings.max_upload_size_mb}MB.",
            413,
        )

    # Verify PDF magic bytes (%PDF)
    if not content.startswith(b"%PDF"):
        raise _error("INVALID_FILE_TYPE", "Only PDF files are accepted.", 415)

    # ── Save file ─────────────────────────────────────────────────────────────
    user_dir = os.path.join(settings.upload_dir, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)

    file_uuid = str(uuid_lib.uuid4())
    save_path = os.path.join(user_dir, f"{file_uuid}.pdf")

    with open(save_path, "wb") as f:
        f.write(content)

    original_name = file.filename or "Unnamed Document"
    # Strip extension from title
    title = os.path.splitext(original_name)[0][:255]

    # ── Create DB record ──────────────────────────────────────────────────────
    document = Document(
        user_id=current_user.id,
        title=title,
        file_path=save_path,
        status=DocumentStatus.PENDING,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    # ── Trigger Celery task ───────────────────────────────────────────────────
    process_document_task.delay(document.id)
    logger.info("Document %d queued for processing (user=%s)", document.id, current_user.id)

    return UploadResponse(
        document_id=document.id,
        title=document.title,
        status=document.status,
        message="Document uploaded and queued for processing.",
    )


# ─── GET /documents/{id} ─────────────────────────────────────────────────────

@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detail / processing status of a single document."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    document = result.scalars().first()
    if not document:
        raise _error("NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)
    return document


# ─── DELETE /documents/{id} ──────────────────────────────────────────────────

@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a document record and its associated file."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    document = result.scalars().first()
    if not document:
        raise _error("NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)

    # Delete file from filesystem
    if document.file_path and os.path.exists(document.file_path):
        try:
            os.remove(document.file_path)
        except OSError as exc:
            logger.warning("Could not delete file %s: %s", document.file_path, exc)

    # Delete from DB (flashcards cascade via FK)
    await db.delete(document)
    await db.commit()


# ─── POST /documents/{id}/chat (SSE Streaming) ───────────────────────────────

@router.post("/{doc_id}/chat")
async def chat_with_document(
    doc_id: int,
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Chat with a processed document using Hybrid RAG.
    Returns a StreamingResponse (SSE format).
    Deducts 1 ai_quota on success.
    """
    # ── Fetch document ────────────────────────────────────────────────────────
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    document = result.scalars().first()
    if not document:
        raise _error("NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)

    if document.status != DocumentStatus.COMPLETED:
        raise _error(
            "VALIDATION_ERROR",
            "Document is not ready for chat (status must be COMPLETED).",
            400,
        )

    # ── Quota check ───────────────────────────────────────────────────────────
    if current_user.ai_quota <= 0:
        raise _error("QUOTA_EXCEEDED", "AI quota exhausted. Contact admin to refill.", 403)

    # ── Deduct quota (optimistic, before stream) ──────────────────────────────
    current_user.ai_quota -= 1
    await db.commit()

    collection_name = document.vector_collection_name

    # ── Run hybrid search (sync, in executor) ────────────────────────────────
    import asyncio
    loop = asyncio.get_event_loop()
    context = await loop.run_in_executor(
        None, ai_service.hybrid_search, collection_name, request.question
    )

    # ── SSE generator ─────────────────────────────────────────────────────────
    async def sse_generator():
        async for chunk in ai_service.stream_rag_answer(context, request.question):
            yield chunk

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
