"""FastAPI application entry point."""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from lethe.presentation.routes import detect, health, project, segment, thumbnails, transcription, trim, waveform
from lethe.presentation.ws import progress


def create_app() -> FastAPI:
    """Application factory — composition root for the web layer."""
    app = FastAPI(title="Lethe API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(project.router)
    app.include_router(detect.router)
    app.include_router(segment.router)
    app.include_router(trim.router)
    app.include_router(waveform.router)
    app.include_router(thumbnails.router)
    app.include_router(transcription.router)
    app.include_router(progress.router)

    @app.get("/file")
    async def serve_file(path: str = Query(...)) -> FileResponse:
        """Serve local file for video playback."""
        file_path = Path(path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(str(file_path), media_type="video/mp4")

    return app


app = create_app()
