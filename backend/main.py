"""
Brain-Sync Backend - FastAPI Application Entry Point
"""
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import socketio
from socketio import ASGIApp
import logging
from app.core.config import settings
from app.core.redis import close_redis, health_check as redis_health_check
from app.db.session import close_db, engine
from app.db.models import Base
from app.api.v1 import auth, documents, flashcards, schedules, admin
from app.sockets.game_handlers import setup_socket_handlers

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Socket.io setup
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[settings.frontend_url],
    ping_timeout=60,
    ping_interval=10,
    logger=True,
    engineio_logger=False
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Brain-Sync Backend...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created/verified")
    await setup_socket_handlers(sio)
    logger.info("Socket.io handlers configured")
    yield
    logger.info("Shutting down Brain-Sync Backend...")
    await close_db()
    await close_redis()
    logger.info("Connections closed")

# Create FastAPI app
app = FastAPI(
    title="Brain-Sync API",
    description="All-in-one Study Workspace",
    version="2.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(documents.router, prefix="/api/v1")
app.include_router(flashcards.router, prefix="/api/v1")
app.include_router(schedules.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")

# Health Check Endpoint
@app.get("/health")
async def health_check():
    db_ok = False
    redis_ok = False
    try:
        async with engine.begin() as conn:
            from sqlalchemy import text
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
    try:
        redis_ok = await redis_health_check()
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
    status_code = status.HTTP_200_OK if (db_ok and redis_ok) else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if (db_ok and redis_ok) else "degraded",
            "db": "ok" if db_ok else "failed",
            "redis": "ok" if redis_ok else "failed"
        }
    )

# Mount Socket.io
socket_app = ASGIApp(sio, app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.app_env == "development"
    )
