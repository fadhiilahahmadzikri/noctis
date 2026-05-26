"""File upload endpoint — user uploads video to server for processing."""

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse

router = APIRouter(tags=["upload"])

UPLOAD_DIR = Path(tempfile.gettempdir()) / "lethe_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)) -> dict:
    """Upload video file to server. Returns server-side path for processing."""
    dest = UPLOAD_DIR / (file.filename or "video.mp4")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"path": str(dest), "filename": file.filename, "size": dest.stat().st_size}


@router.get("/download")
async def download_file(path: str) -> FileResponse:
    """Download processed file from server."""
    file_path = Path(path)
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path), filename=file_path.name, media_type="application/octet-stream")
