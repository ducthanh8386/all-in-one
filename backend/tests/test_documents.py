import io
import uuid
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.models import Base, Document, DocumentStatus, User, UserRole
from app.db.session import get_db

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"
_engine = create_async_engine(TEST_DB_URL, echo=False)
_Session = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _Session() as session:
        yield session


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with _Session() as session:
        yield session
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    from main import app

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def user(db: AsyncSession) -> User:
    item = User(
        id=uuid.uuid4(),
        username="docuser",
        email="doc@example.com",
        hashed_password=hash_password("password123"),
        role=UserRole.USER,
        is_active=True,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@pytest_asyncio.fixture
async def other_user(db: AsyncSession) -> User:
    item = User(
        id=uuid.uuid4(),
        username="otherdocuser",
        email="otherdoc@example.com",
        hashed_password=hash_password("password123"),
        role=UserRole.USER,
        is_active=True,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@pytest_asyncio.fixture
async def headers(user: User) -> dict:
    token = create_access_token({"sub": str(user.id), "username": user.username, "role": user.role.value})
    return {"Authorization": f"Bearer {token}"}


async def _upload(client: AsyncClient, headers: dict, tmp_path: Path, name: str, content: bytes, content_type: str):
    from app.api.v1 import documents

    old_upload_dir = documents.settings.upload_dir
    old_allowed = documents.settings.allowed_extensions
    documents.settings.upload_dir = str(tmp_path)
    documents.settings.allowed_extensions = "pdf,docx,txt"
    try:
        return await client.post(
            "/api/v1/documents/upload",
            files={"file": (name, io.BytesIO(content), content_type)},
            headers=headers,
        )
    finally:
        documents.settings.upload_dir = old_upload_dir
        documents.settings.allowed_extensions = old_allowed


@pytest.mark.asyncio
async def test_upload_pdf_docx_txt_success(client: AsyncClient, headers: dict, tmp_path: Path):
    cases = [
        ("sample.pdf", b"%PDF-1.4 minimal", "application/pdf", "pdf"),
        ("sample.docx", b"PK\x03\x04docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
        ("sample.txt", b"plain text", "text/plain", "txt"),
    ]
    for name, content, content_type, ext in cases:
        resp = await _upload(client, headers, tmp_path, name, content, content_type)
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "COMPLETED"
        assert data["file_type"] == ext
        assert data["file_size"] == len(content)


@pytest.mark.asyncio
async def test_upload_invalid_extension_fails(client: AsyncClient, headers: dict, tmp_path: Path):
    resp = await _upload(client, headers, tmp_path, "bad.exe", b"bad", "application/octet-stream")
    assert resp.status_code == 415
    assert resp.json()["error"]["code"] == "INVALID_FILE_TYPE"


@pytest.mark.asyncio
async def test_upload_oversized_file_fails(client: AsyncClient, headers: dict, tmp_path: Path):
    resp = await _upload(client, headers, tmp_path, "big.pdf", b"%PDF" + b"x" * (21 * 1024 * 1024), "application/pdf")
    assert resp.status_code == 413
    assert resp.json()["error"]["code"] == "FILE_TOO_LARGE"


@pytest.mark.asyncio
async def test_upload_does_not_trigger_ai_processing(client: AsyncClient, headers: dict, tmp_path: Path, monkeypatch):
    import app.api.v1.documents as documents_api

    assert not hasattr(documents_api, "process_document_task")
    resp = await _upload(client, headers, tmp_path, "sample.pdf", b"%PDF-1.4 minimal", "application/pdf")
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_list_get_download_delete_document(client: AsyncClient, headers: dict, tmp_path: Path):
    upload = await _upload(client, headers, tmp_path, "notes.txt", b"hello", "text/plain")
    doc_id = upload.json()["document_id"]

    list_resp = await client.get("/api/v1/documents", headers=headers)
    assert list_resp.status_code == 200
    assert any(item["id"] == doc_id for item in list_resp.json())

    detail_resp = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["original_filename"] == "notes.txt"
    assert "file_path" not in detail_resp.json()

    update_resp = await client.put(
        f"/api/v1/documents/{doc_id}",
        json={"title": "Renamed notes"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "Renamed notes"

    download_resp = await client.get(f"/api/v1/documents/{doc_id}/download", headers=headers)
    assert download_resp.status_code == 200
    assert download_resp.content == b"hello"

    delete_resp = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
    assert delete_resp.status_code == 204


@pytest.mark.asyncio
async def test_user_cannot_access_another_users_document(
    client: AsyncClient,
    db: AsyncSession,
    headers: dict,
    other_user: User,
):
    doc = Document(
        user_id=other_user.id,
        title="Other",
        original_filename="other.txt",
        file_type="txt",
        file_size=1,
        file_path="/tmp/other.txt",
        status=DocumentStatus.COMPLETED,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    resp = await client.get(f"/api/v1/documents/{doc.id}", headers=headers)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"


@pytest.mark.asyncio
async def test_ai_chat_endpoint_disabled(client: AsyncClient, headers: dict, tmp_path: Path):
    upload = await _upload(client, headers, tmp_path, "notes.txt", b"hello", "text/plain")
    doc_id = upload.json()["document_id"]
    resp = await client.post(f"/api/v1/documents/{doc_id}/chat", json={"question": "hi"}, headers=headers)
    assert resp.status_code == 501
    assert resp.json()["error"]["code"] == "AI_FEATURE_IN_DEVELOPMENT"
