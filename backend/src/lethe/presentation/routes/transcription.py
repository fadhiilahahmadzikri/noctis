"""Transcription endpoint — auto-caption via HuggingFace Whisper."""

import os
from uuid import UUID
from pathlib import Path

from fastapi import APIRouter, HTTPException

from lethe.infrastructure.di.container import container

router = APIRouter(prefix="/project", tags=["transcription"])


class TranscriptChunkResponse:
    pass


from pydantic import BaseModel


class TranscriptChunkResponse(BaseModel):  # type: ignore[no-redef]
    text: str
    start_ms: int
    end_ms: int


class TranscribeResponse(BaseModel):
    chunks: list[TranscriptChunkResponse]
    full_text: str


@router.post("/{project_id}/transcribe", response_model=TranscribeResponse)
async def transcribe_project(project_id: str) -> TranscribeResponse:
    """Transcribe video audio using HuggingFace Whisper API. Token from HF_TOKEN env."""
    token = os.environ.get("HF_TOKEN", "")
    if not token:
        raise HTTPException(status_code=400, detail="HF_TOKEN environment variable not set")

    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = container.repo.get(pid)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if not Path(project.source_path).exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    from lethe.infrastructure.transcription import HuggingFaceTranscriber

    transcriber = HuggingFaceTranscriber(api_token=token)

    try:
        chunks = transcriber.transcribe(project.source_path)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return TranscribeResponse(
        chunks=[
            TranscriptChunkResponse(text=c.text, start_ms=c.start_ms, end_ms=c.end_ms)
            for c in chunks
        ],
        full_text=" ".join(c.text for c in chunks),
    )
