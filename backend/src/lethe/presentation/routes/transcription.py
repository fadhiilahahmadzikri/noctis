"""Transcription endpoint — auto-caption via HuggingFace Whisper."""

import os
from uuid import UUID
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lethe.infrastructure.di.container import container

router = APIRouter(prefix="/project", tags=["transcription"])


class TranscriptChunkResponse(BaseModel):
    text: str
    start_ms: int
    end_ms: int


class TranscribeResponse(BaseModel):
    chunks: list[TranscriptChunkResponse]
    full_text: str


def _get_hf_token() -> str:
    """Read HF_TOKEN from env or .env file."""
    token = os.environ.get("HF_TOKEN", "")
    if token:
        return token
    # Try reading from .env file in backend dir
    env_file = Path(__file__).resolve().parents[4] / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("HF_TOKEN="):
                return line.split("=", 1)[1].strip()
    return ""


@router.post("/{project_id}/transcribe", response_model=TranscribeResponse)
async def transcribe_project(project_id: str) -> TranscribeResponse:
    """Transcribe video audio using HuggingFace Whisper API."""
    token = _get_hf_token()
    if not token:
        raise HTTPException(status_code=400, detail="HF_TOKEN not set. Add to backend/.env file.")

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
        chunks=[TranscriptChunkResponse(text=c.text, start_ms=c.start_ms, end_ms=c.end_ms) for c in chunks],
        full_text=" ".join(c.text for c in chunks),
    )
