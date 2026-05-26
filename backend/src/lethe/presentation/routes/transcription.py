"""Transcription endpoint — auto-caption via Groq Whisper."""

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


def _get_groq_key() -> str:
    """Read GROQ_API_KEY from env or .env file."""
    key = os.environ.get("GROQ_API_KEY", "")
    if key:
        return key
    env_file = Path(__file__).resolve().parents[4] / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("GROQ_API_KEY="):
                return line.split("=", 1)[1].strip()
    return ""


@router.post("/{project_id}/transcribe", response_model=TranscribeResponse)
async def transcribe_project(project_id: str) -> TranscribeResponse:
    """Transcribe video audio via Groq Whisper (word-level timestamps)."""
    key = _get_groq_key()
    if not key:
        raise HTTPException(status_code=400, detail="GROQ_API_KEY not set in .env")

    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = container.repo.get(pid)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if not Path(project.source_path).exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    from lethe.infrastructure.transcription import GroqTranscriber

    transcriber = GroqTranscriber(api_key=key)

    try:
        chunks = transcriber.transcribe(project.source_path)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return TranscribeResponse(
        chunks=[TranscriptChunkResponse(text=c.text, start_ms=c.start_ms, end_ms=c.end_ms) for c in chunks],
        full_text=" ".join(c.text for c in chunks),
    )
