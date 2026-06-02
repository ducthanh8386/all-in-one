"""Document workspace endpoints for the non-AI MVP."""

import logging
import os
import uuid as uuid_lib
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_current_user
from app.db.models import Document, DocumentStatus, User
from app.db.session import get_db
from app.schemas.document import ChatRequest, DocumentResponse, DocumentUpdate, UploadResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


def _error(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"error": {"code": code, "message": message, "details": None}},
    )


ALLOWED_FILE_TYPES = {
    "pdf": {"application/pdf", "application/octet-stream"},
    "docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
    },
    "txt": {"text/plain", "application/octet-stream"},
}


def _get_extension(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def _allowed_extensions() -> set[str]:
    configured = {
        item.strip().lower()
        for item in settings.allowed_extensions.split(",")
        if item.strip()
    }
    return configured or {"pdf", "docx", "txt"}


def _is_valid_content(ext: str, content_type: str | None, content: bytes) -> bool:
    content_type = (content_type or "").lower()
    if ext == "txt" and content_type.startswith("text/"):
        return True
    if content_type not in ALLOWED_FILE_TYPES.get(ext, set()):
        return False
    if ext == "pdf":
        return content.startswith(b"%PDF")
    if ext == "docx":
        return content.startswith(b"PK")
    return True


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Store PDF/DOCX/TXT files as learning resources without AI processing."""
    original_name = os.path.basename(file.filename or "document")
    ext = _get_extension(original_name)
    if ext not in _allowed_extensions() or ext not in ALLOWED_FILE_TYPES:
        raise _error("INVALID_FILE_TYPE", "Only PDF, DOCX, and TXT files are accepted.", 415)

    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise _error(
            "FILE_TOO_LARGE",
            f"File exceeds maximum size of {settings.max_upload_size_mb}MB.",
            413,
        )

    if not _is_valid_content(ext, file.content_type, content):
        raise _error("INVALID_FILE_TYPE", "File content does not match the allowed file type.", 415)

    user_dir = os.path.join(settings.upload_dir, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)

    save_path = os.path.join(user_dir, f"{uuid_lib.uuid4()}.{ext}")
    with open(save_path, "wb") as f:
        f.write(content)

    document = Document(
        user_id=current_user.id,
        title=os.path.splitext(original_name)[0][:255],
        original_filename=original_name[:255],
        file_type=ext,
        file_size=len(content),
        file_path=save_path,
        status=DocumentStatus.COMPLETED,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    logger.info("Document %d stored for MVP workspace (user=%s)", document.id, current_user.id)
    return UploadResponse(
        document_id=document.id,
        title=document.title,
        original_filename=document.original_filename,
        file_type=document.file_type,
        file_size=document.file_size,
        status=document.status,
        message="Document uploaded successfully.",
    )


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    document = result.scalars().first()
    if not document:
        raise _error("DOCUMENT_NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)
    return document


@router.put("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: int,
    payload: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    document = result.scalars().first()
    if not document:
        raise _error("DOCUMENT_NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)
    if payload.title is None:
        raise _error("VALIDATION_ERROR", "Nothing to update.", 400)

    document.title = payload.title
    await db.commit()
    await db.refresh(document)
    return document


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    document = result.scalars().first()
    if not document:
        raise _error("DOCUMENT_NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)
    if not document.file_path or not os.path.exists(document.file_path):
        raise _error("DOCUMENT_NOT_FOUND", "Stored file is missing.", 404)
    return FileResponse(
        document.file_path,
        filename=document.original_filename or f"{document.title}.{document.file_type or 'bin'}",
        media_type="application/octet-stream",
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    document = result.scalars().first()
    if not document:
        raise _error("DOCUMENT_NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)

    if document.file_path and os.path.exists(document.file_path):
        try:
            os.remove(document.file_path)
        except OSError as exc:
            logger.warning("Could not delete file %s: %s", document.file_path, exc)

    await db.delete(document)
    await db.commit()


@router.post("/{doc_id}/chat")
async def chat_with_document(
    doc_id: int,
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI chat is intentionally disabled for the non-AI MVP."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    document = result.scalars().first()
    if not document:
        raise _error("DOCUMENT_NOT_FOUND", f"Document with id {doc_id} does not exist.", 404)
    raise _error(
        "AI_FEATURE_IN_DEVELOPMENT",
        "Tính năng AI đang phát triển.",
        status.HTTP_501_NOT_IMPLEMENTED,
    )
