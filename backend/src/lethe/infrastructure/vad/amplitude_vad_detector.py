"""Amplitude-based silence detection using ffmpeg silencedetect filter."""

import re
import subprocess

from lethe.domain.value_objects.time_range import TimeRange


class AmplitudeVADDetector:
    """Detects speech segments via ffmpeg silencedetect — no ML models required.

    Uses ffmpeg's silencedetect audio filter to find silence regions,
    then inverts them to produce speech segments.
    """

    def __init__(
        self,
        silence_threshold_db: float = -30.0,
        min_silence_duration_s: float = 0.5,
    ) -> None:
        self._threshold = silence_threshold_db
        self._min_duration = min_silence_duration_s

    def detect(self, audio_path: str) -> list[TimeRange]:
        """Returns speech segments (inverse of detected silence)."""
        cmd = [
            "ffmpeg", "-i", audio_path, "-af",
            f"silencedetect=noise={self._threshold}dB:d={self._min_duration}",
            "-f", "null", "-",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        stderr = result.stderr

        # Parse silence_start and silence_end from ffmpeg output
        silence_ranges = self._parse_silence(stderr)

        # Get total duration
        duration_ms = self._get_duration_ms(audio_path)
        if duration_ms == 0:
            return []

        # Invert silence to get speech
        return self._invert_to_speech(silence_ranges, duration_ms)

    def _parse_silence(self, stderr: str) -> list[TimeRange]:
        """Parse ffmpeg silencedetect output into silence TimeRanges."""
        starts = re.findall(r"silence_start: (-?[\d.]+)", stderr)
        ends = re.findall(r"silence_end: ([\d.]+)", stderr)

        ranges: list[TimeRange] = []
        for s, e in zip(starts, ends):
            start_ms = max(0, int(float(s) * 1000))
            end_ms = int(float(e) * 1000)
            if end_ms > start_ms:
                ranges.append(TimeRange(start_ms=start_ms, end_ms=end_ms))
        return ranges

    def _invert_to_speech(
        self, silence_ranges: list[TimeRange], duration_ms: int
    ) -> list[TimeRange]:
        """Convert silence ranges to speech ranges."""
        if not silence_ranges:
            return [TimeRange(start_ms=0, end_ms=duration_ms)]

        speech: list[TimeRange] = []
        prev_end = 0

        for sr in silence_ranges:
            if sr.start_ms > prev_end:
                speech.append(TimeRange(start_ms=prev_end, end_ms=sr.start_ms))
            prev_end = sr.end_ms

        if prev_end < duration_ms:
            speech.append(TimeRange(start_ms=prev_end, end_ms=duration_ms))

        return speech

    def _get_duration_ms(self, audio_path: str) -> int:
        """Get audio duration in ms via ffprobe."""
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        try:
            return int(float(result.stdout.strip()) * 1000)
        except (ValueError, AttributeError):
            return 0
