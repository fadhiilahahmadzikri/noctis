"""Port interface for Voice Activity Detection."""

from typing import Protocol

from noctis.domain.value_objects.time_range import TimeRange


class VADDetector(Protocol):
    """Detects speech segments in an audio file."""

    def detect(self, audio_path: str) -> list[TimeRange]: ...
