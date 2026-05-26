"""VideoProject entity — aggregate root for a processing session."""

from dataclasses import dataclass, field
from uuid import UUID, uuid4

from noctis.domain.entities.segment import Segment


@dataclass
class VideoProject:
    """Represents a video file being processed with its detected segments."""

    source_path: str
    duration_ms: int
    id: UUID = field(default_factory=uuid4)
    segments: list[Segment] = field(default_factory=list)

    def get_kept_segments(self) -> list[Segment]:
        return [s for s in self.segments if not s.is_removed]

    def get_removed_segments(self) -> list[Segment]:
        return [s for s in self.segments if s.is_removed]
