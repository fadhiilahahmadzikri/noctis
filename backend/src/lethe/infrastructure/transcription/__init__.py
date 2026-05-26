"""HuggingFace Inference API transcription adapter."""

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import httpx
from loguru import logger


@dataclass(frozen=True)
class TranscriptChunk:
    """A single transcribed segment with timestamps."""

    text: str
    start_ms: int
    end_ms: int


class HuggingFaceTranscriber:
    """Transcribes audio using HuggingFace Inference API (whisper-large-v3-turbo).

    Requires a free HuggingFace API token.
    The model runs on HuggingFace's GPU — no local GPU needed.
    """

    MODEL = "openai/whisper-large-v3-turbo"
    API_URL = f"https://router.huggingface.co/hf-inference/models/{MODEL}"

    def __init__(self, api_token: str) -> None:
        self._token = api_token

    def transcribe(self, video_path: str) -> list[TranscriptChunk]:
        """Extract audio from video and transcribe via HuggingFace API."""
        logger.info(f"Transcribing: {video_path}")

        # Extract audio as FLAC (good compression, lossless)
        audio_path = self._extract_audio(video_path)

        try:
            chunks = self._call_api(audio_path)
            logger.info(f"Transcription complete: {len(chunks)} chunks")
            return chunks
        finally:
            Path(audio_path).unlink(missing_ok=True)

    def _extract_audio(self, video_path: str) -> str:
        """Extract audio as mono 16kHz FLAC for optimal API performance."""
        output = str(Path(tempfile.gettempdir()) / f"lethe_transcribe_{Path(video_path).stem}.flac")
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-ac", "1", "-ar", "16000",
            "-c:a", "flac",
            output,
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output

    def _call_api(self, audio_path: str) -> list[TranscriptChunk]:
        """Send audio to HuggingFace Inference API."""
        headers = {"Authorization": f"Bearer {self._token}"}

        with open(audio_path, "rb") as f:
            audio_data = f.read()

        response = httpx.post(
            self.API_URL,
            headers=headers,
            content=audio_data,
            timeout=120.0,
        )

        if response.status_code == 503:
            # Model loading — retry info in response
            raise RuntimeError("Model is loading, please try again in ~20 seconds")
        if response.status_code != 200:
            raise RuntimeError(f"HuggingFace API error ({response.status_code}): {response.text}")

        data = response.json()
        return self._parse_response(data)

    def _parse_response(self, data: dict) -> list[TranscriptChunk]:  # type: ignore[type-arg]
        """Parse HuggingFace API response into TranscriptChunks."""
        chunks: list[TranscriptChunk] = []

        # Response format: {"text": "...", "chunks": [{"timestamp": [start, end], "text": "..."}]}
        if "chunks" in data:
            for chunk in data["chunks"]:
                ts = chunk.get("timestamp", [0, 0])
                start = ts[0] if ts[0] is not None else 0
                end = ts[1] if ts[1] is not None else start + 1
                text = chunk.get("text", "").strip()
                if text:
                    chunks.append(TranscriptChunk(
                        text=text,
                        start_ms=int(start * 1000),
                        end_ms=int(end * 1000),
                    ))
        elif "text" in data:
            # Fallback: no timestamps, just full text
            chunks.append(TranscriptChunk(text=data["text"].strip(), start_ms=0, end_ms=0))

        return chunks
