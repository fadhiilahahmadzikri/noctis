"""Detection endpoints."""

from fastapi import APIRouter, HTTPException

from lethe.presentation.schemas.detect_schemas import DetectRequest, JobResponse

router = APIRouter(prefix="/project", tags=["detect"])


@router.post("/{project_id}/detect", response_model=JobResponse)
async def detect_silence(project_id: str, request: DetectRequest) -> JobResponse:
    raise HTTPException(status_code=501, detail="Not implemented")
