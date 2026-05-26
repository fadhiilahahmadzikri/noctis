"""Use case: detect silence segments in a video project."""

from uuid import UUID

from lethe.application.ports.project_repository import ProjectRepository
from lethe.domain.entities.segment import Segment, SegmentType
from lethe.domain.ports.progress_emitter import ProgressEmitter
from lethe.domain.ports.vad_detector import VADDetector
from lethe.domain.value_objects.processing_config import ProcessingConfig


class DetectSilenceUseCase:
    """Orchestrates VAD detection and segment creation."""

    def __init__(
        self,
        vad: VADDetector,
        repo: ProjectRepository,
        emitter: ProgressEmitter,
    ) -> None:
        self._vad = vad
        self._repo = repo
        self._emitter = emitter

    def execute(self, project_id: UUID, config: ProcessingConfig) -> int:
        """Run detection. Returns segment count."""
        project = self._repo.get(project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")

        self._emitter.emit(0.0, "Extracting speech segments...")
        speech_ranges = self._vad.detect(project.source_path)

        segments: list[Segment] = []
        prev_end = 0
        for sr in speech_ranges:
            if sr.start_ms > prev_end + config.min_silence_duration_ms:
                segments.append(
                    Segment(
                        start_ms=prev_end,
                        end_ms=sr.start_ms,
                        segment_type=SegmentType.SILENCE,
                        is_removed=True,
                    )
                )
            segments.append(
                Segment(start_ms=sr.start_ms, end_ms=sr.end_ms, segment_type=SegmentType.SPEECH)
            )
            prev_end = sr.end_ms

        if prev_end < project.duration_ms:
            gap = project.duration_ms - prev_end
            if gap >= config.min_silence_duration_ms:
                segments.append(
                    Segment(
                        start_ms=prev_end,
                        end_ms=project.duration_ms,
                        segment_type=SegmentType.SILENCE,
                        is_removed=True,
                    )
                )

        project.segments = segments
        self._repo.save(project)
        self._emitter.emit(100.0, f"Found {len(segments)} segments")
        return len(segments)
