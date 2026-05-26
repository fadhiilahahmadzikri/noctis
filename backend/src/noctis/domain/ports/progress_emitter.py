"""Port interface for progress event emission."""

from typing import Protocol


class ProgressEmitter(Protocol):
    """Emits progress updates during long-running operations."""

    def emit(self, percent: float, message: str) -> None: ...
