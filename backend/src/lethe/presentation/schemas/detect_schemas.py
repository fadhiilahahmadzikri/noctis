"""Pydantic schemas for detection endpoints."""

from pydantic import BaseModel, Field

from lethe.shared.types import DetectionMode


class DetectionConfigSchema(BaseModel):
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    min_silence_duration_ms: int = Field(default=1000, ge=100)
    speech_pad_ms: int = Field(default=200, ge=0)


class DetectRequest(BaseModel):
    mode: DetectionMode = "auto"
    config: DetectionConfigSchema = DetectionConfigSchema()


class JobResponse(BaseModel):
    job_id: str
    status: str
