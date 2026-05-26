"""Trim/export endpoints."""

import subprocess
import tempfile
from uuid import UUID
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from noctis.infrastructure.di.container import container
from noctis.presentation.schemas.detect_schemas import JobResponse

router = APIRouter(prefix="/project", tags=["trim"])


class CaptionItem(BaseModel):
    text: str
    start_ms: int
    end_ms: int


class TrimRequest(BaseModel):
    output_path: str
    resolution: str = "original"
    captions: list[CaptionItem] = []


@router.post("/{project_id}/trim", response_model=JobResponse)
async def submit_trim(project_id: str, request: TrimRequest) -> JobResponse:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    try:
        output = container.apply_trim.execute(pid, request.output_path)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Burn captions if provided
    if request.captions:
        try:
            _burn_captions(output, request.captions)
        except Exception:
            pass  # Non-fatal: export succeeds without captions

    return JobResponse(job_id=project_id, status="complete")


def _burn_captions(video_path: str, captions: list[CaptionItem]) -> None:
    """Burn SRT captions into video using ffmpeg subtitles filter."""
    # Write SRT file
    srt_path = str(Path(tempfile.gettempdir()) / "Noctis_captions.srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, c in enumerate(captions, 1):
            f.write(f"{i}\n{_to_srt(c.start_ms)} --> {_to_srt(c.end_ms)}\n{c.text}\n\n")

    # Re-encode with subtitles burned in
    tmp_out = video_path + ".captioned.mp4"
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vf", f"subtitles={srt_path.replace(chr(92), '/')}:force_style='FontSize=12,PrimaryColour=&HFFFFFF&'",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy",
        tmp_out,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        Path(video_path).unlink(missing_ok=True)
        Path(tmp_out).rename(video_path)
    Path(srt_path).unlink(missing_ok=True)


def _to_srt(ms: int) -> str:
    h = ms // 3600000
    m = (ms % 3600000) // 60000
    s = (ms % 60000) // 1000
    cs = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d},{cs:03d}"
