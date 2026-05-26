"""Groq transcription adapter — word-level timestamps via Whisper large-v3-turbo."""

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from groq import Groq
from loguru import logger


@dataclass(frozen=True)
class TranscriptChunk:
    """A transcribed word/phrase with precise timestamps."""

    text: str
    start_ms: int
    end_ms: int


class GroqTranscriber:
    """Transcribes audio using Groq API with word-level timestamps.

    Groq runs Whisper on their hardware (free tier: 2000 req/day).
    Returns word-level timestamps for precise caption sync.
    """

    MODEL = "whisper-large-v3-turbo"

    def __init__(self, api_key: str) -> None:
        self._client = Groq(api_key=api_key)

    def transcribe(self, video_path: str) -> list[TranscriptChunk]:
        """Extract audio and transcribe with word timestamps."""
        logger.info(f"Transcribing: {video_path}")
        audio_path = self._extract_audio(video_path)

        try:
            with open(audio_path, "rb") as audio_file:
                response = self._client.audio.transcriptions.create(
                    file=(Path(audio_path).name, audio_file),
                    model=self.MODEL,
                    response_format="verbose_json",
                    timestamp_granularities=["word", "segment"],
                    language="id",
                )

            chunks = self._parse_response(response)
            logger.info(f"Transcription complete: {len(chunks)} words")
            return chunks
        finally:
            Path(audio_path).unlink(missing_ok=True)

    def _extract_audio(self, video_path: str) -> str:
        """Extract audio as mono 16kHz FLAC."""
        output = str(Path(tempfile.gettempdir()) / f"lethe_{Path(video_path).stem}.flac")
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac",
            output,
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output

    def _parse_response(self, response: object) -> list[TranscriptChunk]:
        """Parse Groq verbose_json response into word-level chunks."""
        chunks: list[TranscriptChunk] = []

        # Word-level timestamps (list of dicts: {word, start, end})
        words = getattr(response, "words", None)
        if words:
            for w in words:
                text = (w.get("word", "") if isinstance(w, dict) else getattr(w, "word", "")).strip()
                start = w.get("start", 0.0) if isinstance(w, dict) else getattr(w, "start", 0.0)
                end = w.get("end", 0.0) if isinstance(w, dict) else getattr(w, "end", 0.0)
                if text:
                    chunks.append(TranscriptChunk(text=text, start_ms=int(start * 1000), end_ms=int(end * 1000)))
            return chunks

        # Fallback: segment-level
        segments = getattr(response, "segments", None)
        if segments:
            for seg in segments:
                text = (seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")).strip()
                start = seg.get("start", 0.0) if isinstance(seg, dict) else getattr(seg, "start", 0.0)
                end = seg.get("end", 0.0) if isinstance(seg, dict) else getattr(seg, "end", 0.0)
                if text:
                    chunks.append(TranscriptChunk(text=text, start_ms=int(start * 1000), end_ms=int(end * 1000)))
            return chunks

        # Last fallback
        text = getattr(response, "text", "")
        if text:
            chunks.append(TranscriptChunk(text=text.strip(), start_ms=0, end_ms=0))
        return chunks
