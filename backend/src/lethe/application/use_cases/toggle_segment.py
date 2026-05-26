"""Use case: toggle a segment's removed state."""

from uuid import UUID

from lethe.application.ports.project_repository import ProjectRepository
from lethe.domain.entities.segment import Segment


class ToggleSegmentUseCase:
    """Toggles is_removed on a specific segment."""

    def __init__(self, repo: ProjectRepository) -> None:
        self._repo = repo

    def execute(self, project_id: UUID, segment_id: UUID) -> Segment:
        """Toggle segment. Returns updated segment."""
        project = self._repo.get(project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")

        for i, seg in enumerate(project.segments):
            if seg.id == segment_id:
                project.segments[i] = seg.toggle()
                self._repo.save(project)
                return project.segments[i]

        raise ValueError(f"Segment {segment_id} not found")
