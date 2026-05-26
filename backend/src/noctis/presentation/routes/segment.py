"""Segment management endpoints."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from noctis.infrastructure.di.container import container
from noctis.presentation.schemas.segment_schemas import (
    SegmentResponse,
    SegmentsListResponse,
    ToggleSegmentRequest,
)

router = APIRouter(prefix="/project", tags=["segment"])


@router.get("/{project_id}/segments", response_model=SegmentsListResponse)
async def get_segments(project_id: str) -> SegmentsListResponse:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = container.repo.get(pid)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return SegmentsListResponse(
        segments=[
            SegmentResponse(
                id=str(s.id),
                start_ms=s.start_ms,
                end_ms=s.end_ms,
                type=s.segment_type.value,
                is_removed=s.is_removed,
            )
            for s in project.segments
        ]
    )


@router.patch("/{project_id}/segment/{segment_id}", response_model=SegmentResponse)
async def toggle_segment(
    project_id: str, segment_id: str, request: ToggleSegmentRequest
) -> SegmentResponse:
    try:
        pid = UUID(project_id)
        sid = UUID(segment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    try:
        seg = container.toggle_segment.execute(pid, sid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return SegmentResponse(
        id=str(seg.id),
        start_ms=seg.start_ms,
        end_ms=seg.end_ms,
        type=seg.segment_type.value,
        is_removed=seg.is_removed,
    )
