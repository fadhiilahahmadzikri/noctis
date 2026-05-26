"""Use case: apply trim to produce output video."""

from uuid import UUID

from noctis.application.ports.project_repository import ProjectRepository
from noctis.domain.ports.progress_emitter import ProgressEmitter
from noctis.domain.ports.video_editor import VideoEditor
from noctis.domain.value_objects.time_range import TimeRange


class ApplyTrimUseCase:
    """Renders final video from kept segments."""

    def __init__(
        self,
        editor: VideoEditor,
        repo: ProjectRepository,
        emitter: ProgressEmitter,
    ) -> None:
        self._editor = editor
        self._repo = repo
        self._emitter = emitter

    def execute(self, project_id: UUID, output_path: str) -> str:
        """Execute trim. Returns output file path."""
        project = self._repo.get(project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")

        kept = project.get_kept_segments()
        keep_ranges = [TimeRange(start_ms=s.start_ms, end_ms=s.end_ms) for s in kept]

        self._emitter.emit(0.0, "Starting trim...")
        result = self._editor.cut(project.source_path, keep_ranges, output_path)
        self._emitter.emit(100.0, "Trim complete")
        return result
