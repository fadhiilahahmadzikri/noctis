"""Tests for TimeRange value object."""

import pytest

from lethe.domain.value_objects.time_range import TimeRange


def test_duration_ms() -> None:
    tr = TimeRange(start_ms=1000, end_ms=5000)
    assert tr.duration_ms == 4000


def test_immutable() -> None:
    tr = TimeRange(start_ms=0, end_ms=100)
    with pytest.raises(AttributeError):
        tr.start_ms = 50  # type: ignore[misc]


def test_invalid_negative_start() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        TimeRange(start_ms=-1, end_ms=100)


def test_invalid_end_before_start() -> None:
    with pytest.raises(ValueError, match="end_ms must be >= start_ms"):
        TimeRange(start_ms=100, end_ms=50)


def test_equality_by_value() -> None:
    a = TimeRange(start_ms=0, end_ms=1000)
    b = TimeRange(start_ms=0, end_ms=1000)
    assert a == b
