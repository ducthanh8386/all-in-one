"""
AI Service: Embeddings, Vector DB operations, Hybrid Search, RAG Streaming.
Uses HuggingFace all-MiniLM-L6-v2 for embeddings and Qdrant for vector storage.
LLM: Gemini 1.5 Flash via google-generativeai.
"""

import json
import logging
from typing import AsyncGenerator, List, Optional

import google.generativeai as genai
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
)

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Constants (defined in config but mirrored here for clarity) ─────────────
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
EMBED_DIMENSION = 384          # all-MiniLM-L6-v2 output dim
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
TOP_K = 5                      # number of results from each search leg
FLASHCARD_MAX_CHARS = 4000     # max chars sent to LLM for flashcard generation

# RAG prompt template (exact copy from spec §6.1.1)
RAG_PROMPT_TEMPLATE = """\
You are a study assistant. Answer the student's question based ONLY on the provided context.
If the answer is not in the context, say "I cannot find this information in the document."
Always respond in the same language as the question.

Context:
{context}

Question: {question}

Answer:"""

# Flashcard generation prompt (exact copy from spec §6.2)
FLASHCARD_PROMPT_TEMPLATE = """\
From the following text, extract 10-15 key concepts, terms, or important facts.
For each, create a flashcard with a clear question (front) and a concise answer (back).
Respond ONLY in JSON format, no markdown fences:
[{{"front": "...", "back": "..."}}, ...]

Text:
{text}"""

# ─── Singletons (lazy-init) ──────────────────────────────────────────────────
_embeddings: Optional[HuggingFaceEmbeddings] = None
_qdrant_client: Optional[QdrantClient] = None


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name=EMBED_MODEL_NAME)
    return _embeddings


def _get_qdrant() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(url=settings.qdrant_url)
    return _qdrant_client


def _get_gemini_model():
    """Configure and return Gemini 1.5 Flash model."""
    genai.configure(api_key=settings.gemini_api_key)
    return genai.GenerativeModel("gemini-1.5-flash")


# ─── Public API ──────────────────────────────────────────────────────────────

def chunk_text(text: str) -> List[str]:
    """Split text into overlapping chunks using RecursiveCharacterTextSplitter."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
    )
    return splitter.split_text(text)


def create_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Create dense embeddings for a list of text chunks.
    Returns a list of float vectors (dim=384).
    """
    emb = _get_embeddings()
    return emb.embed_documents(texts)


def store_to_vector_db(
    collection_name: str,
    chunks: List[str],
    embeddings: List[List[float]],
) -> None:
    """
    Create a Qdrant collection and upsert chunk embeddings.
    Collection name format: doc_{document_id}
    """
    client = _get_qdrant()

    # (Re)create collection each time so re-processing is idempotent
    existing = [c.name for c in client.get_collections().collections]
    if collection_name in existing:
        client.delete_collection(collection_name)

    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=EMBED_DIMENSION, distance=Distance.COSINE),
    )

    points = [
        PointStruct(
            id=idx,
            vector=embedding,
            payload={"text": chunk, "chunk_index": idx},
        )
        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]
    client.upsert(collection_name=collection_name, points=points)
    logger.info(
        "Stored %d chunks in Qdrant collection '%s'", len(points), collection_name
    )


def hybrid_search(collection_name: str, query: str) -> str:
    """
    Perform hybrid search (vector + keyword) on a Qdrant collection.
    Returns a merged context string of the top-K unique chunks.
    """
    client = _get_qdrant()
    emb = _get_embeddings()

    # ── Vector search ────────────────────────────────────────────────────────
    query_vector = emb.embed_query(query)
    vector_results = client.search(
        collection_name=collection_name,
        query_vector=query_vector,
        limit=TOP_K,
        with_payload=True,
    )

    # ── Keyword search (simple substring match inside payloads) ─────────────
    # Retrieve all points and do in-process string match (suitable for ≤10K chunks)
    scroll_result, _ = client.scroll(
        collection_name=collection_name,
        with_payload=True,
        limit=1000,
    )
    keywords = query.lower().split()
    keyword_hits = [
        point
        for point in scroll_result
        if any(kw in (point.payload or {}).get("text", "").lower() for kw in keywords)
    ][:TOP_K]

    # ── Merge & deduplicate by chunk_index ──────────────────────────────────
    seen_ids: set[int] = set()
    merged_chunks: List[str] = []
    for result in [*vector_results, *keyword_hits]:
        payload = result.payload or {}
        chunk_idx = payload.get("chunk_index", -1)
        if chunk_idx not in seen_ids:
            seen_ids.add(chunk_idx)
            merged_chunks.append(payload.get("text", ""))
        if len(merged_chunks) >= TOP_K:
            break

    return "\n\n".join(merged_chunks)


