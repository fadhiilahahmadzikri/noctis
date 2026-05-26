"""Immutable time range value object."""

from dataclasses import dataclass


@dataclass(frozen=True)
class TimeRange:
    """Represents a time range in milliseconds. Equality by value."""

    start_ms: int
    end_ms: int

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    def __post_init__(self) -> None:
        if self.start_ms < 0:
            raise ValueError("start_ms must be non-negative")
        if self.end_ms < self.start_ms:
            raise ValueError("end_ms must be >= start_ms")
