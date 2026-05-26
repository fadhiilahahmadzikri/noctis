"""Trim/export endpoints."""

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lethe.infrastructure.di.container import container
from lethe.presentation.schemas.detect_schemas import JobResponse

router = APIRouter(prefix="/project", tags=["trim"])


class TrimRequest(BaseModel):
    output_path: str


@router.post("/{project_id}/trim", response_model=JobResponse)
async def submit_trim(project_id: str, request: TrimRequest) -> JobResponse:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    try:
        container.apply_trim.execute(pid, request.output_path)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return JobResponse(job_id=project_id, status="complete")
