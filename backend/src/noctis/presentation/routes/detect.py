"""Detection endpoints."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from noctis.infrastructure.di.container import container
from noctis.domain.value_objects.processing_config import ProcessingConfig
from noctis.presentation.schemas.detect_schemas import DetectRequest, JobResponse

router = APIRouter(prefix="/project", tags=["detect"])


@router.post("/{project_id}/detect", response_model=JobResponse)
async def detect_silence(project_id: str, request: DetectRequest) -> JobResponse:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = container.repo.get(pid)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config = ProcessingConfig(
        min_silence_duration_ms=request.config.min_silence_duration_ms,
        speech_pad_ms=request.config.speech_pad_ms,
        threshold=request.config.threshold,
    )

    segment_count = container.detect_silence.execute(pid, config)

    return JobResponse(job_id=project_id, status=f"complete:{segment_count}")
