"""Quiz practice schemas."""

from pydantic import BaseModel


class QuizQuestion(BaseModel):
    card_id: int
    question: str
    options: list[str]
    correct_option_index: int


class QuizResponse(BaseModel):
    questions: list[QuizQuestion]
