"""Domain events — facts that have occurred in the system."""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class DetectionCompleted:
    project_id: UUID
    segment_count: int


@dataclass(frozen=True)
class TrimCompleted:
    project_id: UUID
    output_path: str
