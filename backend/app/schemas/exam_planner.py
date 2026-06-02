"""Schemas for Brain-Sync Exam Planner."""

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.db.models import GoalStatus, QuestionDifficulty, QuestionType, QuizMode


class SubjectBase(BaseModel):
    name: str
    code: Optional[str] = None
    teacher_name: Optional[str] = None
    exam_date: Optional[datetime] = None
    target_score: Optional[float] = Field(default=None, ge=0, le=10)
    color: str = "#2563eb"
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Subject name is required.")
        return value.strip()


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    teacher_name: Optional[str] = None
    exam_date: Optional[datetime] = None
    target_score: Optional[float] = Field(default=None, ge=0, le=10)
    color: Optional[str] = None
    description: Optional[str] = None


class SubjectResponse(SubjectBase):
    id: int
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    chapter_count: int = 0
    flashcard_count: int = 0
    question_count: int = 0

    model_config = {"from_attributes": True}


class ChapterBase(BaseModel):
    title: str
    description: Optional[str] = None
    order_index: int = 0

    @field_validator("title")
    @classmethod
    def title_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Chapter title is required.")
        return value.strip()


class ChapterCreate(ChapterBase):
    pass


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None


class ChapterResponse(ChapterBase):
    id: int
    subject_id: int
    created_at: datetime
    flashcard_count: int = 0
    question_count: int = 0

    model_config = {"from_attributes": True}


class QuestionBase(BaseModel):
    subject_id: int
    chapter_id: Optional[int] = None
    question_text: str
    question_type: QuestionType = QuestionType.MULTIPLE_CHOICE
    options: list[str] = Field(default_factory=list)
    correct_answer: str
    explanation: Optional[str] = None
    difficulty: QuestionDifficulty = QuestionDifficulty.MEDIUM

    @field_validator("question_text", "correct_answer")
    @classmethod
    def required_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Required text field is empty.")
        return value.strip()


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    subject_id: Optional[int] = None
    chapter_id: Optional[int] = None
    question_text: Optional[str] = None
    question_type: Optional[QuestionType] = None
    options: Optional[list[str]] = None
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None
    difficulty: Optional[QuestionDifficulty] = None


class QuestionResponse(QuestionBase):
    id: int
    user_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class ImportErrorRow(BaseModel):
    row: int
    field: Optional[str] = None
    message: str


class ImportPreviewRow(BaseModel):
    row: int
    data: dict
    errors: list[ImportErrorRow] = Field(default_factory=list)


class ImportPreviewResponse(BaseModel):
    import_type: str
    valid_count: int
    invalid_count: int
    rows: list[ImportPreviewRow]


class ImportCommitRequest(BaseModel):
    rows: list[dict]


class ImportCommitResponse(BaseModel):
    created: int
    skipped: int
    errors: list[ImportErrorRow] = Field(default_factory=list)


class QuizStartRequest(BaseModel):
    subject_id: Optional[int] = None
    chapter_id: Optional[int] = None
    difficulty: Optional[QuestionDifficulty] = None
    mode: QuizMode = QuizMode.PRACTICE
    limit: int = Field(default=10, ge=1, le=100)
    exam_paper_id: Optional[int] = None


class QuizStartResponse(BaseModel):
    questions: list[QuestionResponse]


class QuizSubmitAnswer(BaseModel):
    question_id: int
    selected_answer: Optional[str] = None


class QuizSubmitRequest(BaseModel):
    subject_id: Optional[int] = None
    chapter_id: Optional[int] = None
    mode: QuizMode = QuizMode.PRACTICE
    duration_seconds: Optional[int] = None
    answers: list[QuizSubmitAnswer]


class QuizAnswerResult(BaseModel):
    question_id: int
    selected_answer: Optional[str]
    correct_answer: str
    is_correct: bool
    explanation: Optional[str] = None


class QuizSubmitResponse(BaseModel):
    attempt_id: int
    score: float
    correct_count: int
    wrong_count: int
    total_questions: int
    answers: list[QuizAnswerResult]


class MistakeResponse(BaseModel):
    id: int
    question_id: int
    selected_answer: Optional[str]
    correct_answer: str
    mistake_count: int
    correct_streak: int
    last_mistake_at: datetime
    resolved_at: Optional[datetime]
    question: QuestionResponse


class AnalyticsDashboard(BaseModel):
    due_flashcards: int
    exam_countdown: list[dict]
    current_streak: int
    longest_streak: int
    weak_chapters: list[dict]
    mistake_count: int
    study_time_this_week: int
    goal_progress: list[dict]
    recommendations: list[str]
    subject_accuracy: list[dict]


class StudyGoalCreate(BaseModel):
    subject_id: int
    title: str
    target_minutes: int = Field(ge=1)
    deadline: Optional[datetime] = None


class StudyGoalResponse(BaseModel):
    id: int
    user_id: uuid.UUID
    subject_id: int
    title: str
    target_minutes: int
    completed_minutes: int
    deadline: Optional[datetime]
    status: GoalStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class StudySessionCreate(BaseModel):
    subject_id: Optional[int] = None
    chapter_id: Optional[int] = None
    goal_id: Optional[int] = None
    minutes: int = Field(ge=1, le=600)
    activity_type: str = "POMODORO"
    notes: Optional[str] = None


class StudySessionResponse(BaseModel):
    id: int
    user_id: uuid.UUID
    subject_id: Optional[int]
    chapter_id: Optional[int]
    goal_id: Optional[int]
    minutes: int
    activity_type: str
    notes: Optional[str]
    studied_at: datetime

    model_config = {"from_attributes": True}


class PlannerResponse(BaseModel):
    goals: list[StudyGoalResponse]
    sessions: list[StudySessionResponse]
    stats: dict


class ExamPaperCreate(BaseModel):
    subject_id: int
    title: str = "Practice Exam"
    duration_minutes: int = Field(ge=1, le=600)
    question_count: int = Field(ge=1, le=200)
    chapter_ids: list[int] = Field(default_factory=list)
    difficulty_mix: dict[str, int] = Field(default_factory=dict)


class ExamPaperResponse(BaseModel):
    id: int
    user_id: uuid.UUID
    subject_id: int
    title: str
    duration_minutes: int
    question_count: int
    created_at: datetime
    questions: list[QuestionResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}
