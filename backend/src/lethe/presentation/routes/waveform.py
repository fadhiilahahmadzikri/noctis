"""Waveform data generation endpoint."""

import struct
import subprocess
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from lethe.infrastructure.di.container import container

router = APIRouter(tags=["waveform"])


@router.get("/project/{project_id}/waveform")
async def get_waveform(project_id: str, samples: int = Query(default=500)) -> dict:
    """Generate waveform amplitude data for visualization."""
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

    # Extract raw audio as float32 mono 8kHz
    cmd = [
        "ffmpeg", "-i", path, "-vn",
        "-af", "aresample=8000,aformat=sample_fmts=flt:channel_layouts=mono",
        "-f", "f32le", "-",
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail="Failed to extract audio")

    raw = result.stdout
    total_samples = len(raw) // 4
    if total_samples == 0:
        return {"waveform": [0.0] * samples}

    # Downsample to requested number of peak points
    chunk_size = max(1, total_samples // samples)
    waveform: list[float] = []
    for i in range(0, total_samples, chunk_size):
        chunk_end = min(i + chunk_size, total_samples)
        peak = 0.0
        for j in range(i, chunk_end):
            val = abs(struct.unpack_from("<f", raw, j * 4)[0])
            if val > peak:
                peak = val
        waveform.append(min(1.0, peak))
        if len(waveform) >= samples:
            break

    return {"waveform": waveform}
