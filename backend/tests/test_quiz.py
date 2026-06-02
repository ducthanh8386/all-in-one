import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.models import Base, Document, DocumentStatus, Flashcard, User, UserRole
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


async def _make_user(db: AsyncSession, username: str) -> User:
    user = User(
        id=uuid.uuid4(),
        username=username,
        email=f"{username}@example.com",
        hashed_password=hash_password("password123"),
        role=UserRole.USER,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def user(db: AsyncSession) -> User:
    return await _make_user(db, "quizuser")


@pytest_asyncio.fixture
async def other_user(db: AsyncSession) -> User:
    return await _make_user(db, "otherquizuser")


@pytest_asyncio.fixture
async def headers(user: User) -> dict:
    token = create_access_token({"sub": str(user.id), "username": user.username, "role": user.role.value})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def doc(db: AsyncSession, user: User) -> Document:
    doc = Document(user_id=user.id, title="Quiz", status=DocumentStatus.COMPLETED)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def _add_cards(db: AsyncSession, user: User, doc: Document, count: int) -> None:
    db.add_all([
        Flashcard(
            user_id=user.id,
            doc_id=doc.id,
            front_text=f"Question {idx}",
            back_text=f"Answer {idx}",
        )
        for idx in range(count)
    ])
    await db.commit()


@pytest.mark.asyncio
async def test_quiz_requires_at_least_four_cards(client: AsyncClient, db: AsyncSession, headers: dict, user: User, doc: Document):
    await _add_cards(db, user, doc, 3)
    resp = await client.get(f"/api/v1/quiz?doc_id={doc.id}", headers=headers)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "QUIZ_NOT_ENOUGH_FLASHCARDS"


@pytest.mark.asyncio
async def test_quiz_returns_four_options_and_correct_answer(client: AsyncClient, db: AsyncSession, headers: dict, user: User, doc: Document):
    await _add_cards(db, user, doc, 5)
    resp = await client.get(f"/api/v1/quiz?doc_id={doc.id}&limit=4", headers=headers)
    assert resp.status_code == 200
    questions = resp.json()["questions"]
    assert len(questions) == 4
    for question in questions:
        assert len(question["options"]) == 4
        assert 0 <= question["correct_option_index"] <= 3
        assert question["options"][question["correct_option_index"]].startswith("Answer")


@pytest.mark.asyncio
async def test_user_cannot_generate_quiz_from_other_users_document(
    client: AsyncClient,
    db: AsyncSession,
    headers: dict,
    other_user: User,
):
    other_doc = Document(user_id=other_user.id, title="Other", status=DocumentStatus.COMPLETED)
    db.add(other_doc)
    await db.commit()
    await db.refresh(other_doc)

    resp = await client.get(f"/api/v1/quiz?doc_id={other_doc.id}", headers=headers)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"
