"""Segment management endpoints."""

from fastapi import APIRouter, HTTPException

from lethe.presentation.schemas.segment_schemas import (
    SegmentResponse,
    SegmentsListResponse,
    ToggleSegmentRequest,
)

router = APIRouter(prefix="/project", tags=["segment"])


@router.get("/{project_id}/segments", response_model=SegmentsListResponse)
async def get_segments(project_id: str) -> SegmentsListResponse:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.patch("/{project_id}/segment/{segment_id}", response_model=SegmentResponse)
async def toggle_segment(
    project_id: str, segment_id: str, request: ToggleSegmentRequest
) -> SegmentResponse:
    raise HTTPException(status_code=501, detail="Not implemented")
