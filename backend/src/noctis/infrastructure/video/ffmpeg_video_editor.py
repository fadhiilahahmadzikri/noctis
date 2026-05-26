"""FFmpeg-based video editor using re-encode for precise cutting."""

import subprocess

from noctis.domain.value_objects.time_range import TimeRange


class FFmpegVideoEditor:
    """Cuts and concatenates video segments using ffmpeg with precise re-encoding."""

    def cut(self, input_path: str, keep_ranges: list[TimeRange], output_path: str) -> str:
        if not keep_ranges:
            raise ValueError("No segments to keep")

        # Merge close ranges and filter zero-duration
        merged = self._merge_close_ranges(keep_ranges, gap_ms=300)
        merged = [r for r in merged if r.duration_ms > 50]  # drop < 50ms

        if not merged:
            raise ValueError("No valid segments after filtering")

        n = len(merged)
        filter_parts: list[str] = []
        for i, tr in enumerate(merged):
            start_s = tr.start_ms / 1000.0
            end_s = tr.end_ms / 1000.0
            filter_parts.append(
                f"[0:v]trim=start={start_s:.3f}:end={end_s:.3f},setpts=PTS-STARTPTS[v{i}];"
            )
            filter_parts.append(
                f"[0:a]atrim=start={start_s:.3f}:end={end_s:.3f},asetpts=PTS-STARTPTS[a{i}];"
            )

        # Concat: interleave [v0][a0][v1][a1]...
        concat_inputs = "".join(f"[v{i}][a{i}]" for i in range(n))
        filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]")

        filter_complex = "".join(filter_parts)

        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-filter_complex", filter_complex,
            "-map", "[outv]", "-map", "[outa]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {result.stderr[-500:]}")

        return output_path

    def _merge_close_ranges(
        self, ranges: list[TimeRange], gap_ms: int = 300
    ) -> list[TimeRange]:
        """Merge ranges separated by less than gap_ms."""
        if not ranges:
            return []

        sorted_ranges = sorted(ranges, key=lambda r: r.start_ms)
        merged: list[TimeRange] = [sorted_ranges[0]]

        for current in sorted_ranges[1:]:
            prev = merged[-1]
            if current.start_ms - prev.end_ms <= gap_ms:
                merged[-1] = TimeRange(start_ms=prev.start_ms, end_ms=current.end_ms)
            else:
                merged.append(current)

        return merged
