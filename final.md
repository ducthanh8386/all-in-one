# PROJECT REQUIREMENT DOCUMENT (PRD) & TECHNICAL SPECIFICATION
**Project Name:** Brain-Sync (All-in-one Study Workspace)
**Version:** 2.0 (Final)
**Target Audience:** Sinh viên đại học.
**Goal:** Xây dựng hệ thống học tập tích hợp quản lý thời gian, Chatbot RAG, Flashcard (SM-2) và Đấu trường Real-time.
**Instruction for AI Coder:** Đọc kỹ toàn bộ file này trước khi viết bất kỳ dòng code nào. Tuân thủ nghiêm ngặt Tech Stack và Architecture đã quy định. Không tự ý thêm bớt thư viện ngoài danh sách trừ khi bắt buộc.

---

## 1. TECH STACK & ARCHITECTURE

Hệ thống sử dụng kiến trúc Decoupled (Tách biệt Frontend và Backend hoàn toàn).

### 1.1. Frontend (Client)
- **Framework:** Next.js 14 (App Router).
- **Language:** TypeScript (Strict mode).
- **Styling:** TailwindCSS, Shadcn UI (cho các component cơ bản), Framer Motion (cho animation thẻ flashcard).
- **State Management:** `Zustand` (Global state, Room state).
- **Math & Markdown:** `react-markdown`, `remark-math`, `rehype-katex` (Render công thức Toán/Xác suất thống kê).
- **Real-time:** `socket.io-client`.
- **HTTP Client:** `axios` (kèm interceptor tự động gắn JWT và xử lý refresh token).

### 1.2. Backend (Server)
- **Framework:** FastAPI (Python 3.11+). Bắt buộc dùng `async/await` cho mọi endpoint.
- **Database ORM:** SQLAlchemy (v2.0) kết hợp `alembic` để migration.
- **Background Tasks:** `Celery` kết hợp `Redis` broker.
- **AI Orchestration:** `LangChain` + API LLM (Gemini 1.5 Flash).
- **Real-time:** `python-socketio` (Mount chung với FastAPI app).
- **Auth:** `python-jose` (JWT), `passlib[bcrypt]` (Password hashing).
- **File Handling:** `python-multipart`, `pdfplumber`.
- **Settings:** `pydantic-settings` (đọc `.env`).
- **Rate Limiting:** `slowapi` (wrapper của `limits`, dùng Redis backend).

### 1.3. Infrastructure & DB
- **Primary Database:** PostgreSQL 15+.
- **Cache & Message Broker:** Redis 7+ (Bắt buộc dùng cho Socket rooms và Rate Limiting).
- **Vector Database:** Qdrant (self-hosted via Docker) hoặc ChromaDB (Lưu trữ document embeddings).
- **File Storage:** Local filesystem trong development (`/uploads`). Production nên dùng MinIO hoặc S3-compatible storage (cấu hình qua env).
- **Containerization:** Docker + Docker Compose cho toàn bộ hệ thống.

---

## 2. DIRECTORY STRUCTURE

Khởi tạo chính xác theo cấu trúc này:

```
all-in-one/
├── docker-compose.yml
├── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js App Router pages
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── workspace/
│   │   │   │   ├── page.tsx        # Document list
│   │   │   │   └── [docId]/page.tsx # Chat with document
│   │   │   ├── flashcards/page.tsx
│   │   │   ├── schedule/page.tsx
│   │   │   └── arena/
│   │   │       ├── page.tsx        # Lobby
│   │   │       └── [roomId]/page.tsx
│   │   ├── components/             # Reusable UI (Button, Modal, MathRenderer)
│   │   ├── features/               # Logic tách biệt theo domain
│   │   │   ├── rag-chat/
│   │   │   ├── flashcard/
│   │   │   ├── quiz-room/
│   │   │   └── scheduler/
│   │   ├── lib/                    # Utils, axios instance, socket init
│   │   │   ├── axios.ts
│   │   │   └── socket.ts
│   │   └── store/                  # Zustand stores
│   │       ├── authStore.ts
│   │       ├── roomStore.ts
│   │       └── schedulerStore.ts
│   ├── .env.local
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── api/                    # RESTful endpoints (v1)
│   │   │   └── v1/
│   │   │       ├── auth.py
│   │   │       ├── documents.py
│   │   │       ├── flashcards.py
│   │   │       ├── schedules.py
│   │   │       └── admin.py
│   │   ├── core/                   # Config, security (JWT), Redis setup
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── redis.py
│   │   ├── db/                     # SQLAlchemy models, sessions
│   │   │   ├── models.py
│   │   │   └── session.py
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   │   ├── auth.py
│   │   │   ├── document.py
│   │   │   ├── flashcard.py
│   │   │   └── schedule.py
│   │   ├── services/               # Business logic layer
│   │   │   ├── ai_service.py
│   │   │   ├── flashcard_service.py
│   │   │   ├── game_service.py
│   │   │   └── schedule_service.py
│   │   ├── sockets/                # Socket.io event handlers
│   │   │   └── game_handlers.py
│   │   └── workers/                # Celery tasks
│   │       └── document_tasks.py
│   ├── alembic/
│   ├── main.py
│   ├── .env
│   └── requirements.txt
```

