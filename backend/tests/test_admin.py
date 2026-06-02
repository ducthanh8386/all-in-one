"""Phase 6 admin API tests."""

import uuid
from datetime import datetime, timedelta
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, create_refresh_token, hash_password
from app.db.models import Base, Document, Flashcard, RefreshToken, Schedule, User, UserRole
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


async def create_user(db: AsyncSession, username: str, role: UserRole = UserRole.USER) -> User:
    user = User(
        id=uuid.uuid4(),
        username=username,
        email=f"{username}@example.com",
        hashed_password=hash_password("password123"),
        role=role,
        ai_quota=100,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def auth_headers(user: User) -> dict:
    token = create_access_token(
        {
            "sub": str(user.id),
            "username": user.username,
            "role": user.role.value,
        }
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_user_cannot_list_admin_users(client: AsyncClient, db: AsyncSession):
    user = await create_user(db, "regular")
    response = await client.get("/api/v1/admin/users", headers=auth_headers(user))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_list_users_with_pagination(client: AsyncClient, db: AsyncSession):
    admin = await create_user(db, "admin", UserRole.ADMIN)
    await create_user(db, "student")

    response = await client.get(
        "/api/v1/admin/users",
        params={"limit": 10, "offset": 0},
        headers=auth_headers(admin),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["users"]) == 2


@pytest.mark.asyncio
async def test_admin_can_view_dashboard_stats(client: AsyncClient, db: AsyncSession):
    admin = await create_user(db, "stats_admin", UserRole.ADMIN)
    student = await create_user(db, "stats_student")
    student.is_active = False
    student.ai_quota = 35
    doc = Document(user_id=admin.id, title="Admin Doc", file_type="txt", file_size=12)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    db.add(Flashcard(user_id=admin.id, doc_id=doc.id, front_text="Q", back_text="A"))
    db.add(
        Schedule(
            user_id=admin.id,
            title="Review",
            start_time=datetime.utcnow(),
            end_time=datetime.utcnow() + timedelta(hours=1),
        )
    )
    await db.commit()

    response = await client.get("/api/v1/admin/stats", headers=auth_headers(admin))

    assert response.status_code == 200
    data = response.json()
    assert data["total_users"] == 2
    assert data["active_users"] == 1
    assert data["disabled_users"] == 1
    assert data["admin_users"] == 1
    assert data["regular_users"] == 1
    assert data["total_documents"] == 1
    assert data["total_flashcards"] == 1
    assert data["total_schedules"] == 1
    assert len(data["recent_users"]) == 2


@pytest.mark.asyncio
async def test_admin_can_create_update_and_delete_user(client: AsyncClient, db: AsyncSession):
    admin = await create_user(db, "crud_admin", UserRole.ADMIN)

    create_response = await client.post(
        "/api/v1/admin/users",
        json={
            "username": "created_user",
            "email": "created@example.com",
            "password": "password123",
            "role": "USER",
            "ai_quota": 50,
            "is_active": True,
        },
        headers=auth_headers(admin),
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["username"] == "created_user"
    assert created["ai_quota"] == 50

    update_response = await client.put(
        f"/api/v1/admin/users/{created['id']}",
        json={
            "username": "updated_user",
            "email": "updated@example.com",
            "role": "MODERATOR",
            "ai_quota": 75,
            "is_active": False,
        },
        headers=auth_headers(admin),
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["username"] == "updated_user"
    assert updated["role"] == "MODERATOR"
    assert updated["is_active"] is False

    delete_response = await client.delete(
        f"/api/v1/admin/users/{created['id']}",
        headers=auth_headers(admin),
    )
    assert delete_response.status_code == 204

    list_response = await client.get("/api/v1/admin/users", headers=auth_headers(admin))
    assert all(item["id"] != created["id"] for item in list_response.json()["users"])


@pytest.mark.asyncio
async def test_admin_cannot_delete_self(client: AsyncClient, db: AsyncSession):
    admin = await create_user(db, "self_delete_admin", UserRole.ADMIN)

    response = await client.delete(
        f"/api/v1/admin/users/{admin.id}",
        headers=auth_headers(admin),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_admin_can_update_user_quota(client: AsyncClient, db: AsyncSession):
    admin = await create_user(db, "quota_admin", UserRole.ADMIN)
    target = await create_user(db, "quota_target")

    response = await client.put(
        f"/api/v1/admin/users/{target.id}/quota",
        json={"ai_quota": 250},
        headers=auth_headers(admin),
    )

    assert response.status_code == 200
    assert response.json()["ai_quota"] == 250
    await db.refresh(target)
    assert target.ai_quota == 250


@pytest.mark.asyncio
async def test_admin_can_deactivate_user_and_revoke_refresh_tokens(
    client: AsyncClient,
    db: AsyncSession,
):
    admin = await create_user(db, "status_admin", UserRole.ADMIN)
    target = await create_user(db, "status_target")
    refresh_token = create_refresh_token({"sub": str(target.id)})
    db.add(
        RefreshToken(
            user_id=target.id,
            token=refresh_token,
            expires_at=datetime.utcnow() + timedelta(days=7),
            revoked=False,
        )
    )
    await db.commit()

    response = await client.put(
        f"/api/v1/admin/users/{target.id}/status",
        json={"is_active": False},
        headers=auth_headers(admin),
    )

    assert response.status_code == 200
    assert response.json()["is_active"] is False

    me_response = await client.get("/auth/me", headers=auth_headers(target))
    assert me_response.status_code == 401

    refresh_response = await client.post(
        "/auth/refresh",
        cookies={"brainsync_refresh": refresh_token},
    )
    assert refresh_response.status_code == 401
