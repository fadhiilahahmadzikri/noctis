"""Transcription endpoint — cached via Supabase, powered by Groq Whisper."""

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
    cached: bool = False


def _get_env(key: str) -> str:
    """Read from env or .env file."""
    val = os.environ.get(key, "")
    if val:
        return val
    env_file = Path(__file__).resolve().parents[4] / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    return ""


@router.post("/{project_id}/transcribe", response_model=TranscribeResponse)
async def transcribe_project(project_id: str) -> TranscribeResponse:
    """Transcribe video. Returns cached result if same file was transcribed before."""
    groq_key = _get_env("GROQ_API_KEY")
    if not groq_key:
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

    # Try cache first (Supabase)
    supabase_url = _get_env("SUPABASE_URL")
    supabase_key = _get_env("SUPABASE_KEY")
    cache = None

    if supabase_url and supabase_key:
        from lethe.infrastructure.cache import TranscriptionCache
        cache = TranscriptionCache(supabase_url, supabase_key)
        cached_chunks = cache.get(project.source_path)
        if cached_chunks is not None:
            return TranscribeResponse(
                chunks=[TranscriptChunkResponse(text=c.text, start_ms=c.start_ms, end_ms=c.end_ms) for c in cached_chunks],
                full_text=" ".join(c.text for c in cached_chunks),
                cached=True,
            )

    # Cache miss — call Groq
    from lethe.infrastructure.transcription import GroqTranscriber

    transcriber = GroqTranscriber(api_key=groq_key)
    try:
        chunks = transcriber.transcribe(project.source_path)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Store in cache
    if cache and chunks:
        try:
            cache.put(project.source_path, chunks, project.duration_ms)
        except Exception:
            pass  # Non-fatal

    return TranscribeResponse(
        chunks=[TranscriptChunkResponse(text=c.text, start_ms=c.start_ms, end_ms=c.end_ms) for c in chunks],
        full_text=" ".join(c.text for c in chunks),
        cached=False,
    )
