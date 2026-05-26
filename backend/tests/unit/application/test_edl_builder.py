"""Tests for application layer services and use cases."""

from uuid import uuid4

from noctis.application.services.edl_builder import EDLBuilderService
from noctis.application.use_cases.toggle_segment import ToggleSegmentUseCase
from noctis.domain.entities.segment import Segment, SegmentType
from noctis.domain.entities.video_project import VideoProject


class FakeProjectRepository:
    """In-memory fake for testing."""

    def __init__(self) -> None:
        self._store: dict[str, VideoProject] = {}

    def save(self, project: VideoProject) -> None:
        self._store[str(project.id)] = project

    def get(self, project_id):  # noqa: ANN001, ANN201
        return self._store.get(str(project_id))

    def delete(self, project_id) -> None:  # noqa: ANN001
        self._store.pop(str(project_id), None)


def test_edl_builder_returns_kept_ranges() -> None:
    svc = EDLBuilderService()
    segments = [
        Segment(start_ms=0, end_ms=3000, segment_type=SegmentType.SPEECH),
        Segment(start_ms=3000, end_ms=5000, segment_type=SegmentType.SILENCE, is_removed=True),
        Segment(start_ms=5000, end_ms=10000, segment_type=SegmentType.SPEECH),
    ]
    ranges = svc.build_from_segments(segments)
    assert len(ranges) == 2
    assert ranges[0].start_ms == 0
    assert ranges[0].end_ms == 3000
    assert ranges[1].start_ms == 5000


def test_edl_builder_empty_segments() -> None:
    svc = EDLBuilderService()
    assert svc.build_from_segments([]) == []


def test_toggle_segment_use_case() -> None:
    repo = FakeProjectRepository()
    project = VideoProject(source_path="/test.mp4", duration_ms=10000)
    seg = Segment(start_ms=0, end_ms=3000, segment_type=SegmentType.SILENCE)
    project.segments = [seg]
    repo.save(project)

    uc = ToggleSegmentUseCase(repo=repo)
    result = uc.execute(project.id, seg.id)
    assert result.is_removed is True

    # Toggle back
    result2 = uc.execute(project.id, seg.id)
    assert result2.is_removed is False


def test_toggle_segment_not_found() -> None:
    repo = FakeProjectRepository()
    project = VideoProject(source_path="/test.mp4", duration_ms=10000)
    repo.save(project)

    uc = ToggleSegmentUseCase(repo=repo)
    try:
        uc.execute(project.id, uuid4())
        assert False, "Should have raised"  # noqa: B011
    except ValueError:
        pass
