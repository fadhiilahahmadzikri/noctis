"""Project management endpoints."""

from fastapi import APIRouter, HTTPException

from lethe.presentation.schemas.project_schemas import LoadProjectRequest, ProjectResponse

router = APIRouter(prefix="/project", tags=["project"])


@router.post("/load", response_model=ProjectResponse)
async def load_project(request: LoadProjectRequest) -> ProjectResponse:
    raise HTTPException(status_code=501, detail="Not implemented")
