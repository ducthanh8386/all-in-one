"""
Database session management with SQLAlchemy async.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings

# Remove ssl=disable from URL if present, handle via connect_args
db_url = settings.database_url.replace('?ssl=disable', '')

# Create async engine
engine = create_async_engine(
    db_url,
    echo=settings.app_env == "development",
    future=True,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=0,
    connect_args={"ssl": False}
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def close_db():
    await engine.dispose()
