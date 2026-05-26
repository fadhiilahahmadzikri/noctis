"""HuggingFace transcription adapter using official InferenceClient."""

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from huggingface_hub import InferenceClient
from loguru import logger


@dataclass(frozen=True)
class TranscriptChunk:
    """A single transcribed segment with timestamps."""

    text: str
    start_ms: int
    end_ms: int


class HuggingFaceTranscriber:
    """Transcribes audio using HuggingFace InferenceClient (whisper-large-v3-turbo).

    Uses official huggingface_hub SDK — handles routing, retries, and provider selection.
    No local GPU needed.
    """

    MODEL = "openai/whisper-large-v3-turbo"

    def __init__(self, api_token: str) -> None:
        self._client = InferenceClient(provider="hf-inference", api_key=api_token)

    def transcribe(self, video_path: str) -> list[TranscriptChunk]:
        """Extract audio from video and transcribe."""
        logger.info(f"Transcribing: {video_path}")
        audio_path = self._extract_audio(video_path)

        try:
            result = self._client.automatic_speech_recognition(
                audio_path, model=self.MODEL
            )
            chunks = self._parse_result(result)
            logger.info(f"Transcription complete: {len(chunks)} chunks")
            return chunks
        finally:
            Path(audio_path).unlink(missing_ok=True)

    def _extract_audio(self, video_path: str) -> str:
        """Extract audio as mono 16kHz FLAC."""
        output = str(Path(tempfile.gettempdir()) / f"lethe_transcribe_{Path(video_path).stem}.flac")
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac",
            output,
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output

    def _parse_result(self, result: object) -> list[TranscriptChunk]:
        """Parse InferenceClient ASR result into chunks."""
        chunks: list[TranscriptChunk] = []

        # Result is an AutomaticSpeechRecognitionOutput with .text and .chunks
        if hasattr(result, "chunks") and result.chunks:  # type: ignore[union-attr]
            for chunk in result.chunks:  # type: ignore[union-attr]
                ts = chunk.get("timestamp", (0, 0)) if isinstance(chunk, dict) else getattr(chunk, "timestamp", (0, 0))
                text = chunk.get("text", "").strip() if isinstance(chunk, dict) else getattr(chunk, "text", "").strip()
                if not text:
                    continue
                start = ts[0] if ts[0] is not None else 0
                end = ts[1] if ts[1] is not None else start + 1
                chunks.append(TranscriptChunk(text=text, start_ms=int(start * 1000), end_ms=int(end * 1000)))
        elif hasattr(result, "text") and result.text:  # type: ignore[union-attr]
            chunks.append(TranscriptChunk(text=result.text.strip(), start_ms=0, end_ms=0))  # type: ignore[union-attr]

        return chunks
