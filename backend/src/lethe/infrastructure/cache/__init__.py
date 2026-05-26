"""Supabase-backed transcription cache."""

import hashlib
import json
from pathlib import Path

from loguru import logger

from lethe.infrastructure.transcription import TranscriptChunk


class TranscriptionCache:
    """Caches transcription results in Supabase, keyed by file SHA256 hash.

    Prevents redundant Groq API calls for the same video file.
    """

    def __init__(self, supabase_url: str, supabase_key: str) -> None:
        from supabase import create_client
        self._client = create_client(supabase_url, supabase_key)
        self._table = "transcription_cache"

    def get(self, file_path: str) -> list[TranscriptChunk] | None:
        """Return cached chunks if file hash exists, else None."""
        file_hash = self._hash_file(file_path)
        result = (
            self._client.table(self._table)
            .select("chunks")
            .eq("file_hash", file_hash)
            .limit(1)
            .execute()
        )
        if result.data:
            logger.info(f"Cache HIT for {Path(file_path).name} ({file_hash[:8]})")
            raw_chunks = result.data[0]["chunks"]
            return [
                TranscriptChunk(text=c["text"], start_ms=c["start_ms"], end_ms=c["end_ms"])
                for c in raw_chunks
            ]
        logger.info(f"Cache MISS for {Path(file_path).name} ({file_hash[:8]})")
        return None

    def put(self, file_path: str, chunks: list[TranscriptChunk], duration_ms: int = 0) -> None:
        """Store transcription result in cache."""
        file_hash = self._hash_file(file_path)
        data = {
            "file_hash": file_hash,
            "file_name": Path(file_path).name,
            "duration_ms": duration_ms,
            "chunks": [{"text": c.text, "start_ms": c.start_ms, "end_ms": c.end_ms} for c in chunks],
            "full_text": " ".join(c.text for c in chunks),
        }
        self._client.table(self._table).upsert(data, on_conflict="file_hash").execute()
        logger.info(f"Cached {len(chunks)} chunks for {Path(file_path).name}")

    def _hash_file(self, file_path: str) -> str:
        """SHA256 hash of file content."""
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(8192):
                h.update(chunk)
        return h.hexdigest()
