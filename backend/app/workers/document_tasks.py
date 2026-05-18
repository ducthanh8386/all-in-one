"""
Celery task: process_document_task
Pipeline: extract PDF → chunk → embed → store Qdrant → auto flashcards → emit socket event.
"""

import logging
import os
import asyncio
from datetime import datetime, timezone

import pdfplumber
import socketio
from celery import states
from sqlalchemy import create_engine, update, select
from sqlalchemy.orm import sessionmaker, Session

from app.workers.celery_app import celery_app
from app.core.config import settings
from app.db.models import Document, DocumentStatus, Flashcard
from app.services import ai_service

logger = logging.getLogger(__name__)

# ─── Synchronous DB engine for Celery (cannot use async inside Celery tasks) ─
# Celery workers are synchronous; we derive a sync URL from the async one.
_SYNC_DB_URL = settings.database_url.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)
_engine = create_engine(_SYNC_DB_URL, pool_pre_ping=True)
_SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)


def _get_sync_db() -> Session:
    return _SessionLocal()


# ─── Socket.io client to emit events from worker ─────────────────────────────
_sio_client = socketio.SimpleClient()


def _emit_to_user(user_id: str, event: str, data: dict) -> None:
    """Emit a Socket.io event to a specific user room."""
    try:
        if not _sio_client.connected:
            _sio_client.connect(
                settings.frontend_url.replace(":3000", ":8000"),
                wait_timeout=5,
            )
        _sio_client.emit(event, data, namespace="/")
    except Exception as exc:
        # Best-effort; don't fail the task just because socket emit failed
        logger.warning("Socket emit failed (event=%s, user=%s): %s", event, user_id, exc)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _extract_text(file_path: str) -> str:
    """Extract full text from a PDF using pdfplumber."""
    pages_text: list[str] = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
    return "\n\n".join(pages_text)


def _update_document_status(
    db: Session,
    document_id: int,
    status: DocumentStatus,
    *,
    vector_collection_name: str | None = None,
    error_message: str | None = None,
) -> None:
    values: dict = {"status": status}
    if vector_collection_name is not None:
        values["vector_collection_name"] = vector_collection_name
    if error_message is not None:
        values["error_message"] = error_message

    db.execute(
        update(Document).where(Document.id == document_id).values(**values)
    )
    db.commit()


# ─── Main Celery Task ─────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="process_document_task",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def process_document_task(self, document_id: int) -> dict:
    """
    Full async-to-sync pipeline for processing an uploaded PDF document.

    Steps:
      1. Mark status = PROCESSING
      2. Extract text via pdfplumber
      3. Chunk with RecursiveCharacterTextSplitter
      4. Create HuggingFace embeddings
      5. Store in Qdrant
      6. Auto-generate flashcards via Gemini
      7. Bulk insert flashcards
      8. Mark status = COMPLETED, emit socket event
    """
    db = _get_sync_db()
    try:
        # ── Fetch document record ─────────────────────────────────────────────
        result = db.execute(select(Document).where(Document.id == document_id))
        document = result.scalars().first()
        if not document:
            logger.error("Document %s not found", document_id)
            return {"status": "error", "reason": "Document not found"}

        user_id = str(document.user_id)
        file_path = document.file_path

        # ── Step 1: PROCESSING ────────────────────────────────────────────────
        _update_document_status(db, document_id, DocumentStatus.PROCESSING)
        logger.info("[Task %s] Processing document %d", self.request.id, document_id)

        # ── Step 2: Extract text ──────────────────────────────────────────────
        if not file_path or not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        full_text = _extract_text(file_path)
        if not full_text.strip():
            raise ValueError("PDF contains no extractable text")

        # ── Step 3: Chunk ─────────────────────────────────────────────────────
        chunks = ai_service.chunk_text(full_text)
        logger.info("[Task %s] %d chunks created", self.request.id, len(chunks))

        # ── Step 4: Embeddings ────────────────────────────────────────────────
        embeddings = ai_service.create_embeddings(chunks)

        # ── Step 5: Store in Qdrant ───────────────────────────────────────────
        collection_name = f"doc_{document_id}"
        ai_service.store_to_vector_db(collection_name, chunks, embeddings)

        # ── Step 6: Auto-generate flashcards ──────────────────────────────────
        flashcard_dicts = ai_service.auto_generate_flashcards(full_text)
        logger.info(
            "[Task %s] Generated %d flashcards", self.request.id, len(flashcard_dicts)
        )

        # ── Step 7: Bulk insert flashcards ────────────────────────────────────
        if flashcard_dicts:
            now = datetime.now(timezone.utc)
            flashcard_rows = [
                Flashcard(
                    doc_id=document_id,
                    user_id=document.user_id,
                    front_text=card.get("front", ""),
                    back_text=card.get("back", ""),
                    repetition_count=0,
                    ease_factor=2.5,
                    interval_days=0,
                    next_review_date=now,
                )
                for card in flashcard_dicts
                if card.get("front") and card.get("back")
            ]
            db.add_all(flashcard_rows)
            db.commit()

        # ── Step 8: COMPLETED + socket emit ───────────────────────────────────
        _update_document_status(
            db,
            document_id,
            DocumentStatus.COMPLETED,
            vector_collection_name=collection_name,
        )
        _emit_to_user(
            user_id,
            "document:processing_done",
            {
                "document_id": document_id,
                "collection_name": collection_name,
                "flashcards_generated": len(flashcard_dicts),
            },
        )
        logger.info("[Task %s] Document %d COMPLETED", self.request.id, document_id)
        return {"status": "completed", "document_id": document_id}

    except Exception as exc:
        logger.exception(
            "[Task %s] Document %d FAILED: %s", self.request.id, document_id, exc
        )
        try:
            _update_document_status(
                db,
                document_id,
                DocumentStatus.FAILED,
                error_message=str(exc)[:500],
            )
        except Exception:
            pass

        # Emit failure event
        try:
            result = db.execute(select(Document).where(Document.id == document_id))
            document = result.scalars().first()
            if document:
                _emit_to_user(
                    str(document.user_id),
                    "document:processing_failed",
                    {"document_id": document_id, "error": str(exc)[:200]},
                )
        except Exception:
            pass

        # Retry on transient errors (not validation errors)
        if not isinstance(exc, (FileNotFoundError, ValueError)):
            raise self.retry(exc=exc)
        return {"status": "failed", "document_id": document_id}
    finally:
        db.close()
