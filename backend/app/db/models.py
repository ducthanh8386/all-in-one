"""
SQLAlchemy models for all database tables.
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, DateTime,
    Date, ForeignKey, Enum, Index, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base
import enum

Base = declarative_base()


class UserRole(str, enum.Enum):
    """User role enumeration"""
    USER = "USER"
    MODERATOR = "MODERATOR"
    ADMIN = "ADMIN"


class DocumentStatus(str, enum.Enum):
    """Document processing status"""
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class QuestionType(str, enum.Enum):
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    TRUE_FALSE = "TRUE_FALSE"
    SHORT_ANSWER = "SHORT_ANSWER"


class QuestionDifficulty(str, enum.Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


class QuizMode(str, enum.Enum):
    PRACTICE = "PRACTICE"
    EXAM = "EXAM"


class GoalStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    PAUSED = "PAUSED"


class User(Base):
    """User model"""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, name="user_role", native_enum=False), default=UserRole.USER, nullable=False)
    ai_quota = Column(Integer, default=100, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class RefreshToken(Base):
    """Refresh token model"""
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(512), unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_refresh_token_user_id", "user_id"),
        Index("idx_refresh_token_token", "token"),
    )


class Document(Base):
    """Document model"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=True)
    file_type = Column(String(20), nullable=True)
    file_size = Column(Integer, nullable=True)
    file_path = Column(String(512), nullable=True)
    status = Column(Enum(DocumentStatus, name="doc_status", native_enum=False), default=DocumentStatus.PENDING, nullable=False)
    vector_collection_name = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_document_user_id", "user_id"),
        Index("idx_document_status", "status"),
    )


class Flashcard(Base):
    """Flashcard model with SM-2 algorithm fields"""
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True)
    doc_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    front_text = Column(Text, nullable=False)
    back_text = Column(Text, nullable=False)
    tag = Column(String(100), nullable=True)
    
    # SM-2 Algorithm fields
    repetition_count = Column(Integer, default=0, nullable=False)
    ease_factor = Column(Float, default=2.5, nullable=False)
    interval_days = Column(Integer, default=0, nullable=False)
    next_review_date = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_flashcard_user_id", "user_id"),
        Index("idx_flashcard_doc_id", "doc_id"),
        Index("idx_flashcard_subject_id", "subject_id"),
        Index("idx_flashcard_chapter_id", "chapter_id"),
        Index("idx_flashcard_next_review_date", "next_review_date"),
    )


class Subject(Base):
    """A user-owned exam subject."""
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=True)
    teacher_name = Column(String(255), nullable=True)
    exam_date = Column(DateTime(timezone=True), nullable=True)
    target_score = Column(Float, nullable=True)
    color = Column(String(20), default="#2563eb", nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_subject_user_id", "user_id"),
        UniqueConstraint("user_id", "name", name="uq_subject_user_name"),
    )


class Chapter(Base):
    """A chapter inside a subject."""
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    order_index = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_chapter_subject_id", "subject_id"),
        UniqueConstraint("subject_id", "title", name="uq_chapter_subject_title"),
    )


class QuestionBank(Base):
    """User-owned question bank item."""
    __tablename__ = "question_bank"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    question_text = Column(Text, nullable=False)
    question_type = Column(Enum(QuestionType, name="question_type", native_enum=False), default=QuestionType.MULTIPLE_CHOICE, nullable=False)
    options = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    difficulty = Column(Enum(QuestionDifficulty, name="question_difficulty", native_enum=False), default=QuestionDifficulty.MEDIUM, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_question_bank_user_id", "user_id"),
        Index("idx_question_bank_subject_id", "subject_id"),
        Index("idx_question_bank_chapter_id", "chapter_id"),
        Index("idx_question_bank_difficulty", "difficulty"),
    )


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    mode = Column(Enum(QuizMode, name="quiz_mode", native_enum=False), default=QuizMode.PRACTICE, nullable=False)
    score = Column(Float, default=0, nullable=False)
    correct_count = Column(Integer, default=0, nullable=False)
    wrong_count = Column(Integer, default=0, nullable=False)
    total_questions = Column(Integer, default=0, nullable=False)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_quiz_attempt_user_id", "user_id"),
        Index("idx_quiz_attempt_subject_id", "subject_id"),
        Index("idx_quiz_attempt_chapter_id", "chapter_id"),
    )


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id = Column(Integer, primary_key=True)
    attempt_id = Column(Integer, ForeignKey("quiz_attempts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("question_bank.id", ondelete="CASCADE"), nullable=False)
    selected_answer = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)
    answered_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_quiz_answer_attempt_id", "attempt_id"),
        Index("idx_quiz_answer_user_id", "user_id"),
        Index("idx_quiz_answer_question_id", "question_id"),
    )


class MistakeNotebook(Base):
    __tablename__ = "mistake_notebook"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("question_bank.id", ondelete="CASCADE"), nullable=False)
    selected_answer = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=False)
    mistake_count = Column(Integer, default=1, nullable=False)
    correct_streak = Column(Integer, default=0, nullable=False)
    last_mistake_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_mistake_user_question"),
        Index("idx_mistake_user_id", "user_id"),
        Index("idx_mistake_question_id", "question_id"),
        Index("idx_mistake_resolved_at", "resolved_at"),
    )


class StudyGoal(Base):
    __tablename__ = "study_goals"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    target_minutes = Column(Integer, default=0, nullable=False)
    completed_minutes = Column(Integer, default=0, nullable=False)
    deadline = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(GoalStatus, name="goal_status", native_enum=False), default=GoalStatus.ACTIVE, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_study_goal_user_id", "user_id"),
        Index("idx_study_goal_subject_id", "subject_id"),
    )


class StudySession(Base):
    __tablename__ = "study_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    goal_id = Column(Integer, ForeignKey("study_goals.id", ondelete="SET NULL"), nullable=True)
    minutes = Column(Integer, nullable=False)
    activity_type = Column(String(50), default="POMODORO", nullable=False)
    notes = Column(Text, nullable=True)
    studied_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_study_session_user_id", "user_id"),
        Index("idx_study_session_subject_id", "subject_id"),
        Index("idx_study_session_studied_at", "studied_at"),
    )


class UserStats(Base):
    __tablename__ = "user_stats"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    current_streak = Column(Integer, default=0, nullable=False)
    longest_streak = Column(Integer, default=0, nullable=False)
    total_study_minutes = Column(Integer, default=0, nullable=False)
    last_study_date = Column(Date, nullable=True)


class ExamPaper(Base):
    __tablename__ = "exam_papers"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    question_count = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_exam_paper_user_id", "user_id"),
        Index("idx_exam_paper_subject_id", "subject_id"),
    )


class ExamPaperQuestion(Base):
    __tablename__ = "exam_paper_questions"

    id = Column(Integer, primary_key=True)
    exam_paper_id = Column(Integer, ForeignKey("exam_papers.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("question_bank.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("exam_paper_id", "question_id", name="uq_exam_paper_question"),
        Index("idx_exam_paper_question_paper_id", "exam_paper_id"),
    )


class Schedule(Base):
    """Schedule model"""
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    is_recurring = Column(Boolean, default=False, nullable=False)
    recurrence_rule = Column(String(100), nullable=True)
    reference_doc_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_schedule_user_id", "user_id"),
        Index("idx_schedule_start_time", "start_time"),
        Index("idx_schedule_end_time", "end_time"),
    )
