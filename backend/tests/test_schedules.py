"""
Phase 4 schedule API tests.
"""

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

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"
_test_engine = create_async_engine(TEST_DB_URL, echo=False)
_TestSession = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TestSession() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with _TestSession() as session:
        yield session
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    from main import app

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username="schedule_user",
        email="schedule@example.com",
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
async def other_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username="other_schedule_user",
        email="other-schedule@example.com",
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
    token = create_access_token(
        {
            "sub": str(test_user.id),
            "username": test_user.username,
            "role": test_user.role.value,
        }
    )
    return {"Authorization": f"Bearer {token}"}


def payload(start: datetime, end: datetime, **overrides) -> dict:
    data = {
        "title": "Operating Systems review",
        "description": "Chapter 3 and 4",
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "is_recurring": False,
        "recurrence_rule": None,
        "reference_doc_id": None,
    }
    data.update(overrides)
    return data


@pytest.mark.asyncio
async def test_create_schedule_end_before_start_returns_validation_error(
    client: AsyncClient,
    auth_headers: dict,
):
    start = datetime.now(timezone.utc) + timedelta(hours=2)
    end = start - timedelta(hours=1)
    response = await client.post(
        "/api/v1/schedules",
        json=payload(start, end),
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_overlap_same_user_returns_400(
    client: AsyncClient,
    auth_headers: dict,
):
    start = datetime.now(timezone.utc) + timedelta(days=1)
    end = start + timedelta(hours=2)
    first = await client.post(
        "/api/v1/schedules",
        json=payload(start, end),
        headers=auth_headers,
    )
    assert first.status_code == 201

    overlapping = await client.post(
        "/api/v1/schedules",
        json=payload(start + timedelta(minutes=30), end + timedelta(hours=1)),
        headers=auth_headers,
    )
    assert overlapping.status_code == 400
    assert overlapping.json()["error"]["code"] == "SCHEDULE_OVERLAP"


@pytest.mark.asyncio
async def test_overlap_different_user_is_allowed(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict,
    other_user: User,
):
    start = datetime.now(timezone.utc) + timedelta(days=2)
    end = start + timedelta(hours=2)
    first = await client.post(
        "/api/v1/schedules",
        json=payload(start, end),
        headers=auth_headers,
    )
    assert first.status_code == 201

    other_token = create_access_token(
        {
            "sub": str(other_user.id),
            "username": other_user.username,
            "role": other_user.role.value,
        }
    )
    second = await client.post(
        "/api/v1/schedules",
        json=payload(start + timedelta(minutes=30), end),
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert second.status_code == 201


@pytest.mark.asyncio
async def test_list_schedules_filters_by_range(
    client: AsyncClient,
    auth_headers: dict,
):
    base = datetime.now(timezone.utc) + timedelta(days=3)
    inside_start = base
    inside_end = base + timedelta(hours=1)
    outside_start = base + timedelta(days=10)
    outside_end = outside_start + timedelta(hours=1)

    await client.post(
        "/api/v1/schedules",
        json=payload(inside_start, inside_end, title="Inside"),
        headers=auth_headers,
    )
    await client.post(
        "/api/v1/schedules",
        json=payload(outside_start, outside_end, title="Outside"),
        headers=auth_headers,
    )

    response = await client.get(
        "/api/v1/schedules",
        params={
            "start": base.isoformat(),
            "end": (base + timedelta(days=1)).isoformat(),
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    titles = [item["title"] for item in response.json()]
    assert "Inside" in titles
    assert "Outside" not in titles


@pytest.mark.asyncio
async def test_today_schedules_include_due_count(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict,
    test_user: User,
):
    document = Document(
        user_id=test_user.id,
        title="Completed doc",
        file_path="/tmp/doc.pdf",
        status=DocumentStatus.COMPLETED,
        vector_collection_name="doc_test",
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    card = Flashcard(
        user_id=test_user.id,
        doc_id=document.id,
        front_text="Q",
        back_text="A",
        next_review_date=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db.add(card)
    await db.commit()

    start = datetime.now(timezone.utc) + timedelta(hours=1)
    end = start + timedelta(hours=1)
    create = await client.post(
        "/api/v1/schedules",
        json=payload(start, end, reference_doc_id=document.id),
        headers=auth_headers,
    )
    assert create.status_code == 201

    response = await client.get("/api/v1/schedules/today", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data
    assert data[0]["flashcard_due_count"] == 1
