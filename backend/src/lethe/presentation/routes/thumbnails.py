"""Video thumbnail strip generation endpoint."""

import subprocess
import tempfile
import base64
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from lethe.infrastructure.di.container import container

router = APIRouter(tags=["thumbnails"])


@router.get("/project/{project_id}/thumbnails")
async def get_thumbnails(
    project_id: str,
    count: int = Query(default=20, ge=1, le=60),
    height: int = Query(default=60),
) -> dict:
    """Extract evenly-spaced video frames as base64 JPEG thumbnails."""
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = container.repo.get(pid)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    path = project.source_path
    if not Path(path).exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    duration_s = project.duration_ms / 1000.0
    interval = duration_s / count

    thumbnails: list[str] = []
    for i in range(count):
        timestamp = i * interval
        tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        tmp.close()

        cmd = [
            "ffmpeg", "-y",
            "-ss", f"{timestamp:.2f}",
            "-i", path,
            "-vframes", "1",
            "-vf", f"scale=-1:{height}",
            "-q:v", "8",
            tmp.name,
        ]
        subprocess.run(cmd, capture_output=True)

        thumb_path = Path(tmp.name)
        if thumb_path.exists() and thumb_path.stat().st_size > 0:
            data = thumb_path.read_bytes()
            thumbnails.append(base64.b64encode(data).decode())
            thumb_path.unlink()
        else:
            thumbnails.append("")
            thumb_path.unlink(missing_ok=True)

    return {"thumbnails": thumbnails, "count": len(thumbnails)}
