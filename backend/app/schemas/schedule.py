"""
Schedule schemas.
TODO: Implement in Phase 4
"""

from pydantic import BaseModel


class ScheduleResponse(BaseModel):
    id: int
    title: str
    start_time: str
    end_time: str

    class Config:
        from_attributes = True
