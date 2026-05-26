"""Processing configuration value object — single source of truth for detection params."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ProcessingConfig:
    """All tunable parameters for silence/filler detection."""

    min_silence_duration_ms: int = 1000
    speech_pad_ms: int = 200
    threshold: float = 0.5
