"""Tests for Segment entity."""

from lethe.domain.entities.segment import Segment, SegmentType


def test_toggle_returns_new_segment() -> None:
    seg = Segment(start_ms=0, end_ms=1000, segment_type=SegmentType.SILENCE)
    toggled = seg.toggle()
    assert toggled.is_removed is True
    assert seg.is_removed is False
    assert toggled.id == seg.id


def test_toggle_twice_restores_state() -> None:
    seg = Segment(start_ms=0, end_ms=1000, segment_type=SegmentType.SPEECH)
    assert seg.toggle().toggle().is_removed is False


def test_duration_ms() -> None:
    seg = Segment(start_ms=500, end_ms=2500, segment_type=SegmentType.SPEECH)
    assert seg.duration_ms == 2000
