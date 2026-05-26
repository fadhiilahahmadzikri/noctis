"""Tests for VideoProject entity."""

from lethe.domain.entities.segment import Segment, SegmentType
from lethe.domain.entities.video_project import VideoProject


def test_get_kept_segments() -> None:
    project = VideoProject(source_path="/test.mp4", duration_ms=10000)
    project.segments = [
        Segment(start_ms=0, end_ms=3000, segment_type=SegmentType.SPEECH),
        Segment(start_ms=3000, end_ms=5000, segment_type=SegmentType.SILENCE, is_removed=True),
        Segment(start_ms=5000, end_ms=10000, segment_type=SegmentType.SPEECH),
    ]
    kept = project.get_kept_segments()
    assert len(kept) == 2
    assert all(not s.is_removed for s in kept)


def test_get_removed_segments() -> None:
    project = VideoProject(source_path="/test.mp4", duration_ms=10000)
    project.segments = [
        Segment(start_ms=0, end_ms=3000, segment_type=SegmentType.SPEECH),
        Segment(start_ms=3000, end_ms=5000, segment_type=SegmentType.SILENCE, is_removed=True),
    ]
    removed = project.get_removed_segments()
    assert len(removed) == 1
    assert removed[0].is_removed is True
