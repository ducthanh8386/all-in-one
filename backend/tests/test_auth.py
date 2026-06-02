import uuid
from datetime import datetime, timedelta
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_refresh_token, hash_password
from app.db.models import Base, RefreshToken, User
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


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token_without_access_token(
    client: AsyncClient,
    db: AsyncSession,
):
    user = User(
        id=uuid.uuid4(),
        username="logout_user",
        email="logout_user@example.com",
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    refresh_token = create_refresh_token({"sub": str(user.id)})
    db.add(
        RefreshToken(
            user_id=user.id,
            token=refresh_token,
            expires_at=datetime.utcnow() + timedelta(days=7),
            revoked=False,
        )
    )
    await db.commit()

    response = await client.post(
        "/auth/logout",
        cookies={"brainsync_refresh": refresh_token},
    )

    assert response.status_code == 200
    assert "brainsync_refresh" in response.headers["set-cookie"]

    token_record = (
        await db.execute(select(RefreshToken).where(RefreshToken.token == refresh_token))
    ).scalars().one()
    assert token_record.revoked is True
