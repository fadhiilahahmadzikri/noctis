"""Noctis backend — Local-First FastAPI sidecar.

All processing happens locally. SQLite for state. Binds to 127.0.0.1 only.
Network calls only for: Groq transcription (opt-in, requires internet).
"""

import argparse
import sqlite3
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import platformdirs
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from noctis.presentation.routes import detect, health, project, segment, settings, thumbnails, transcription, trim, waveform
from noctis.presentation.ws import progress

# Parse CLI args (sidecar receives --data-dir from Tauri)
def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Noctis local backend")
    parser.add_argument("--data-dir", type=str, default="")
    parser.add_argument("--port", type=int, default=18420)
    # Ignore unknown args (uvicorn passes its own)
    args, _ = parser.parse_known_args()
    if not args.data_dir:
        args.data_dir = platformdirs.user_data_dir("Noctis", ensure_exists=True)
    return args

ARGS = _parse_args()
DATA_DIR = Path(ARGS.data_dir)
DATA_DIR.mkdir(parents=True, exist_ok=True)

from noctis.shared.db import DB_PATH  # noqa: E402


def _init_db() -> None:
    """Initialize SQLite database with schema."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            video_path TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS recent_projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            video_path TEXT NOT NULL,
            project_file TEXT,
            last_opened INTEGER DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS transcription_cache (
            file_hash TEXT PRIMARY KEY,
            chunks TEXT NOT NULL DEFAULT '[]',
            full_text TEXT NOT NULL DEFAULT '',
            created_at INTEGER DEFAULT (strftime('%s','now'))
        );
    """)
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    _init_db()
    yield


def create_app() -> FastAPI:
    """Application factory — local-first, no external dependencies for core features."""
    app = FastAPI(title="Noctis API", version="1.0.0", lifespan=lifespan)

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
    app.include_router(settings.router)
    app.include_router(progress.router)

    @app.get("/file")
    async def serve_file(path: str) -> FileResponse:
        """Serve local file for video playback."""
        from fastapi import HTTPException, Query
        file_path = Path(path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(str(file_path), media_type="video/mp4")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    print("Application startup complete")  # Signal for Tauri sidecar
    sys.stdout.flush()
    uvicorn.run(app, host="127.0.0.1", port=ARGS.port)
