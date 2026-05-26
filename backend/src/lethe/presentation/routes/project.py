"""Project management endpoints."""

import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from lethe.infrastructure.di.container import container
from lethe.domain.entities.video_project import VideoProject
from lethe.presentation.schemas.project_schemas import LoadProjectRequest, ProjectResponse

router = APIRouter(prefix="/project", tags=["project"])


def _get_duration_ms(video_path: str) -> int:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return int(float(result.stdout.strip()) * 1000)
    except (ValueError, AttributeError):
        return 0


@router.post("/load", response_model=ProjectResponse)
async def load_project(request: LoadProjectRequest) -> ProjectResponse:
    path = Path(request.video_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {request.video_path}")

    duration_ms = _get_duration_ms(request.video_path)
    if duration_ms == 0:
        raise HTTPException(status_code=422, detail="Could not read video duration")

    project = VideoProject(source_path=request.video_path, duration_ms=duration_ms)
    container.repo.save(project)

    return ProjectResponse(
        project_id=str(project.id),
        duration_ms=project.duration_ms,
        video_path=project.source_path,
    )
