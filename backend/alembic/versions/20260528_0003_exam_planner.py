"""exam planner domain

Revision ID: 20260528_0003
Revises: 20260518_0002
Create Date: 2026-05-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260528_0003"
down_revision: Union[str, None] = "20260518_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    question_type = sa.Enum("MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER", name="question_type", native_enum=False)
    question_difficulty = sa.Enum("EASY", "MEDIUM", "HARD", name="question_difficulty", native_enum=False)
    quiz_mode = sa.Enum("PRACTICE", "EXAM", name="quiz_mode", native_enum=False)
    goal_status = sa.Enum("ACTIVE", "COMPLETED", "PAUSED", name="goal_status", native_enum=False)

    op.create_table(
        "subjects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=True),
        sa.Column("teacher_name", sa.String(length=255), nullable=True),
        sa.Column("exam_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("target_score", sa.Float(), nullable=True),
        sa.Column("color", sa.String(length=20), nullable=False, server_default="#2563eb"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_subject_user_name"),
    )
    op.create_index("idx_subject_user_id", "subjects", ["user_id"], unique=False)

    op.create_table(
        "chapters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subject_id", "title", name="uq_chapter_subject_title"),
    )
    op.create_index("idx_chapter_subject_id", "chapters", ["subject_id"], unique=False)

    op.add_column("flashcards", sa.Column("subject_id", sa.Integer(), nullable=True))
    op.add_column("flashcards", sa.Column("chapter_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_flashcard_subject_id", "flashcards", "subjects", ["subject_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_flashcard_chapter_id", "flashcards", "chapters", ["chapter_id"], ["id"], ondelete="SET NULL")
    op.create_index("idx_flashcard_subject_id", "flashcards", ["subject_id"], unique=False)
    op.create_index("idx_flashcard_chapter_id", "flashcards", ["chapter_id"], unique=False)

    op.create_table(
        "question_bank",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("chapter_id", sa.Integer(), nullable=True),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("question_type", question_type, nullable=False),
        sa.Column("options", sa.Text(), nullable=True),
        sa.Column("correct_answer", sa.Text(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("difficulty", question_difficulty, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_question_bank_user_id", "question_bank", ["user_id"], unique=False)
    op.create_index("idx_question_bank_subject_id", "question_bank", ["subject_id"], unique=False)
    op.create_index("idx_question_bank_chapter_id", "question_bank", ["chapter_id"], unique=False)
    op.create_index("idx_question_bank_difficulty", "question_bank", ["difficulty"], unique=False)

    op.create_table(
        "quiz_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=True),
        sa.Column("chapter_id", sa.Integer(), nullable=True),
        sa.Column("mode", quiz_mode, nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("correct_count", sa.Integer(), nullable=False),
        sa.Column("wrong_count", sa.Integer(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_quiz_attempt_user_id", "quiz_attempts", ["user_id"], unique=False)
    op.create_index("idx_quiz_attempt_subject_id", "quiz_attempts", ["subject_id"], unique=False)
    op.create_index("idx_quiz_attempt_chapter_id", "quiz_attempts", ["chapter_id"], unique=False)

    op.create_table(
        "quiz_answers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("attempt_id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("selected_answer", sa.Text(), nullable=True),
        sa.Column("correct_answer", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["attempt_id"], ["quiz_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["question_bank.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_quiz_answer_attempt_id", "quiz_answers", ["attempt_id"], unique=False)
    op.create_index("idx_quiz_answer_user_id", "quiz_answers", ["user_id"], unique=False)
    op.create_index("idx_quiz_answer_question_id", "quiz_answers", ["question_id"], unique=False)

    op.create_table(
        "mistake_notebook",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("selected_answer", sa.Text(), nullable=True),
        sa.Column("correct_answer", sa.Text(), nullable=False),
        sa.Column("mistake_count", sa.Integer(), nullable=False),
        sa.Column("correct_streak", sa.Integer(), nullable=False),
        sa.Column("last_mistake_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["question_id"], ["question_bank.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "question_id", name="uq_mistake_user_question"),
    )
    op.create_index("idx_mistake_user_id", "mistake_notebook", ["user_id"], unique=False)
    op.create_index("idx_mistake_question_id", "mistake_notebook", ["question_id"], unique=False)
    op.create_index("idx_mistake_resolved_at", "mistake_notebook", ["resolved_at"], unique=False)

    op.create_table(
        "study_goals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("target_minutes", sa.Integer(), nullable=False),
        sa.Column("completed_minutes", sa.Integer(), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", goal_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_study_goal_user_id", "study_goals", ["user_id"], unique=False)
    op.create_index("idx_study_goal_subject_id", "study_goals", ["subject_id"], unique=False)

    op.create_table(
        "study_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=True),
        sa.Column("chapter_id", sa.Integer(), nullable=True),
        sa.Column("goal_id", sa.Integer(), nullable=True),
        sa.Column("minutes", sa.Integer(), nullable=False),
        sa.Column("activity_type", sa.String(length=50), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("studied_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["goal_id"], ["study_goals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_study_session_user_id", "study_sessions", ["user_id"], unique=False)
    op.create_index("idx_study_session_subject_id", "study_sessions", ["subject_id"], unique=False)
    op.create_index("idx_study_session_studied_at", "study_sessions", ["studied_at"], unique=False)

    op.create_table(
        "user_stats",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("current_streak", sa.Integer(), nullable=False),
        sa.Column("longest_streak", sa.Integer(), nullable=False),
        sa.Column("total_study_minutes", sa.Integer(), nullable=False),
        sa.Column("last_study_date", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "exam_papers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("question_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_exam_paper_user_id", "exam_papers", ["user_id"], unique=False)
    op.create_index("idx_exam_paper_subject_id", "exam_papers", ["subject_id"], unique=False)

    op.create_table(
        "exam_paper_questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("exam_paper_id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["exam_paper_id"], ["exam_papers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["question_bank.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("exam_paper_id", "question_id", name="uq_exam_paper_question"),
    )
    op.create_index("idx_exam_paper_question_paper_id", "exam_paper_questions", ["exam_paper_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_exam_paper_question_paper_id", table_name="exam_paper_questions")
    op.drop_table("exam_paper_questions")
    op.drop_index("idx_exam_paper_subject_id", table_name="exam_papers")
    op.drop_index("idx_exam_paper_user_id", table_name="exam_papers")
    op.drop_table("exam_papers")
    op.drop_table("user_stats")
    op.drop_index("idx_study_session_studied_at", table_name="study_sessions")
    op.drop_index("idx_study_session_subject_id", table_name="study_sessions")
    op.drop_index("idx_study_session_user_id", table_name="study_sessions")
    op.drop_table("study_sessions")
    op.drop_index("idx_study_goal_subject_id", table_name="study_goals")
    op.drop_index("idx_study_goal_user_id", table_name="study_goals")
    op.drop_table("study_goals")
    op.drop_index("idx_mistake_resolved_at", table_name="mistake_notebook")
    op.drop_index("idx_mistake_question_id", table_name="mistake_notebook")
    op.drop_index("idx_mistake_user_id", table_name="mistake_notebook")
    op.drop_table("mistake_notebook")
    op.drop_index("idx_quiz_answer_question_id", table_name="quiz_answers")
    op.drop_index("idx_quiz_answer_user_id", table_name="quiz_answers")
    op.drop_index("idx_quiz_answer_attempt_id", table_name="quiz_answers")
    op.drop_table("quiz_answers")
    op.drop_index("idx_quiz_attempt_chapter_id", table_name="quiz_attempts")
    op.drop_index("idx_quiz_attempt_subject_id", table_name="quiz_attempts")
    op.drop_index("idx_quiz_attempt_user_id", table_name="quiz_attempts")
    op.drop_table("quiz_attempts")
    op.drop_index("idx_question_bank_difficulty", table_name="question_bank")
    op.drop_index("idx_question_bank_chapter_id", table_name="question_bank")
    op.drop_index("idx_question_bank_subject_id", table_name="question_bank")
    op.drop_index("idx_question_bank_user_id", table_name="question_bank")
    op.drop_table("question_bank")
    op.drop_index("idx_flashcard_chapter_id", table_name="flashcards")
    op.drop_index("idx_flashcard_subject_id", table_name="flashcards")
    op.drop_constraint("fk_flashcard_chapter_id", "flashcards", type_="foreignkey")
    op.drop_constraint("fk_flashcard_subject_id", "flashcards", type_="foreignkey")
    op.drop_column("flashcards", "chapter_id")
    op.drop_column("flashcards", "subject_id")
    op.drop_index("idx_chapter_subject_id", table_name="chapters")
    op.drop_table("chapters")
    op.drop_index("idx_subject_user_id", table_name="subjects")
    op.drop_table("subjects")