---

## 3. ENVIRONMENT VARIABLES

### 3.1. Backend `.env`
```env
# App
APP_ENV=development
SECRET_KEY=your-256-bit-secret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/brainsync

# Redis
REDIS_URL=redis://localhost:6379/0

# Vector DB
QDRANT_URL=http://localhost:6333

# AI
GEMINI_API_KEY=your-gemini-api-key

# File Storage
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE_MB=20
ALLOWED_EXTENSIONS=pdf

# CORS
FRONTEND_URL=http://localhost:3000
```

### 3.2. Frontend `.env.local`
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_SOCKET_URL=http://localhost:8000
```

---

## 4. DATABASE SCHEMA (PostgreSQL)

Triển khai các bảng sau bằng SQLAlchemy Models:

```sql
-- ENUMs
CREATE TYPE user_role AS ENUM ('USER', 'MODERATOR', 'ADMIN');
CREATE TYPE doc_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- Tables
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'USER',
    ai_quota INT DEFAULT 100,       -- Số lượt gọi AI còn lại
    is_active BOOLEAN DEFAULT TRUE, -- Soft ban
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(512) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(512),           -- Đường dẫn file lưu trữ
    status doc_status DEFAULT 'PENDING',
    vector_collection_name VARCHAR(100),
    error_message TEXT,               -- Ghi lại lỗi nếu status = FAILED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE flashcards (
    id SERIAL PRIMARY KEY,
    doc_id INT REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    front_text TEXT NOT NULL,
    back_text TEXT NOT NULL,
    -- SM-2 Algorithm fields
    repetition_count INT DEFAULT 0,
    ease_factor FLOAT DEFAULT 2.5,
    interval_days INT DEFAULT 0,
    next_review_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE schedules (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule VARCHAR(100),     -- Ví dụ: 'WEEKLY', 'DAILY'
    reference_doc_id INT REFERENCES documents(id) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 5. AUTHENTICATION & SECURITY

### 5.1. JWT Strategy (Dual Token)

- **Access Token:** Hết hạn sau `30 phút`. Gửi trong header `Authorization: Bearer <token>`.
- **Refresh Token:** Hết hạn sau `7 ngày`. Lưu trong bảng `refresh_tokens` DB (server-side) để có thể revoke. Trả về trong `HttpOnly Cookie` (không phải response body) để chống XSS.

**JWT Payload structure:**
```json
{
  "sub": "user-uuid",
  "username": "john_doe",
  "role": "USER",
  "exp": 1234567890
}
```

### 5.2. Password Hashing
Dùng `passlib[bcrypt]` với `rounds=12`.

### 5.3. Auth Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/auth/register` | Đăng ký. Validate email format, password >= 8 ký tự. |
| POST | `/auth/login` | Đăng nhập. Trả về `access_token` + set `refresh_token` cookie. |
| POST | `/auth/refresh` | Dùng refresh token cookie để cấp access token mới. |
| POST | `/auth/logout` | Revoke refresh token (set `revoked=True` trong DB). |
| GET | `/auth/me` | Lấy thông tin user hiện tại (cần auth). |

### 5.4. Các biện pháp bảo mật khác
- **CORS:** Whitelist chỉ `FRONTEND_URL` từ env. Không dùng `*`.
- **Input Sanitization:** Validate toàn bộ input qua Pydantic schemas. Dùng SQLAlchemy parameterized queries (không raw SQL).
- **Rate Limiting:** Dùng `slowapi` với Redis backend.
  - Unauthenticated routes (`/auth/login`, `/auth/register`): **10 requests/minute/IP**.
  - AI endpoints (`/chat`, auto-generate): **20 requests/hour/user** (trừ vào `ai_quota`).
  - General API: **100 requests/minute/user**.
- **File Upload Validation:**
  - Chỉ chấp nhận `application/pdf`.
  - Giới hạn kích thước: **20MB**.
  - Đổi tên file thành UUID khi lưu để tránh path traversal.

---

## 6. CORE FEATURES & LOGIC IMPLEMENTATION

### 6.1. Feature 1: Hybrid RAG Pipeline (Document AI)

**Workflow:**

**Bước 1 — Upload Endpoint:** `POST /api/v1/documents/upload`
- Validate file (type, size).
- Lưu file vào `UPLOAD_DIR/{user_id}/{uuid}.pdf`.
- Tạo record DB với `status = PENDING`, ghi lại `file_path`.
- Trả về `document_id` ngay lập tức (HTTP 202 Accepted).
- Trigger Celery Task `process_document_task(document_id)`.

**Bước 2 — Celery Worker** (`process_document_task`):
1. Update DB `status = PROCESSING`.
2. Dùng `pdfplumber` để extract text từng trang.
3. Semantic Chunking dùng `RecursiveCharacterTextSplitter` (chunk_size=1000, overlap=200).
4. Tạo embeddings với `HuggingFaceEmbeddings` (model: `all-MiniLM-L6-v2`).
5. Lưu vào Vector DB với `collection_name = f"doc_{document_id}"`, lưu tên collection vào DB.
6. Gọi `auto_generate_flashcards(document_id)` (xem Feature 2).
7. Update DB `status = COMPLETED`.
8. Emit Socket event `document:processing_done` tới user (qua `user_{user_id}` room).
9. Nếu lỗi bất kỳ bước nào: update `status = FAILED`, ghi `error_message`, emit `document:processing_failed`.

**Bước 3 — Chat Endpoint:** `POST /api/v1/documents/{id}/chat`
- Kiểm tra `ai_quota > 0`, nếu hết trả về `HTTP 429`.
- Thực hiện Hybrid Search:
  - **Vector search:** Top 5 chunks gần nhất theo cosine similarity.
  - **Keyword search:** Full-text search trên chunks đã extract (dùng PostgreSQL `tsvector` hoặc simple string match).
  - Merge và deduplicate kết quả, lấy top 5 cuối cùng.
- Xây dựng context prompt (xem mục 6.1.1).
- Trả về `StreamingResponse` dùng Server-Sent Events (SSE).
- Trừ 1 `ai_quota` sau khi hoàn thành stream.

**6.1.1. RAG Prompt Template:**
```
You are a study assistant. Answer the student's question based ONLY on the provided context.
If the answer is not in the context, say "I cannot find this information in the document."
Always respond in the same language as the question.

Context:
{context}

Question: {question}

Answer:
```

**SSE Response Format:**
```
data: {"chunk": "Nội dung từng phần..."}
data: {"chunk": " tiếp theo..."}
data: [DONE]
```

---

### 6.2. Feature 2: Flashcard & SM-2 Algorithm

**Auto-Generate Flashcards** (chạy trong Celery worker sau khi document processed):

Prompt gửi cho LLM:
```
From the following text, extract 10-15 key concepts, terms, or important facts.
For each, create a flashcard with a clear question (front) and a concise answer (back).
Respond ONLY in JSON format, no markdown fences:
[{"front": "...", "back": "..."}, ...]

Text:
{full_document_text_truncated_to_4000_chars}
```

Parse JSON response, bulk insert vào bảng `flashcards` với `user_id` và `doc_id`.

**Review Logic:** `POST /api/v1/flashcards/{id}/review`

Nhận payload `{ "quality": int }` (0–5). Bắt buộc code đúng công thức:

```
Nếu quality >= 3 (Nhớ):
  EF_new = EF_old + (0.1 - (5 - quality) × (0.08 + (5 - quality) × 0.02))
  Nếu EF_new < 1.3 → EF_new = 1.3

  Nếu repetition_count == 0 → I = 1
  Nếu repetition_count == 1 → I = 6
  Nếu repetition_count > 1  → I = round(I_old × EF_new)

  repetition_count += 1

Nếu quality < 3 (Quên):
  repetition_count = 0
  interval_days = 1
  EF không thay đổi

Cập nhật next_review_date = NOW() + timedelta(days=I)
```

---

### 6.3. Feature 3: Schedule Manager

**Mục đích:** Cho phép sinh viên lên lịch học theo block thời gian, liên kết với tài liệu cụ thể.

**Endpoints:**

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/v1/schedules` | Lấy tất cả schedule của user. Query params: `?start=ISO8601&end=ISO8601` để filter theo khoảng. |
| POST | `/api/v1/schedules` | Tạo schedule mới. |
| PUT | `/api/v1/schedules/{id}` | Cập nhật schedule. |
| DELETE | `/api/v1/schedules/{id}` | Xoá schedule. |
| GET | `/api/v1/schedules/today` | Lấy schedule ngày hôm nay kèm flashcard due count của doc liên kết. |

**Request schema (POST/PUT):**
```json
{
  "title": "Ôn tập Hệ điều hành",
  "description": "Tập trung chương 3, 4",
  "start_time": "2024-11-01T08:00:00+07:00",
  "end_time": "2024-11-01T10:00:00+07:00",
  "is_recurring": false,
  "recurrence_rule": null,
  "reference_doc_id": 5
}
```

**Validation:**
- `end_time` phải sau `start_time`.
- Không cho phép overlap schedule cùng user (query kiểm tra trước khi insert).

**Frontend Calendar:**
- Dùng thư viện `react-big-calendar` để hiển thị dạng week/month view.
- Click vào block schedule sẽ hiện popup với link trực tiếp tới document và số flashcard còn cần ôn hôm nay.

---

### 6.4. Feature 4: Real-time Multiplayer Game (Concept Association)

**Cơ chế chơi ẩn danh:** AI đưa ra 1 keyword khó, người chơi viết định nghĩa giả (fake definition) để lừa nhau vote.

**Game Config:**
- Số người tối thiểu: 2, tối đa: 8.
- Thời gian viết định nghĩa: 60 giây.
- Thời gian vote: 30 giây.
- Nếu player không submit trong timeout → bị bỏ qua round đó (không tính điểm).

**Redis State Structure (In-Memory):**
```
room:{room_id}           (Hash)        → { status: 'WAITING'|'WRITING'|'VOTING'|'ENDED',
                                           host_id: uuid, current_keyword: str,
                                           round: int, max_rounds: 3 }
room:{room_id}:players   (Set)         → [user_id_1, user_id_2, ...]
room:{room_id}:answers   (Hash)        → { user_id: "fake text", "AI_BOT": "real definition" }
room:{room_id}:votes     (Hash)        → { voter_user_id: voted_for_user_id }
room:{room_id}:scores    (Sorted Set)  → Leaderboard (score ascending, dùng ZADD)
room:{room_id}:timer     (String)      → Unix timestamp khi phase bắt đầu (TTL = phase duration)
```

**Socket.io Events:**

| Event (Client → Server) | Mô tả |
|--------------------------|-------|
| `join_room(room_id, user_id)` | Thêm player vào room. Broadcast `player_joined` tới room. |
| `start_game(room_id)` | Chỉ host được gọi. Đổi status, AI sinh keyword, emit `game_started`. |
| `submit_definition(room_id, text)` | Lưu vào Redis Hash. Khi đủ player nộp (hoặc hết timeout), emit `voting_phase`. |
| `submit_vote(room_id, voted_for_user_id)` | Atomic update điểm (Lua Script). |
| `next_round(room_id)` | Host kích hoạt round tiếp. Nếu đủ max_rounds, emit `game_over`. |

| Event (Server → Client) | Payload |
|--------------------------|---------|
| `player_joined` | `{ players: [...] }` |
| `game_started` | `{ keyword: str, writing_deadline: unix_ts }` |
| `voting_phase` | `{ definitions: [{ id: str, text: str }] }` (shuffle, ẩn tên) |
| `round_result` | `{ scores: [...], correct_answer_owner: 'AI_BOT', votes_breakdown: [...] }` |
| `game_over` | `{ final_scores: [...] }` |
| `player_disconnected` | `{ user_id: str }` |

**Scoring Lua Script (atomic):**
```lua
-- Chọn đúng đáp án AI: +3 điểm
-- Lừa được người khác chọn mình: +1 điểm/người
```

**Timeout handling:**
- Dùng Celery beat task hoặc Redis keyspace notification để tự động chuyển phase khi hết `timer`.
- Khi player disconnect (`disconnect` event): xoá khỏi `room:{room_id}:players`. Nếu còn < 2 người, huỷ game và emit `game_cancelled`.

**Reconnect handling:**
- Khi player reconnect với cùng `user_id`, cho phép rejoin nếu game chưa kết thúc và player có trong set.
- Emit `game_state_sync` tới player đó để restore trạng thái hiện tại.

---

## 7. API ENDPOINTS SUMMARY (REST)

### Auth
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/auth/register` | ❌ | Đăng ký tài khoản |
| POST | `/auth/login` | ❌ | Đăng nhập |
| POST | `/auth/refresh` | Cookie | Làm mới access token |
| POST | `/auth/logout` | ✅ | Đăng xuất, revoke token |
| GET | `/auth/me` | ✅ | Lấy profile |

### Workspace (Documents)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/v1/documents` | ✅ | Danh sách documents của user |
| POST | `/api/v1/documents/upload` | ✅ | Upload PDF (multipart/form-data) |
| GET | `/api/v1/documents/{id}` | ✅ | Chi tiết 1 document |
| DELETE | `/api/v1/documents/{id}` | ✅ | Xoá document |
| POST | `/api/v1/documents/{id}/chat` | ✅ | Chat với document (SSE Streaming) |

### Flashcards
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/v1/flashcards/due` | ✅ | Lấy thẻ cần học hôm nay (next_review_date <= NOW()) |
| GET | `/api/v1/flashcards?doc_id={id}` | ✅ | Lấy tất cả thẻ theo document |
| POST | `/api/v1/flashcards` | ✅ | Tạo thẻ thủ công |
| PUT | `/api/v1/flashcards/{id}` | ✅ | Sửa nội dung thẻ |
| DELETE | `/api/v1/flashcards/{id}` | ✅ | Xoá thẻ |
| POST | `/api/v1/flashcards/{id}/review` | ✅ | Nộp kết quả ôn tập (SM-2 update) |

### Schedule
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/v1/schedules` | ✅ | Danh sách (filter by date range) |
| GET | `/api/v1/schedules/today` | ✅ | Schedule hôm nay |
| POST | `/api/v1/schedules` | ✅ | Tạo mới |
| PUT | `/api/v1/schedules/{id}` | ✅ | Cập nhật |
| DELETE | `/api/v1/schedules/{id}` | ✅ | Xoá |

### Admin
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/v1/admin/users` | ✅ ADMIN | Danh sách tất cả users |
| PUT | `/api/v1/admin/users/{id}/quota` | ✅ ADMIN | Cập nhật ai_quota |
| PUT | `/api/v1/admin/users/{id}/status` | ✅ ADMIN | Kích hoạt/vô hiệu hoá user |

---

## 8. ERROR RESPONSE SCHEMA (Chuẩn hoá)

Mọi error response phải tuân theo schema sau:

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Document with id 42 does not exist.",
    "details": null
  }
}
```

Bảng Error Codes:

| HTTP Code | Error Code | Trường hợp |
|-----------|------------|-----------|
| 400 | `VALIDATION_ERROR` | Input không hợp lệ |
| 400 | `SCHEDULE_OVERLAP` | Lịch bị trùng |
| 401 | `UNAUTHORIZED` | Thiếu hoặc sai token |
| 401 | `TOKEN_EXPIRED` | Access token hết hạn |
| 403 | `FORBIDDEN` | Không đủ quyền |
| 403 | `QUOTA_EXCEEDED` | Hết lượt AI |
| 404 | `NOT_FOUND` | Resource không tồn tại |
| 413 | `FILE_TOO_LARGE` | File vượt 20MB |
| 415 | `INVALID_FILE_TYPE` | Không phải PDF |
| 429 | `RATE_LIMITED` | Quá nhiều request |
| 500 | `INTERNAL_ERROR` | Lỗi server |

---

## 9. FRONTEND ROUTING (Next.js App Router)

| Route | Page | Mô tả |
|-------|------|-------|
| `/login` | Login Page | Public |
| `/register` | Register Page | Public |
| `/dashboard` | Dashboard | Private — overview thống kê |
| `/workspace` | Document List | Private |
| `/workspace/[docId]` | Chat Interface | Private |
| `/flashcards` | Flashcard Review | Private |
| `/schedule` | Calendar View | Private |
| `/arena` | Game Lobby | Private |
| `/arena/[roomId]` | Game Room | Private |

**Route Protection:** Dùng Next.js Middleware (`middleware.ts`) để redirect unauthenticated user về `/login`. Check access token từ cookie hoặc localStorage.

**Axios Interceptors (`lib/axios.ts`):**
- **Request interceptor:** Tự động gắn `Authorization: Bearer {access_token}`.
- **Response interceptor:** Nếu nhận `401 TOKEN_EXPIRED`, tự động gọi `/auth/refresh`, cập nhật token trong Zustand store, retry request gốc. Nếu refresh thất bại → logout và redirect `/login`.

---

## 10. DOCKER COMPOSE SETUP

```yaml
# docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: brainsync
      POSTGRES_PASSWORD: brainsync_pass
      POSTGRES_DB: brainsync
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  backend:
    build: ./backend
    depends_on: [postgres, redis, qdrant]
    env_file: ./backend/.env
    ports:
      - "8000:8000"
    volumes:
      - ./backend/uploads:/app/uploads

  celery_worker:
    build: ./backend
    command: celery -A app.workers.celery_app worker --loglevel=info
    depends_on: [redis, postgres, qdrant]
    env_file: ./backend/.env
    volumes:
      - ./backend/uploads:/app/uploads

  frontend:
    build: ./frontend
    depends_on: [backend]
    env_file: ./frontend/.env.local
    ports:
      - "3000:3000"

volumes:
  postgres_data:
  qdrant_data:
```

---

## 11. TESTING STRATEGY

### Backend (pytest)
- **Unit tests:** `services/` layer — test SM-2 logic, game scoring logic.
- **Integration tests:** API endpoints dùng `httpx.AsyncClient` + test database (SQLite in-memory hoặc PostgreSQL Docker).
- **Mocking:** Mock LLM calls (Gemini API) dùng `unittest.mock` để tránh tốn token khi test.
- Đặt tests tại `backend/tests/`.

### Frontend (Jest + React Testing Library)
- Test các component độc lập: `FlashCard`, `MathRenderer`, `ScheduleForm`.
- Test Zustand stores.
- Đặt tests tại `frontend/src/__tests__/`.

---

## 12. DEVELOPMENT RULES FOR AI CODER

- **Error Handling:** Bọc toàn bộ các route FastAPI bằng `try-except`. Trả về `HTTPException` theo Error Schema chuẩn tại Mục 8.
- **Type Hinting:** Bắt buộc sử dụng Type Hints cho 100% Python code và Pydantic schemas cho request/response validation. Trong Next.js, sử dụng TypeScript Interfaces.
- **Environment Variables:** Không hardcode API Keys, DB URLs. Đọc từ file `.env` sử dụng `pydantic-settings`. Không commit `.env` lên git (thêm vào `.gitignore`, chỉ commit `.env.example`).
- **CORS:** Cấu hình CORS middleware trong FastAPI, whitelist chỉ `FRONTEND_URL` từ env.
- **Clean Code:** Tách logic Database query ra khỏi Router. Đặt vào layer `services/`. Router chỉ nhận/trả request, gọi service.
- **Async:** Mọi DB query trong FastAPI phải dùng `async with AsyncSession`. Mọi endpoint đều là `async def`.
- **No Magic Numbers:** Các constant (max file size, token expiry, SM-2 thresholds) phải được define tại `core/config.py`, không viết thẳng vào logic.
