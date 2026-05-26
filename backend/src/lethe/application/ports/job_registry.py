"""Port interface for async job tracking."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol
from uuid import UUID, uuid4


class JobStatus(Enum):
    STARTED = "started"
    RUNNING = "running"
    COMPLETE = "complete"
    ERROR = "error"


@dataclass
class Job:
    id: UUID = field(default_factory=uuid4)
    status: JobStatus = JobStatus.STARTED
    progress: float = 0.0
    message: str = ""
    error: str | None = None


class JobRegistry(Protocol):
    """Tracks async background jobs."""

    def register(self, job: Job) -> None: ...

    def get(self, job_id: UUID) -> Job | None: ...

    def update(self, job: Job) -> None: ...
