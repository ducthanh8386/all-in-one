"""Exam Planner API endpoints."""

from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.models import Chapter, MistakeNotebook, QuestionBank, QuestionDifficulty, Subject, User
from app.db.session import get_db
from app.schemas.exam_planner import (
    AnalyticsDashboard,
    ChapterCreate,
    ChapterResponse,
    ChapterUpdate,
    ExamPaperCreate,
    ExamPaperResponse,
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    PlannerResponse,
    QuestionCreate,
    QuestionResponse,
    QuestionUpdate,
    QuizStartRequest,
    QuizStartResponse,
    QuizSubmitRequest,
    QuizSubmitResponse,
    StudyGoalCreate,
    StudyGoalResponse,
    StudySessionCreate,
    StudySessionResponse,
    SubjectCreate,
    SubjectResponse,
    SubjectUpdate,
)
from app.services import exam_planner_service as svc

router = APIRouter(tags=["exam-planner"])


def _error(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(status_code=http_status, detail={"error": {"code": code, "message": message, "details": None}})


async def _subject(db: AsyncSession, user: User, subject_id: int) -> Subject:
    subject = await svc.get_subject_or_none(db, user.id, subject_id)
    if not subject:
        raise _error("SUBJECT_NOT_FOUND", "Subject not found.", 404)
    return subject


async def _chapter(db: AsyncSession, user: User, chapter_id: int) -> Chapter:
    chapter = await svc.get_chapter_or_none(db, user.id, chapter_id)
    if not chapter:
        raise _error("CHAPTER_NOT_FOUND", "Chapter not found.", 404)
    return chapter


def _question_response(question: QuestionBank) -> dict:
    return svc.question_to_response(question)


@router.get("/subjects", response_model=list[SubjectResponse])
async def list_subjects(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await svc.list_subjects_with_counts(db, current_user.id)


@router.post("/subjects", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(payload: SubjectCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    subject = Subject(user_id=current_user.id, **payload.model_dump())
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return {**subject.__dict__, "chapter_count": 0, "flashcard_count": 0, "question_count": 0}


@router.get("/subjects/{subject_id}", response_model=SubjectResponse)
async def get_subject(subject_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    subject = await _subject(db, current_user, subject_id)
    for item in await svc.list_subjects_with_counts(db, current_user.id):
        if item["id"] == subject.id:
            return item
    return subject


@router.put("/subjects/{subject_id}", response_model=SubjectResponse)
async def update_subject(subject_id: int, payload: SubjectUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    subject = await _subject(db, current_user, subject_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(subject, key, value)
    await db.commit()
    await db.refresh(subject)
    return {**subject.__dict__, "chapter_count": 0, "flashcard_count": 0, "question_count": 0}


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(subject_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    subject = await _subject(db, current_user, subject_id)
    await db.delete(subject)
    await db.commit()


@router.get("/subjects/{subject_id}/chapters", response_model=list[ChapterResponse])
async def list_chapters(subject_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await svc.chapters_with_counts(db, current_user.id, subject_id)


@router.post("/subjects/{subject_id}/chapters", response_model=ChapterResponse, status_code=status.HTTP_201_CREATED)
async def create_chapter(subject_id: int, payload: ChapterCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _subject(db, current_user, subject_id)
    chapter = Chapter(subject_id=subject_id, **payload.model_dump())
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    return {**chapter.__dict__, "flashcard_count": 0, "question_count": 0}


@router.put("/chapters/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(chapter_id: int, payload: ChapterUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    chapter = await _chapter(db, current_user, chapter_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(chapter, key, value)
    await db.commit()
    await db.refresh(chapter)
    return {**chapter.__dict__, "flashcard_count": 0, "question_count": 0}


@router.delete("/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chapter(chapter_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    chapter = await _chapter(db, current_user, chapter_id)
    await db.delete(chapter)
    await db.commit()


@router.get("/questions", response_model=list[QuestionResponse])
async def list_questions(
    subject_id: Optional[int] = Query(None),
    chapter_id: Optional[int] = Query(None),
    difficulty: Optional[QuestionDifficulty] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    questions = await svc.list_questions(db, current_user.id, subject_id, chapter_id, difficulty)
    return [_question_response(q) for q in questions]


@router.post("/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(payload: QuestionCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await svc.assert_subject_chapter(db, current_user.id, payload.subject_id, payload.chapter_id)
    except ValueError:
        raise _error("SUBJECT_OR_CHAPTER_NOT_FOUND", "Subject or chapter not found.", 404)
    question = QuestionBank(
        user_id=current_user.id,
        subject_id=payload.subject_id,
        chapter_id=payload.chapter_id,
        question_text=payload.question_text,
        question_type=payload.question_type,
        options=svc.encode_options(payload.options),
        correct_answer=payload.correct_answer,
        explanation=payload.explanation,
        difficulty=payload.difficulty,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return _question_response(question)


@router.put("/questions/{question_id}", response_model=QuestionResponse)
async def update_question(question_id: int, payload: QuestionUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    question = (await db.execute(select(QuestionBank).where(QuestionBank.id == question_id, QuestionBank.user_id == current_user.id))).scalars().first()
    if not question:
        raise _error("QUESTION_NOT_FOUND", "Question not found.", 404)
    data = payload.model_dump(exclude_unset=True)
    if "subject_id" in data or "chapter_id" in data:
        try:
            await svc.assert_subject_chapter(db, current_user.id, data.get("subject_id", question.subject_id), data.get("chapter_id", question.chapter_id))
        except ValueError:
            raise _error("SUBJECT_OR_CHAPTER_NOT_FOUND", "Subject or chapter not found.", 404)
    for key, value in data.items():
        setattr(question, "options" if key == "options" else key, svc.encode_options(value) if key == "options" else value)
    await db.commit()
    await db.refresh(question)
    return _question_response(question)


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(question_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    question = (await db.execute(select(QuestionBank).where(QuestionBank.id == question_id, QuestionBank.user_id == current_user.id))).scalars().first()
    if not question:
        raise _error("QUESTION_NOT_FOUND", "Question not found.", 404)
    await db.delete(question)
    await db.commit()


@router.post("/imports/{import_type}/preview", response_model=ImportPreviewResponse)
async def preview_import(import_type: str, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if import_type not in {"flashcards", "questions"}:
        raise _error("INVALID_IMPORT_TYPE", "Use flashcards or questions.", 400)
    try:
        rows = await svc.parse_upload(file.filename or "", await file.read())
        preview = await svc.validate_import_rows(db, current_user.id, import_type, rows)
    except UnicodeDecodeError:
        raise _error("INVALID_FILE_ENCODING", "CSV must be UTF-8 encoded.", 400)
    except RuntimeError as exc:
        raise _error(str(exc), "Invalid or unsupported import file.", 400)
    return {"import_type": import_type, "valid_count": sum(1 for r in preview if not r["errors"]), "invalid_count": sum(1 for r in preview if r["errors"]), "rows": preview}


@router.post("/imports/{import_type}/commit", response_model=ImportCommitResponse)
async def commit_import(import_type: str, payload: ImportCommitRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if import_type not in {"flashcards", "questions"}:
        raise _error("INVALID_IMPORT_TYPE", "Use flashcards or questions.", 400)
    created, errors = await svc.commit_import(db, current_user.id, import_type, payload.rows)
    return {"created": created, "skipped": len(payload.rows) - created, "errors": errors}


@router.post("/quiz/start", response_model=QuizStartResponse)
async def start_quiz(payload: QuizStartRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    questions = await svc.build_question_quiz(db, current_user.id, payload.subject_id, payload.chapter_id, payload.difficulty, payload.limit, payload.exam_paper_id)
    return {"questions": [_question_response(q) for q in questions]}


@router.post("/quiz/submit", response_model=QuizSubmitResponse)
async def submit_quiz(payload: QuizSubmitRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    attempt, results = await svc.submit_quiz(db, current_user.id, payload.subject_id, payload.chapter_id, payload.mode, payload.duration_seconds, payload.answers)
    return {"attempt_id": attempt.id, "score": attempt.score, "correct_count": attempt.correct_count, "wrong_count": attempt.wrong_count, "total_questions": attempt.total_questions, "answers": results}


@router.get("/mistakes")
async def list_mistakes(subject_id: Optional[int] = Query(None), chapter_id: Optional[int] = Query(None), unresolved_only: bool = Query(True), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(MistakeNotebook, QuestionBank).join(QuestionBank, QuestionBank.id == MistakeNotebook.question_id).where(MistakeNotebook.user_id == current_user.id)
    if subject_id:
        query = query.where(QuestionBank.subject_id == subject_id)
    if chapter_id:
        query = query.where(QuestionBank.chapter_id == chapter_id)
    if unresolved_only:
        query = query.where(MistakeNotebook.resolved_at.is_(None))
    rows = (await db.execute(query.order_by(MistakeNotebook.last_mistake_at.desc()))).all()
    return [
        {
            "id": m.id,
            "question_id": m.question_id,
            "selected_answer": m.selected_answer,
            "correct_answer": m.correct_answer,
            "mistake_count": m.mistake_count,
            "correct_streak": m.correct_streak,
            "last_mistake_at": m.last_mistake_at,
            "resolved_at": m.resolved_at,
            "question": _question_response(q),
        }
        for m, q in rows
    ]


@router.get("/mistakes/practice", response_model=QuizStartResponse)
async def practice_mistakes(subject_id: Optional[int] = Query(None), chapter_id: Optional[int] = Query(None), limit: int = Query(20, ge=1, le=100), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(QuestionBank).join(MistakeNotebook, MistakeNotebook.question_id == QuestionBank.id).where(MistakeNotebook.user_id == current_user.id, MistakeNotebook.resolved_at.is_(None))
    if subject_id:
        query = query.where(QuestionBank.subject_id == subject_id)
    if chapter_id:
        query = query.where(QuestionBank.chapter_id == chapter_id)
    questions = list((await db.execute(query.limit(limit))).scalars().all())
    return {"questions": [_question_response(q) for q in questions]}


@router.get("/analytics/dashboard", response_model=AnalyticsDashboard)
async def analytics_dashboard(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await svc.dashboard(db, current_user.id)


@router.get("/planner", response_model=PlannerResponse)
async def planner(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    goals = list((await db.execute(select(svc.StudyGoal).where(svc.StudyGoal.user_id == current_user.id).order_by(svc.StudyGoal.created_at.desc()))).scalars().all())
    sessions = list((await db.execute(select(svc.StudySession).where(svc.StudySession.user_id == current_user.id).order_by(svc.StudySession.studied_at.desc()).limit(50))).scalars().all())
    stats = await db.get(svc.UserStats, current_user.id)
    stats_payload = {
        "current_streak": stats.current_streak if stats else 0,
        "longest_streak": stats.longest_streak if stats else 0,
        "total_study_minutes": stats.total_study_minutes if stats else 0,
        "last_study_date": stats.last_study_date if stats else None,
    }
    return {"goals": goals, "sessions": sessions, "stats": stats_payload}


@router.post("/planner/goals", response_model=StudyGoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(payload: StudyGoalCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _subject(db, current_user, payload.subject_id)
    goal = svc.StudyGoal(user_id=current_user.id, **payload.model_dump())
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.post("/planner/sessions", response_model=StudySessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(payload: StudySessionCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await svc.record_study_session(db, current_user.id, payload)


@router.post("/exam-papers", response_model=ExamPaperResponse, status_code=status.HTTP_201_CREATED)
async def create_exam_paper(payload: ExamPaperCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    paper, questions = await svc.create_exam_paper(db, current_user.id, payload)
    return {**paper.__dict__, "questions": [_question_response(q) for q in questions]}


@router.get("/exam-papers/{paper_id}", response_model=ExamPaperResponse)
async def get_exam_paper(paper_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    paper, questions = await svc.exam_paper_questions(db, current_user.id, paper_id)
    if not paper:
        raise _error("EXAM_PAPER_NOT_FOUND", "Exam paper not found.", 404)
    return {**paper.__dict__, "questions": [_question_response(q) for q in questions]}


@router.get("/exam-papers/{paper_id}/pdf")
async def export_exam_pdf(paper_id: int, with_answers: bool = Query(False), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    paper, questions = await svc.exam_paper_questions(db, current_user.id, paper_id)
    if not paper:
        raise _error("EXAM_PAPER_NOT_FOUND", "Exam paper not found.", 404)
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError:
        raise _error("PDF_SUPPORT_NOT_INSTALLED", "Install reportlab to export PDF.", 501)
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 50
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(50, y, paper.title)
    y -= 30
    pdf.setFont("Helvetica", 10)
    pdf.drawString(50, y, f"Duration: {paper.duration_minutes} minutes | Questions: {paper.question_count}")
    y -= 30
    for index, question in enumerate(questions, start=1):
        if y < 90:
            pdf.showPage()
            y = height - 50
        pdf.drawString(50, y, f"{index}. {question.question_text[:110]}")
        y -= 16
        for option in svc.decode_options(question.options):
            pdf.drawString(70, y, f"- {option[:100]}")
            y -= 14
        if with_answers:
            pdf.drawString(70, y, f"Answer: {question.correct_answer[:100]}")
            y -= 14
        y -= 8
    pdf.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="exam-paper-{paper.id}.pdf"'})


@router.get("/analytics/progress-report.pdf")
async def export_progress_pdf(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = await svc.dashboard(db, current_user.id)
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError:
        raise _error("PDF_SUPPORT_NOT_INSTALLED", "Install reportlab to export PDF.", 501)
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    y = A4[1] - 50
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(50, y, "Brain-Sync Progress Report")
    y -= 35
    pdf.setFont("Helvetica", 11)
    for label, value in [
        ("Due flashcards", data["due_flashcards"]),
        ("Open mistakes", data["mistake_count"]),
        ("Study minutes this week", data["study_time_this_week"]),
        ("Current streak", data["current_streak"]),
    ]:
        pdf.drawString(50, y, f"{label}: {value}")
        y -= 20
    y -= 10
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(50, y, "Recommendations")
    y -= 20
    pdf.setFont("Helvetica", 10)
    for item in data["recommendations"] or ["No weak chapter recommendation yet."]:
        pdf.drawString(60, y, f"- {item[:95]}")
        y -= 16
    pdf.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="progress-report.pdf"'})
