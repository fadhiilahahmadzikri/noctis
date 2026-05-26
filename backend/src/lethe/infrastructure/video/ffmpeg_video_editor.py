"""FFmpeg-based video editor using stream copy for fast cutting."""

import subprocess
import tempfile
from pathlib import Path

from lethe.domain.value_objects.time_range import TimeRange


class FFmpegVideoEditor:
    """Cuts and concatenates video segments using ffmpeg -c copy."""

    def cut(self, input_path: str, keep_ranges: list[TimeRange], output_path: str) -> str:
        if not keep_ranges:
            raise ValueError("No segments to keep")

        tmp_dir = Path(tempfile.mkdtemp(prefix="lethe_"))
        segment_files: list[Path] = []

        # Cut each segment
        for i, tr in enumerate(keep_ranges):
            seg_path = tmp_dir / f"seg_{i:04d}{Path(input_path).suffix}"
            start_s = tr.start_ms / 1000.0
            duration_s = tr.duration_ms / 1000.0
            cmd = [
                "ffmpeg", "-y",
                "-ss", f"{start_s:.3f}",
                "-i", input_path,
                "-t", f"{duration_s:.3f}",
                "-c", "copy",
                "-avoid_negative_ts", "make_zero",
                str(seg_path),
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            segment_files.append(seg_path)

        # Concat via demuxer
        concat_file = tmp_dir / "concat.txt"
        concat_file.write_text(
            "\n".join(f"file '{f}'" for f in segment_files), encoding="utf-8"
        )

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_file),
            "-c", "copy",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, check=True)

        # Cleanup temp segments
        for f in segment_files:
            f.unlink(missing_ok=True)
        concat_file.unlink(missing_ok=True)
        tmp_dir.rmdir()

        return output_path
