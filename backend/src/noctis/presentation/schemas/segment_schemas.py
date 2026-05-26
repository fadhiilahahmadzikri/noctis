"""Pydantic schemas for segment endpoints."""

from pydantic import BaseModel


class SegmentResponse(BaseModel):
    id: str
    start_ms: int
    end_ms: int
    type: str
    is_removed: bool


class SegmentsListResponse(BaseModel):
    segments: list[SegmentResponse]


class ToggleSegmentRequest(BaseModel):
    is_removed: bool
