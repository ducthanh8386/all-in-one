"""
Phase 2 — Integration & Unit Tests for Document Upload & RAG Pipeline.

LLM calls (Gemini) are mocked via unittest.mock per PRD §11.
DB calls use httpx.AsyncClient against a real FastAPI app instance
backed by an SQLite in-memory database for isolation.
"""

import io
import json
import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.db.models import Base, Document, DocumentStatus, User, UserRole
from app.db.session import get_db
from app.core.security import create_access_token, hash_password

# ─── Test Database Setup (SQLite in-memory) ───────────────────────────────────

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

_test_engine = create_async_engine(TEST_DB_URL, echo=False)
_TestSession = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TestSession() as session:
        try:
            yield session
        finally:
            await session.close()


@pytest_asyncio.fixture(scope="function")
async def db() -> AsyncGenerator[AsyncSession, None]:
    """Create fresh tables for every test and yield a session."""
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with _TestSession() as session:
        yield session
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ─── App + Client Fixtures ────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient pointed at test app with overridden DB dependency."""
    from main import app

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    """Create and persist a test user, return the ORM instance."""
    user = User(
        id=uuid.uuid4(),
        username="testuser",
        email="test@example.com",
        hashed_password=hash_password("password123"),
        role=UserRole.USER,
        ai_quota=100,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(test_user: User) -> dict:
    """Return Authorization headers for test_user."""
    token = create_access_token({
        "sub": str(test_user.id),
        "username": test_user.username,
        "role": test_user.role.value,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def exhausted_user(db: AsyncSession) -> User:
    """User with ai_quota = 0."""
    user = User(
        id=uuid.uuid4(),
        username="quota_user",
        email="quota@example.com",
        hashed_password=hash_password("password123"),
        role=UserRole.USER,
        ai_quota=0,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def completed_document(db: AsyncSession, test_user: User) -> Document:
    """A COMPLETED document with a fake vector collection."""
    doc = Document(
        user_id=test_user.id,
        title="Test PDF",
        file_path="/tmp/test.pdf",
        status=DocumentStatus.COMPLETED,
        vector_collection_name="doc_1",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


# ─── Minimal valid PDF bytes ──────────────────────────────────────────────────

MINIMAL_PDF = b"%PDF-1.4 minimal"


# ─── Tests: Upload ────────────────────────────────────────────────────────────

class TestDocumentUpload:
    """T2-1, T2-2, T2-3 — upload validation."""

    @pytest.mark.asyncio
    async def test_upload_valid_pdf_returns_202(
        self, client: AsyncClient, auth_headers: dict, tmp_path
    ):
        """T2-1: Upload valid PDF → 202 with document_id."""
        with (
            patch("app.api.v1.documents.process_document_task") as mock_task,
            patch("builtins.open", MagicMock()),
            patch("os.makedirs"),
        ):
            mock_task.delay = MagicMock()

            files = {"file": ("test.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")}
            resp = await client.post(
                "/api/v1/documents/upload",
                files=files,
                headers=auth_headers,
            )

        assert resp.status_code == status.HTTP_202_ACCEPTED
        data = resp.json()
        assert "document_id" in data
        assert data["status"] == "PENDING"

    @pytest.mark.asyncio
    async def test_upload_oversized_file_returns_413(
        self, client: AsyncClient, auth_headers: dict
    ):
        """T2-2: File > 20 MB → 413 FILE_TOO_LARGE."""
        large_content = b"%PDF" + b"x" * (21 * 1024 * 1024)
        files = {"file": ("big.pdf", io.BytesIO(large_content), "application/pdf")}
        resp = await client.post(
            "/api/v1/documents/upload",
            files=files,
            headers=auth_headers,
        )
        assert resp.status_code == 413
        assert resp.json()["error"]["code"] == "FILE_TOO_LARGE"

    @pytest.mark.asyncio
    async def test_upload_non_pdf_returns_415(
        self, client: AsyncClient, auth_headers: dict
    ):
        """T2-3: Upload .docx → 415 INVALID_FILE_TYPE."""
        files = {
            "file": (
                "doc.docx",
                io.BytesIO(b"PK\x03\x04this is a zip/docx"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        }
        resp = await client.post(
            "/api/v1/documents/upload",
            files=files,
            headers=auth_headers,
        )
        assert resp.status_code == 415
        assert resp.json()["error"]["code"] == "INVALID_FILE_TYPE"

    @pytest.mark.asyncio
    async def test_upload_requires_auth(self, client: AsyncClient):
        """Upload without token → 403."""
        files = {"file": ("test.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")}
        resp = await client.post("/api/v1/documents/upload", files=files)
        assert resp.status_code in (401, 403)


# ─── Tests: Document CRUD ─────────────────────────────────────────────────────

class TestDocumentCRUD:
    @pytest.mark.asyncio
    async def test_list_documents(
        self, client: AsyncClient, auth_headers: dict, completed_document: Document
    ):
        """GET /documents returns user's documents."""
        resp = await client.get("/api/v1/documents", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert any(d["id"] == completed_document.id for d in data)

    @pytest.mark.asyncio
    async def test_get_document_status(
        self, client: AsyncClient, auth_headers: dict, completed_document: Document
    ):
        """GET /documents/{id} returns correct status."""
        resp = await client.get(
            f"/api/v1/documents/{completed_document.id}", headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "COMPLETED"

    @pytest.mark.asyncio
    async def test_get_nonexistent_document_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /documents/9999 → 404 NOT_FOUND."""
        resp = await client.get("/api/v1/documents/9999", headers=auth_headers)
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "NOT_FOUND"


# ─── Tests: Chat (SSE + Quota) ────────────────────────────────────────────────

class TestDocumentChat:
    """T2-6, T2-7 — SSE chat and quota enforcement."""

    @pytest.mark.asyncio
    async def test_chat_streams_sse_chunks(
        self,
        client: AsyncClient,
        auth_headers: dict,
        completed_document: Document,
    ):
        """T2-6: POST /chat → SSE stream with chunks, mock LLM."""
        async def _fake_stream(*args, **kwargs):
            yield 'data: {"chunk": "Hello "}\n\n'
            yield 'data: {"chunk": "World"}\n\n'
            yield "data: [DONE]\n\n"

        with (
            patch("app.api.v1.documents.ai_service.hybrid_search", return_value="mocked context"),
            patch("app.api.v1.documents.ai_service.stream_rag_answer", return_value=_fake_stream()),
        ):
            resp = await client.post(
                f"/api/v1/documents/{completed_document.id}/chat",
                json={"question": "What is this about?"},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")
        body = resp.text
        assert '"chunk": "Hello "' in body
        assert "[DONE]" in body

    @pytest.mark.asyncio
    async def test_chat_quota_exceeded_returns_403(
        self,
        client: AsyncClient,
        db: AsyncSession,
        completed_document: Document,
        exhausted_user: User,
    ):
        """T2-7: Chat when ai_quota=0 → 403 QUOTA_EXCEEDED."""
        token = create_access_token({
            "sub": str(exhausted_user.id),
            "username": exhausted_user.username,
            "role": exhausted_user.role.value,
        })
        exhausted_headers = {"Authorization": f"Bearer {token}"}

        # Create a completed doc owned by exhausted_user
        doc = Document(
            user_id=exhausted_user.id,
            title="Quota Doc",
            file_path="/tmp/q.pdf",
            status=DocumentStatus.COMPLETED,
            vector_collection_name="doc_99",
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

        resp = await client.post(
            f"/api/v1/documents/{doc.id}/chat",
            json={"question": "test"},
            headers=exhausted_headers,
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "QUOTA_EXCEEDED"

    @pytest.mark.asyncio
    async def test_chat_on_non_completed_doc_returns_400(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_user: User,
    ):
        """Chat with a PROCESSING document → 400."""
        doc = Document(
            user_id=test_user.id,
            title="Processing Doc",
            file_path="/tmp/p.pdf",
            status=DocumentStatus.PROCESSING,
            vector_collection_name=None,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

        resp = await client.post(
            f"/api/v1/documents/{doc.id}/chat",
            json={"question": "test"},
            headers=auth_headers,
        )
        assert resp.status_code == 400


# ─── Tests: AI Service Unit Tests ─────────────────────────────────────────────

class TestAIService:
    """Unit tests for ai_service functions with mocked dependencies."""

    def test_chunk_text_produces_chunks(self):
        from app.services.ai_service import chunk_text
        text = "word " * 500
        chunks = chunk_text(text)
        assert isinstance(chunks, list)
        assert len(chunks) >= 1
        for c in chunks:
            assert len(c) <= 1100  # chunk_size + small buffer

    def test_auto_generate_flashcards_parses_json(self):
        """auto_generate_flashcards returns list of dicts (mocked Gemini)."""
        from app.services.ai_service import auto_generate_flashcards

        fake_cards = [
            {"front": "What is OS?", "back": "Operating System."},
            {"front": "What is CPU?", "back": "Central Processing Unit."},
        ]

        mock_response = MagicMock()
        mock_response.text = json.dumps(fake_cards)

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response

        with patch("app.services.ai_service._get_gemini_model", return_value=mock_model):
            result = auto_generate_flashcards("some document text")

        assert result == fake_cards

    def test_auto_generate_flashcards_handles_bad_json(self):
        """auto_generate_flashcards returns [] on malformed JSON."""
        from app.services.ai_service import auto_generate_flashcards

        mock_response = MagicMock()
        mock_response.text = "not valid json at all"
        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response

        with patch("app.services.ai_service._get_gemini_model", return_value=mock_model):
            result = auto_generate_flashcards("some text")

        assert result == []

    @pytest.mark.asyncio
    async def test_stream_rag_answer_yields_sse_format(self):
        """stream_rag_answer yields SSE-formatted strings and [DONE]."""
        from app.services.ai_service import stream_rag_answer

        fake_chunk1 = MagicMock()
        fake_chunk1.text = "Hello "
        fake_chunk2 = MagicMock()
        fake_chunk2.text = "world!"

        mock_model = MagicMock()
        mock_model.generate_content.return_value = iter([fake_chunk1, fake_chunk2])

        with patch("app.services.ai_service._get_gemini_model", return_value=mock_model):
            chunks = [c async for c in stream_rag_answer("context", "question")]

        assert any('"chunk": "Hello "' in c for c in chunks)
        assert chunks[-1] == "data: [DONE]\n\n"
