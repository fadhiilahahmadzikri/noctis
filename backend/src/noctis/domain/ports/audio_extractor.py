"""Port interface for audio extraction from video."""

from typing import Protocol


class AudioExtractor(Protocol):
    """Extracts audio track from a video file."""

    def extract(self, video_path: str, output_path: str) -> str: ...