async def stream_rag_answer(
    context: str,
    question: str,
) -> AsyncGenerator[str, None]:
    """
    Stream a RAG answer via Gemini using Server-Sent Events format.
    Yields SSE data lines: 'data: {"chunk": "..."}' and finally 'data: [DONE]'.
    """
    prompt = RAG_PROMPT_TEMPLATE.format(context=context, question=question)
    model = _get_gemini_model()

    try:
        # stream=True returns an iterator of GenerateContentResponse chunks
        response = model.generate_content(prompt, stream=True)
        for chunk in response:
            text = chunk.text if chunk.text else ""
            if text:
                yield f'data: {json.dumps({"chunk": text})}\n\n'
    except Exception as exc:
        logger.exception("Gemini streaming error: %s", exc)
        yield f'data: {json.dumps({"chunk": "[Error generating answer]"})}\n\n'
    finally:
        yield "data: [DONE]\n\n"


def auto_generate_flashcards(document_text: str) -> List[dict]:
    """
    Call Gemini to extract 10-15 flashcards from document text.
    Returns a list of dicts: [{"front": "...", "back": "..."}, ...]
    Returns [] on error (never raises) so Celery task is not interrupted.
    """
    truncated = document_text[:FLASHCARD_MAX_CHARS]
    prompt = FLASHCARD_PROMPT_TEMPLATE.format(text=truncated)
    model = _get_gemini_model()

    raw = ""
    try:
        response = model.generate_content(prompt)
        raw = response.text.strip()

        # Strip markdown fences if model disobeys the prompt
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
        if raw.endswith("```"):
            raw = "\n".join(raw.split("\n")[:-1])

        cards = json.loads(raw)
        if not isinstance(cards, list):
            raise ValueError("Expected a JSON array from LLM")
        return cards
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse flashcard JSON: %s | raw=%s", exc, raw[:200])
        return []
    except Exception as exc:
        logger.exception("auto_generate_flashcards error: %s", exc)
        return []


async def generate_flashcards_from_document(
    document_id: int,
    collection_name: str,
    db,  # AsyncSession — imported lazily to avoid circular imports
) -> List[dict]:
    """
    Retrieve ALL text chunks from Qdrant for a document, prompt Gemini,
    parse the JSON response, and bulk-insert flashcards into the DB.

    Args:
        document_id:     Primary key of the Document record.
        collection_name: Qdrant collection for this document (e.g. "doc_5").
        db:              An open AsyncSession from FastAPI's get_db dependency.

    Returns:
        List of raw card dicts [{"front": ..., "back": ...}] that were inserted.
    """
    from app.db.models import Document, DocumentStatus
    from app.services.flashcard_service import bulk_insert_flashcards
    from sqlalchemy import select

    # ── 1. Fetch Document record to get user_id ───────────────────────────────
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalars().first()
    if not document:
        raise ValueError(f"Document {document_id} not found")

    # ── 2. Pull all text chunks from Qdrant ───────────────────────────────────
    client = _get_qdrant()
    scroll_result, _ = client.scroll(
        collection_name=collection_name,
        with_payload=True,
        limit=2000,          # cover large documents
    )
    all_text = "\n\n".join(
        (point.payload or {}).get("text", "") for point in scroll_result
    )
    if not all_text.strip():
        logger.warning("No text found in Qdrant collection '%s'", collection_name)
        return []

    # ── 3. Call Gemini and parse JSON ─────────────────────────────────────────
    cards = auto_generate_flashcards(all_text)
    if not cards:
        return []

    # ── 4. Bulk insert ────────────────────────────────────────────────────────
    inserted = await bulk_insert_flashcards(db, document.user_id, document_id, cards)
    logger.info(
        "generate_flashcards_from_document: inserted %d cards for doc %d",
        inserted,
        document_id,
    )
    return cards

