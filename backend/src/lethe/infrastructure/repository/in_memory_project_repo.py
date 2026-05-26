"""In-memory project repository implementation."""

from uuid import UUID

from lethe.domain.entities.video_project import VideoProject


class InMemoryProjectRepository:
    """Stores projects in memory. One project per session for V1."""

    def __init__(self) -> None:
        self._store: dict[UUID, VideoProject] = {}

    def save(self, project: VideoProject) -> None:
        self._store[project.id] = project

    def get(self, project_id: UUID) -> VideoProject | None:
        return self._store.get(project_id)

    def delete(self, project_id: UUID) -> None:
        self._store.pop(project_id, None)
