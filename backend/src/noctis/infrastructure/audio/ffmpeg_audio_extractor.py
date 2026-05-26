"""FFmpeg-based audio extraction from video files."""

import subprocess
import tempfile
from pathlib import Path


class FFmpegAudioExtractor:
    """Extracts audio as 16kHz mono WAV using ffmpeg subprocess."""

    def extract(self, video_path: str, output_path: str = "") -> str:
        if not output_path:
            output_path = str(
                Path(tempfile.gettempdir()) / f"{Path(video_path).stem}_audio.wav"
            )

        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output_path
