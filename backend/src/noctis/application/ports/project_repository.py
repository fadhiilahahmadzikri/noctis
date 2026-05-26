"""Port interface for project persistence."""

from typing import Protocol
from uuid import UUID

from noctis.domain.entities.video_project import VideoProject


class ProjectRepository(Protocol):
    """Stores and retrieves video projects."""

    def save(self, project: VideoProject) -> None: ...

    def get(self, project_id: UUID) -> VideoProject | None: ...

    def delete(self, project_id: UUID) -> None: ...
