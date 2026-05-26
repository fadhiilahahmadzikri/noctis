"""Port interface for video editing operations."""

from typing import Protocol

from lethe.domain.value_objects.time_range import TimeRange


class VideoEditor(Protocol):
    """Cuts and concatenates video segments."""

    def cut(self, input_path: str, keep_ranges: list[TimeRange], output_path: str) -> str: ...
