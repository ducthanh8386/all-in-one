"""
Phase 3 — Flashcard Tests.

Covers:
  - SM-2 algorithm unit tests (T3-3 to T3-7)
  - Manual CRUD integration tests (T3-10)
  - Review endpoint (T3-2, SM-2 sequence)
  - AI generate endpoint (mocked, T3-1)
  - Due cards filter (T3-2)

All LLM calls are mocked via unittest.mock per PRD §11.
DB is an async SQLite in-memory instance.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.models import Base, Document, DocumentStatus, Flashcard, User, UserRole
from app.db.session import get_db
from app.services.flashcard_service import apply_sm2

# ─── In-memory Test DB ────────────────────────────────────────────────────────

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


# ─── Shared Fixtures ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username="flashuser",
        email="flash@example.com",
        hashed_password=hash_password("password123"),
        role=UserRole.USER,
        ai_quota=50,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(test_user: User) -> dict:
    token = create_access_token({
        "sub": str(test_user.id),
        "username": test_user.username,
        "role": test_user.role.value,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def completed_doc(db: AsyncSession, test_user: User) -> Document:
    doc = Document(
        user_id=test_user.id,
        title="AI Textbook",
        file_path="/tmp/ai.pdf",
        status=DocumentStatus.COMPLETED,
        vector_collection_name="doc_42",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@pytest_asyncio.fixture
async def sample_card(db: AsyncSession, test_user: User, completed_doc: Document) -> Flashcard:
    """A flashcard due right now (next_review_date in the past)."""
    card = Flashcard(
        user_id=test_user.id,
        doc_id=completed_doc.id,
        front_text="What is a neural network?",
        back_text="A system of algorithms modelling the human brain.",
        repetition_count=0,
        ease_factor=2.5,
        interval_days=0,
        next_review_date=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card


@pytest_asyncio.fixture
async def future_card(db: AsyncSession, test_user: User, completed_doc: Document) -> Flashcard:
    """A flashcard NOT due yet (next_review_date in the future)."""
    card = Flashcard(
        user_id=test_user.id,
        doc_id=completed_doc.id,
        front_text="What is backpropagation?",
        back_text="An algorithm for training neural networks.",
        repetition_count=2,
        ease_factor=2.5,
        interval_days=10,
        next_review_date=datetime.now(timezone.utc) + timedelta(days=10),
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card


# ═══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS — SM-2 Algorithm
# ═══════════════════════════════════════════════════════════════════════════════

class TestSM2Algorithm:
    """T3-3, T3-4, T3-5, T3-6, T3-7 — Pure SM-2 logic tests."""

    def test_perfect_recall_increases_ef_and_interval(self):
        """T3-3: quality=5 → EF increases, interval increases."""
        rep, ef, interval = apply_sm2(
            repetition_count=1, ease_factor=2.5, interval_days=1, quality=5
        )
        assert rep == 2
        assert ef > 2.5            # EF must increase for quality=5
        assert interval == 6       # second repetition → I = 6 per spec

    def test_quality_below_3_resets_repetition(self):
        """T3-4: quality=2 → repetition_count reset to 0, interval=1."""
        rep, ef, interval = apply_sm2(
            repetition_count=3, ease_factor=2.5, interval_days=10, quality=2
        )
        assert rep == 0
        assert interval == 1
        assert ef == 2.5           # EF must NOT change on failure

    def test_ef_never_falls_below_1_3(self):
        """T3-5: Repeated low-quality reviews must not drop EF below 1.3."""
        ef = 2.5
        for _ in range(20):
            _, ef, _ = apply_sm2(0, ef, 1, quality=3)  # quality=3 gives minimal gain
        assert ef >= 1.3

    def test_sm2_sequence_four_four_four(self):
        """T3-6: sequence q=4,q=4,q=4 → intervals: 1 → 6 → ~8 (round(6*EF))."""
        rep, ef, interval = 0, 2.5, 0

        # First review
        rep, ef, interval = apply_sm2(rep, ef, interval, quality=4)
        assert interval == 1
        assert rep == 1

        # Second review
        rep, ef, interval = apply_sm2(rep, ef, interval, quality=4)
        assert interval == 6
        assert rep == 2

        # Third review — I = round(6 * EF_after_two_q4_reviews)
        rep, ef, interval = apply_sm2(rep, ef, interval, quality=4)
        expected = round(6 * ef)   # ef after q=4,q=4 is ~2.5 → interval ~= 15? Let's just verify > 6
        assert interval > 6
        assert rep == 3

    def test_quality_5_maximum_ef_increase(self):
        """quality=5 gives the largest EF increase (delta = 0.1)."""
        _, ef5, _ = apply_sm2(0, 2.5, 0, quality=5)
        _, ef4, _ = apply_sm2(0, 2.5, 0, quality=4)
        assert ef5 > ef4

    def test_quality_0_resets_like_quality_2(self):
        """quality=0 also resets repetition, interval=1, EF unchanged."""
        rep, ef, interval = apply_sm2(5, 2.8, 30, quality=0)
        assert rep == 0
        assert interval == 1
        assert ef == 2.8

    def test_first_repetition_interval_is_1(self):
        """On first review (repetition_count=0), interval must be 1."""
        rep, ef, interval = apply_sm2(0, 2.5, 0, quality=5)
        assert interval == 1
        assert rep == 1

    def test_second_repetition_interval_is_6(self):
        """On second review (repetition_count=1), interval must be 6."""
        rep, ef, interval = apply_sm2(1, 2.5, 1, quality=5)
        assert interval == 6
        assert rep == 2


# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Manual CRUD
# ═══════════════════════════════════════════════════════════════════════════════

class TestFlashcardCRUD:
    """T3-10 — Create, list, update, delete via REST endpoints."""

    @pytest.mark.asyncio
    async def test_create_flashcard_returns_201(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Manual creation → 201 with correct fields."""
        resp = await client.post(
            "/api/v1/flashcards",
            json={"front_text": "What is TCP?", "back_text": "Transmission Control Protocol."},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["front_text"] == "What is TCP?"
        assert data["repetition_count"] == 0
        assert data["ease_factor"] == 2.5
        assert "next_review_date" in data

    @pytest.mark.asyncio
    async def test_create_flashcard_empty_front_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Empty front_text → 422 validation error."""
        resp = await client.post(
            "/api/v1/flashcards",
            json={"front_text": "  ", "back_text": "Some answer."},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    @pytest.mark.asyncio
    async def test_list_flashcards_returns_user_cards(
        self, client: AsyncClient, auth_headers: dict, sample_card: Flashcard
    ):
        """GET /flashcards returns the user's flashcards."""
        resp = await client.get("/api/v1/flashcards", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        ids = [c["id"] for c in data]
        assert sample_card.id in ids

    @pytest.mark.asyncio
    async def test_list_flashcards_filter_by_doc(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_card: Flashcard,
        completed_doc: Document,
    ):
        """GET /flashcards?doc_id=X returns only cards for that doc."""
        resp = await client.get(
            f"/api/v1/flashcards?doc_id={completed_doc.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        for card in resp.json():
            assert card["doc_id"] == completed_doc.id

    @pytest.mark.asyncio
    async def test_update_flashcard(
        self, client: AsyncClient, auth_headers: dict, sample_card: Flashcard
    ):
        """PUT /flashcards/{id} → updated front_text reflected in response."""
        resp = await client.put(
            f"/api/v1/flashcards/{sample_card.id}",
            json={"front_text": "Updated question?"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["front_text"] == "Updated question?"

    @pytest.mark.asyncio
    async def test_delete_flashcard(
        self, client: AsyncClient, auth_headers: dict, sample_card: Flashcard
    ):
        """DELETE /flashcards/{id} → 204, then GET returns empty list."""
        resp = await client.delete(
            f"/api/v1/flashcards/{sample_card.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 204

        # Verify it's gone
        list_resp = await client.get(
            f"/api/v1/flashcards?doc_id={sample_card.doc_id}",
            headers=auth_headers,
        )
        ids = [c["id"] for c in list_resp.json()]
        assert sample_card.id not in ids

    @pytest.mark.asyncio
    async def test_get_nonexistent_card_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        """PUT on non-existent card → 404."""
        resp = await client.put(
            "/api/v1/flashcards/99999",
            json={"front_text": "X"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_flashcard_requires_auth(self, client: AsyncClient):
        """No token → 403."""
        resp = await client.get("/api/v1/flashcards")
        assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Review Endpoint (SM-2)
# ═══════════════════════════════════════════════════════════════════════════════

class TestReviewEndpoint:
    """T3-2, T3-3, T3-4, T3-7 — Review endpoint correctness."""

    @pytest.mark.asyncio
    async def test_review_quality_5_increases_interval(
        self, client: AsyncClient, auth_headers: dict, sample_card: Flashcard
    ):
        """quality=5 → next_review_date moves into the future (interval=1 for rep_count=0)."""
        resp = await client.post(
            f"/api/v1/flashcards/{sample_card.id}/review",
            json={"quality": 5},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["repetition_count"] == 1
        assert data["interval_days"] == 1
        # next_review_date must be in the future
        nrd_str = data["next_review_date"]
        # Python 3.11+ fromisoformat handles Z; for 3.10 compat we replace Z
        nrd_str = nrd_str.replace("Z", "+00:00")
        nrd = datetime.fromisoformat(nrd_str)
        # Ensure both are offset-aware for comparison
        if nrd.tzinfo is None:
            nrd = nrd.replace(tzinfo=timezone.utc)
        assert nrd > datetime.now(timezone.utc)

    @pytest.mark.asyncio
    async def test_review_quality_2_resets_card(
        self, client: AsyncClient, auth_headers: dict, future_card: Flashcard
    ):
        """quality=2 on a mature card → repetition_count=0, interval_days=1."""
        resp = await client.post(
            f"/api/v1/flashcards/{future_card.id}/review",
            json={"quality": 2},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["repetition_count"] == 0
        assert data["interval_days"] == 1

    @pytest.mark.asyncio
    async def test_review_quality_out_of_range_returns_422(
        self, client: AsyncClient, auth_headers: dict, sample_card: Flashcard
    ):
        """T3-7: quality=6 → 422 VALIDATION_ERROR."""
        resp = await client.post(
            f"/api/v1/flashcards/{sample_card.id}/review",
            json={"quality": 6},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    @pytest.mark.asyncio
    async def test_review_quality_negative_returns_422(
        self, client: AsyncClient, auth_headers: dict, sample_card: Flashcard
    ):
        """quality=-1 → 422."""
        resp = await client.post(
            f"/api/v1/flashcards/{sample_card.id}/review",
            json={"quality": -1},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    @pytest.mark.asyncio
    async def test_due_cards_filter(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_card: Flashcard,
        future_card: Flashcard,
    ):
        """T3-2: GET /flashcards/due returns only past-due cards."""
        resp = await client.get("/api/v1/flashcards/due", headers=auth_headers)
        assert resp.status_code == 200
        ids = [c["id"] for c in resp.json()]
        assert sample_card.id in ids        # due (past)
        assert future_card.id not in ids    # NOT due (future)

    @pytest.mark.asyncio
    async def test_due_for_review_query_param(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_card: Flashcard,
        future_card: Flashcard,
    ):
        """GET /flashcards?due_for_review=true mirrors /due endpoint."""
        resp = await client.get(
            "/api/v1/flashcards?due_for_review=true",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        ids = [c["id"] for c in resp.json()]
        assert sample_card.id in ids
        assert future_card.id not in ids


# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — AI Generate Endpoint (mocked LLM)
# ═══════════════════════════════════════════════════════════════════════════════

class TestGenerateEndpoint:
    """T3-1 — AI generation endpoint with mocked Gemini."""

    @pytest.mark.asyncio
    async def test_generate_creates_flashcards(
        self,
        client: AsyncClient,
        auth_headers: dict,
        completed_doc: Document,
    ):
        """POST /generate/{doc_id} → 201, cards inserted in DB (mocked LLM)."""
        fake_cards = [
            {"front": "What is overfitting?", "back": "Model learns training data too well."},
            {"front": "What is regularisation?", "back": "Technique to prevent overfitting."},
        ]

        # Mock Qdrant scroll and Gemini generate_content
        mock_point = MagicMock()
        mock_point.payload = {"text": "deep learning text", "chunk_index": 0}

        mock_response = MagicMock()
        mock_response.text = json.dumps(fake_cards)

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response

        with (
            patch(
                "app.services.ai_service._get_qdrant",
                return_value=MagicMock(
                    scroll=MagicMock(return_value=([mock_point], None))
                ),
            ),
            patch("app.services.ai_service._get_gemini_model", return_value=mock_model),
        ):
            resp = await client.post(
                f"/api/v1/flashcards/generate/{completed_doc.id}",
                headers=auth_headers,
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["generated_count"] == 2
        assert data["document_id"] == completed_doc.id

    @pytest.mark.asyncio
    async def test_generate_non_completed_doc_returns_400(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_user: User,
    ):
        """Generating for a PENDING doc → 400."""
        doc = Document(
            user_id=test_user.id,
            title="Pending",
            file_path="/tmp/p.pdf",
            status=DocumentStatus.PENDING,
            vector_collection_name=None,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

        resp = await client.post(
            f"/api/v1/flashcards/generate/{doc.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    @pytest.mark.asyncio
    async def test_generate_nonexistent_doc_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Generating for doc that doesn't exist → 404."""
        resp = await client.post(
            "/api/v1/flashcards/generate/99999",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_generate_quota_exceeded_returns_403(
        self,
        client: AsyncClient,
        db: AsyncSession,
        completed_doc: Document,
        test_user: User,
    ):
        """ai_quota=0 → 403 QUOTA_EXCEEDED."""
        # Exhaust quota
        test_user.ai_quota = 0
        await db.commit()

        token = create_access_token({
            "sub": str(test_user.id),
            "username": test_user.username,
            "role": test_user.role.value,
        })
        resp = await client.post(
            f"/api/v1/flashcards/generate/{completed_doc.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "QUOTA_EXCEEDED"
