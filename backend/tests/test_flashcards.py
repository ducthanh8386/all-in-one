import io
import uuid
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.models import Base, Document, DocumentStatus, Flashcard, User, UserRole
from app.db.session import get_db
from app.services.flashcard_service import apply_sm2

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
        username="carduser",
        email="card@example.com",
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
        username="othercarduser",
        email="othercard@example.com",
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


@pytest_asyncio.fixture
async def doc(db: AsyncSession, user: User) -> Document:
    item = Document(
        user_id=user.id,
        title="OS",
        original_filename="os.txt",
        file_type="txt",
        file_size=10,
        file_path="/tmp/os.txt",
        status=DocumentStatus.COMPLETED,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@pytest_asyncio.fixture
async def sample_card(db: AsyncSession, user: User, doc: Document) -> Flashcard:
    item = Flashcard(
        user_id=user.id,
        doc_id=doc.id,
        front_text="What is TCP?",
        back_text="Transmission Control Protocol.",
        tag="Network",
        next_review_date=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


def test_sm2_quality_5_and_2_and_min_ef():
    rep, ef, interval = apply_sm2(0, 2.5, 0, 5)
    assert rep == 1
    assert ef > 2.5
    assert interval == 1

    rep, ef, interval = apply_sm2(4, 2.2, 20, 2)
    assert rep == 0
    assert ef == 2.2
    assert interval == 1

    ef_value = 1.31
    for _ in range(10):
        _, ef_value, _ = apply_sm2(0, ef_value, 1, 3)
    assert ef_value >= 1.3


@pytest.mark.asyncio
async def test_manual_create_update_delete_search_and_doc_filter(
    client: AsyncClient,
    headers: dict,
    doc: Document,
):
    create_resp = await client.post(
        "/api/v1/flashcards",
        json={"front_text": "Deadlock?", "back_text": "Processes wait forever.", "tag": "OS", "doc_id": doc.id},
        headers=headers,
    )
    assert create_resp.status_code == 201
    card = create_resp.json()
    assert card["tag"] == "OS"

    update_resp = await client.put(
        f"/api/v1/flashcards/{card['id']}",
        json={"front_text": "Deadlock là gì?", "tag": "Operating System"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["tag"] == "Operating System"

    search_resp = await client.get(f"/api/v1/flashcards?doc_id={doc.id}&q=Operating", headers=headers)
    assert search_resp.status_code == 200
    assert len(search_resp.json()) == 1

    delete_resp = await client.delete(f"/api/v1/flashcards/{card['id']}", headers=headers)
    assert delete_resp.status_code == 204


@pytest.mark.asyncio
async def test_due_and_review_endpoint(client: AsyncClient, headers: dict, sample_card: Flashcard):
    due_resp = await client.get("/api/v1/flashcards/due", headers=headers)
    assert due_resp.status_code == 200
    assert any(card["id"] == sample_card.id for card in due_resp.json())

    review_resp = await client.post(f"/api/v1/flashcards/{sample_card.id}/review", json={"quality": 5}, headers=headers)
    assert review_resp.status_code == 200
    assert review_resp.json()["repetition_count"] == 1
    assert review_resp.json()["interval_days"] == 1

    bad_resp = await client.post(f"/api/v1/flashcards/{sample_card.id}/review", json={"quality": 6}, headers=headers)
    assert bad_resp.status_code == 400
    assert bad_resp.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_csv_import_valid_missing_empty_and_invalid_type(
    client: AsyncClient,
    headers: dict,
    doc: Document,
):
    csv_body = 'front,back,tag\n"TCP?","Protocol","Network"\n"Missing back",,\n,,\n'
    resp = await client.post(
        "/api/v1/flashcards/import",
        files={"file": ("cards.csv", io.BytesIO(csv_body.encode("utf-8")), "text/csv")},
        data={"doc_id": str(doc.id)},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["created"] == 1
    assert resp.json()["skipped"] == 1
    assert resp.json()["errors"][0]["row"] == 3

    empty_resp = await client.post(
        "/api/v1/flashcards/import",
        files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
        headers=headers,
    )
    assert empty_resp.status_code == 200
    assert empty_resp.json()["created"] == 0

    invalid_resp = await client.post(
        "/api/v1/flashcards/import",
        files={"file": ("cards.txt", io.BytesIO(b"front,back\nA,B"), "text/plain")},
        headers=headers,
    )
    assert invalid_resp.status_code == 415
    assert invalid_resp.json()["error"]["code"] == "INVALID_FILE_TYPE"


@pytest.mark.asyncio
async def test_cannot_import_or_create_for_other_users_document(
    client: AsyncClient,
    db: AsyncSession,
    headers: dict,
    other_user: User,
):
    other_doc = Document(user_id=other_user.id, title="Other", status=DocumentStatus.COMPLETED)
    db.add(other_doc)
    await db.commit()
    await db.refresh(other_doc)

    create_resp = await client.post(
        "/api/v1/flashcards",
        json={"front_text": "A", "back_text": "B", "doc_id": other_doc.id},
        headers=headers,
    )
    assert create_resp.status_code == 404
    assert create_resp.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"

    import_resp = await client.post(
        "/api/v1/flashcards/import",
        files={"file": ("cards.csv", io.BytesIO(b"front,back\nA,B"), "text/csv")},
        data={"doc_id": str(other_doc.id)},
        headers=headers,
    )
    assert import_resp.status_code == 404
    assert import_resp.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"


@pytest.mark.asyncio
async def test_ai_generate_endpoint_disabled(client: AsyncClient, headers: dict, doc: Document):
    resp = await client.post(f"/api/v1/flashcards/generate/{doc.id}", headers=headers)
    assert resp.status_code == 501
    assert resp.json()["error"]["code"] == "AI_FEATURE_IN_DEVELOPMENT"
