"""Pydantic schemas for project endpoints."""

from pydantic import BaseModel


class LoadProjectRequest(BaseModel):
    video_path: str


class ProjectResponse(BaseModel):
    project_id: str
    duration_ms: int
    video_path: str
