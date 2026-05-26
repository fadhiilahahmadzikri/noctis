"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lethe.presentation.routes import detect, health, project, segment, trim
from lethe.presentation.ws import progress


def create_app() -> FastAPI:
    """Application factory — composition root for the web layer."""
    app = FastAPI(title="Lethe API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:1420",
            "http://localhost:5173",
            "tauri://localhost",
        ],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(project.router)
    app.include_router(detect.router)
    app.include_router(segment.router)
    app.include_router(trim.router)
    app.include_router(progress.router)

    return app


app = create_app()
