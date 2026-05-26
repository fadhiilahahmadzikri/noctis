"""Segment entity — represents a time-bounded section of audio/video."""

from dataclasses import dataclass, field
from enum import Enum
from uuid import UUID, uuid4


class SegmentType(Enum):
    SPEECH = "speech"
    SILENCE = "silence"


@dataclass
class Segment:
    """A segment of audio with identity. Mutable via toggle."""

    start_ms: int
    end_ms: int
    segment_type: SegmentType
    id: UUID = field(default_factory=uuid4)
    is_removed: bool = False

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    def toggle(self) -> "Segment":
        """Returns a new Segment with toggled is_removed state."""
        return Segment(
            start_ms=self.start_ms,
            end_ms=self.end_ms,
            segment_type=self.segment_type,
            id=self.id,
            is_removed=not self.is_removed,
        )
