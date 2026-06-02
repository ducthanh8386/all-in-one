"""
Brain-Sync Backend - FastAPI Application Entry Point
"""
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import socketio
from socketio import ASGIApp
import logging
from app.core.config import settings
from app.core.redis import close_redis, health_check as redis_health_check
from app.db.session import close_db, engine
from app.api.v1 import auth, documents, flashcards, schedules, admin, quiz, exam_planner
from app.sockets.game_handlers import setup_socket_handlers

from slowapi.errors import RateLimitExceeded
from app.core.rate_limit import limiter

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _cors_origins() -> list[str]:
    configured = [origin.strip() for origin in settings.frontend_url.split(",") if origin.strip()]
    dev_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
    return list(dict.fromkeys([*configured, *dev_origins]))


cors_origins = _cors_origins()

# Socket.io setup
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=cors_origins,
    ping_timeout=60,
    ping_interval=10,
    logger=True,
    engineio_logger=False
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Brain-Sync Backend...")
    await setup_socket_handlers(sio)
    logger.info("Socket.io handlers configured")
    yield
    logger.info("Shutting down Brain-Sync Backend...")
    await close_db()
    await close_redis()
    logger.info("Connections closed")

app = FastAPI(
    title="Brain-Sync API",
    description="All-in-one Study Workspace",
    version="2.0",
    lifespan=lifespan
)

# Rate Limiting
app.state.limiter = limiter


def _error_payload(code: str, message: str, details=None) -> dict:
    return {"error": {"code": code, "message": message, "details": jsonable_encoder(details)}}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        payload = detail
    elif isinstance(detail, dict) and "code" in detail:
        payload = _error_payload(
            str(detail.get("code") or "INTERNAL_ERROR"),
            str(detail.get("message") or "Request failed."),
            detail.get("details"),
        )
    else:
        code = "UNAUTHORIZED" if exc.status_code == status.HTTP_401_UNAUTHORIZED else "INTERNAL_ERROR"
        payload = _error_payload(code, str(detail or "Request failed."))
    return JSONResponse(status_code=exc.status_code, content=payload, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=_error_payload("VALIDATION_ERROR", "Input validation failed.", exc.errors()),
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exception_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content=_error_payload("RATE_LIMITED", "Too many requests.", str(exc.detail)),
    )

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(documents.router, prefix="/api/v1")
app.include_router(flashcards.router, prefix="/api/v1")
app.include_router(quiz.router, prefix="/api/v1")
app.include_router(exam_planner.router, prefix="/api/v1")
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
        "main:socket_app",
        host="0.0.0.0",
        port=8000,
        reload=settings.app_env == "development"
    )
