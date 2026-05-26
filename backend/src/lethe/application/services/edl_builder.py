"""Application service: builds Edit Decision List from segments."""

from lethe.domain.entities.segment import Segment
from lethe.domain.value_objects.time_range import TimeRange


class EDLBuilderService:
    """Converts kept segments into a list of TimeRanges for video editing."""

    def build_from_segments(self, segments: list[Segment]) -> list[TimeRange]:
        """Returns ordered keep ranges from non-removed segments."""
        kept = [s for s in segments if not s.is_removed]
        kept.sort(key=lambda s: s.start_ms)
        return [TimeRange(start_ms=s.start_ms, end_ms=s.end_ms) for s in kept]
