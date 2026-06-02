"""add MVP document metadata and flashcard tags

Revision ID: 20260518_0002
Revises: 20260518_0001
Create Date: 2026-05-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260518_0002"
down_revision: Union[str, None] = "20260518_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("original_filename", sa.String(length=255), nullable=True))
    op.add_column("documents", sa.Column("file_type", sa.String(length=20), nullable=True))
    op.add_column("documents", sa.Column("file_size", sa.Integer(), nullable=True))
    op.add_column("flashcards", sa.Column("tag", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("flashcards", "tag")
    op.drop_column("documents", "file_size")
    op.drop_column("documents", "file_type")
    op.drop_column("documents", "original_filename")
