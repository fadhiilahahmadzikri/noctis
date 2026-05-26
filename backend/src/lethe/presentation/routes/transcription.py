"""Transcription endpoint — Groq Whisper, cached in local SQLite."""

import hashlib
import json
import sqlite3
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lethe.infrastructure.di.container import container
from lethe.main import DB_PATH

router = APIRouter(prefix="/project", tags=["transcription"])


class TranscriptChunkResponse(BaseModel):
    text: str
    start_ms: int
    end_ms: int


class TranscribeResponse(BaseModel):
    chunks: list[TranscriptChunkResponse]
    full_text: str
    cached: bool = False


def _get_setting(key: str) -> str:
    """Read a setting from SQLite."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row[0] if row else ""


def _hash_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


def _get_cached(file_hash: str) -> list[dict] | None:  # type: ignore[type-arg]
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute("SELECT chunks FROM transcription_cache WHERE file_hash = ?", (file_hash,)).fetchone()
    conn.close()
    if row:
        return json.loads(row[0])
    return None


def _set_cached(file_hash: str, chunks: list[dict]) -> None:  # type: ignore[type-arg]
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        "INSERT OR REPLACE INTO transcription_cache (file_hash, chunks, full_text) VALUES (?, ?, ?)",
        (file_hash, json.dumps(chunks), " ".join(c["text"] for c in chunks)),
    )
    conn.commit()
    conn.close()


@router.post("/{project_id}/transcribe", response_model=TranscribeResponse)
async def transcribe_project(project_id: str) -> TranscribeResponse:
    """Transcribe video. Cached locally in SQLite by file hash."""
    api_key = _get_setting("groq_api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="API key not set. Go to Settings to add your Groq API key.")

    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = container.repo.get(pid)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if not Path(project.source_path).exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    # Check local cache
    file_hash = _hash_file(project.source_path)
    cached = _get_cached(file_hash)
    if cached is not None:
        return TranscribeResponse(
            chunks=[TranscriptChunkResponse(**c) for c in cached],
            full_text=" ".join(c["text"] for c in cached),
            cached=True,
        )

    # Call Groq
    from lethe.infrastructure.transcription import GroqTranscriber
    transcriber = GroqTranscriber(api_key=api_key)
    try:
        chunks = transcriber.transcribe(project.source_path)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Cache locally
    chunk_dicts = [{"text": c.text, "start_ms": c.start_ms, "end_ms": c.end_ms} for c in chunks]
    _set_cached(file_hash, chunk_dicts)

    return TranscribeResponse(
        chunks=[TranscriptChunkResponse(text=c.text, start_ms=c.start_ms, end_ms=c.end_ms) for c in chunks],
        full_text=" ".join(c.text for c in chunks),
        cached=False,
    )
