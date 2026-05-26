SHELL := powershell.exe
.SHELLFLAGS := -NoProfile -Command

.PHONY: help dev dev-backend dev-frontend build build-sidecar build-installer test lint clean kill

help: ## Show all commands
	@Write-Output "=== noctis Build Commands ==="; Write-Output ""; Write-Output "  make dev              - Run both backend + frontend (dev mode)"; Write-Output "  make dev-backend      - Run backend only (port 18420)"; Write-Output "  make dev-frontend     - Run frontend only (Tauri dev)"; Write-Output "  make build            - Build full installer (sidecar + Tauri)"; Write-Output "  make build-sidecar    - Bundle Python backend as .exe (PyInstaller)"; Write-Output "  make build-installer  - Build Tauri installer (.exe)"; Write-Output "  make test             - Run all backend tests"; Write-Output "  make lint             - Lint + typecheck backend"; Write-Output "  make clean            - Remove build artifacts"; Write-Output "  make kill             - Kill any running noctis processes"

# ==============================================================================
# Development
# ==============================================================================

dev: ## Run backend + frontend together (2 processes)
	@Write-Output "Starting backend..."; Start-Process -NoNewWindow powershell -ArgumentList "-Command","cd D:\noctis\backend; uv run python -m noctis.main"; Start-Sleep 2; Write-Output "Starting frontend..."; cd frontend; npm run tauri dev

dev-backend: ## Run backend only (hot-reload)
	cd backend; uv run uvicorn src.noctis.main:app --host 127.0.0.1 --port 18420 --reload

dev-frontend: ## Run frontend only (Tauri dev, needs backend running)
	cd frontend; npm run tauri dev

# ==============================================================================
# Build (Production)
# ==============================================================================

build: build-sidecar build-installer ## Full production build

build-sidecar: ## Bundle Python backend as noctis-server.exe
	cd backend; uv run pyinstaller --name noctis-server --onefile --hidden-import uvicorn.logging --hidden-import uvicorn.protocols.http --hidden-import uvicorn.protocols.http.auto --hidden-import uvicorn.protocols.websockets --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan --hidden-import uvicorn.lifespan.on --hidden-import noctis.presentation.routes.health --hidden-import noctis.presentation.routes.project --hidden-import noctis.presentation.routes.detect --hidden-import noctis.presentation.routes.segment --hidden-import noctis.presentation.routes.trim --hidden-import noctis.presentation.routes.waveform --hidden-import noctis.presentation.routes.thumbnails --hidden-import noctis.presentation.routes.transcription --hidden-import noctis.presentation.routes.settings --hidden-import noctis.presentation.ws.progress --hidden-import noctis.infrastructure.di.container --hidden-import noctis.infrastructure.vad.amplitude_vad_detector --hidden-import noctis.infrastructure.video.ffmpeg_video_editor --hidden-import noctis.infrastructure.audio.ffmpeg_audio_extractor --hidden-import noctis.infrastructure.repository.in_memory_project_repo --hidden-import noctis.infrastructure.events.log_progress_emitter --hidden-import noctis.infrastructure.transcription --hidden-import platformdirs src/noctis/main.py; Copy-Item dist\noctis-server.exe ..\frontend\src-tauri\binaries\noctis-server-x86_64-pc-windows-msvc.exe -Force

build-installer: ## Build Tauri installer (requires build-sidecar first)
	cd frontend; npx tauri build

# ==============================================================================
# Quality
# ==============================================================================

test: ## Run all backend tests
	cd backend; uv run pytest tests/ -q

lint: ## Lint + typecheck
	cd backend; uv run ruff check src/; uv run mypy src/

# ==============================================================================
# Utilities
# ==============================================================================

kill: ## Kill any running noctis processes
	Get-Process -Name "noctis-server","noctis" -ErrorAction SilentlyContinue | Stop-Process -Force; Write-Output "Done."

clean: ## Remove build artifacts
	Remove-Item -Recurse -Force -ErrorAction SilentlyContinue backend/dist, backend/build, backend/*.spec, frontend/dist, frontend/src-tauri/target; Write-Output "Cleaned."
