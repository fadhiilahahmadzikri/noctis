"""Pydantic schemas for progress WebSocket messages."""

from pydantic import BaseModel


class ProgressEventMessage(BaseModel):
    percent: float
    message: str
    current_ms: int = 0
    is_complete: bool = False
    error: str | None = None
