"""Trim/export endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lethe.presentation.schemas.detect_schemas import JobResponse

router = APIRouter(prefix="/project", tags=["trim"])


class TrimRequest(BaseModel):
    output_path: str


@router.post("/{project_id}/trim", response_model=JobResponse)
async def submit_trim(project_id: str, request: TrimRequest) -> JobResponse:
    raise HTTPException(status_code=501, detail="Not implemented")
