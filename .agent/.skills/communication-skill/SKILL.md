# SilentCut — Communication Blueprint
### Data Flow Catalog · Tauri v2 + Python FastAPI

---

## 1. The Fundamental Constraint

Before anything else, understand this: **Tauri's native IPC only exists between the WebView (frontend) and the Rust Core**. It cannot reach Python directly.

Tauri uses Asynchronous Message Passing for IPC. The two primitives are **Commands** (request-response, type-safe, returns data) and **Events** (fire-and-forget, one-way, lifecycle signals).

Python is a **sidecar** — a separate OS process. There is no magical IPC with a sidecar. It's literally another binary running on your computer separate from the app, so normal communication limitations apply. Communication must use HTTP, gRPC, or WebSocket.

This means your system has **three distinct process boundaries**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SilentCut Desktop App                        │
│                                                                 │
│  ┌──────────────┐   Tauri IPC    ┌──────────────┐              │
│  │   WebView    │ ◄────────────► │  Rust Core   │              │
│  │  (React UI)  │  invoke/event  │  (Tauri)     │              │
│  └──────┬───────┘                └──────┬───────┘              │
│         │                               │                      │
│         │  HTTP + WebSocket             │  spawn / kill        │
│         │  localhost:18420              │  (process control)   │
│         ▼                               ▼                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │             Python FastAPI Sidecar (port 18420)          │  │
│  │         Silero VAD · FFmpeg · Business Logic             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

Each boundary uses a **different protocol** for a reason. This document explains each one.

---

## 2. Why Not gRPC?

gRPC is the right answer when: services need compact binary messages, strong typing, and bidirectional streaming across a network. gRPC shines when services need compact binary messages, strong typing, and bidirectional streaming. It struggles when you must expose an API directly to browsers without extra tooling.

For SilentCut, gRPC fails on one hard constraint: **WebView is a browser context**. Running gRPC in the browser usually requires a proxy layer, and the learning curve is steeper. You would need to add `grpc-web` proxy between WebView and Python, adding an extra process and complexity that gives you zero benefit on localhost.

gRPC is the right tool for service-to-service communication over a network. This is local, same-machine, browser-to-process. HTTP + WebSocket is correct here.

---

## 3. Protocol Decision Matrix

| Boundary | Protocol | Direction | Why |
|---|---|---|---|
| Frontend → Rust | **Tauri IPC `invoke()`** | Request-Response | Type-safe, OS access, file dialogs, native APIs |
| Rust → Frontend | **Tauri IPC `emit()`** | Push (fire-and-forget) | App lifecycle: sidecar ready, app closing |
| Frontend → Python | **HTTP REST** | Request-Response | Stateless operations: load, detect, trim config |
| Python → Frontend | **WebSocket** | Server-Push stream | Long-running progress: detection %, trim % |
| Rust → Python | **OS process spawn** | Control plane | Start sidecar on app open, kill on app close |
| Python → Rust | *(none needed)* | — | Python is stateless worker, Rust doesn't need callbacks from it |

---

## 4. Boundary A — Frontend ↔ Rust Core (Tauri IPC)

### When to use
Only for operations that **require OS-level access** that browsers cannot perform: file dialogs, reading system paths, app window control, sidecar lifecycle.

### Mechanism
Tauri implements IPC using a custom `ipc://` URI scheme protocol. When JavaScript calls `invoke()`, the request is sent as an HTTP POST to `ipc://localhost` with the command name, arguments, and callback identifiers.

The event system is a simpler communication mechanism. Unlike commands, events are not type-safe, are always async, cannot return values, and only support JSON payloads.

### Commands (Request-Response)

```typescript
// Frontend: invoke a Rust command
import { invoke } from '@tauri-apps/api/core';

// Open native file picker → returns absolute path string
const videoPath: string = await invoke('open_video_dialog');

// Get sidecar port (Rust knows which port it spawned Python on)
const port: number = await invoke('get_sidecar_port');

// Trigger graceful sidecar shutdown
await invoke('shutdown_sidecar');
```

```rust
// Rust: define the commands
#[tauri::command]
async fn open_video_dialog(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog()
        .file()
        .add_filter("Video", &["mp4", "mov", "mkv", "avi"])
        .blocking_pick_file();
    path.map(|p| p.to_string()).ok_or("No file selected".into())
}

#[tauri::command]
fn get_sidecar_port() -> u16 {
    18420 // or read from shared state if dynamic
}
```

### Events (Fire-and-Forget Push)

```typescript
// Frontend: listen for events emitted by Rust
import { listen } from '@tauri-apps/api/event';

// React to sidecar being ready
const unlisten = await listen<{ port: number }>('sidecar-ready', (event) => {
    store.setSidecarPort(event.payload.port);
    store.setReady(true);
});

// React to app closing (save state, cleanup)
await listen('tauri://close-requested', () => {
    store.reset();
});
```

```rust
// Rust: emit events to frontend
app.emit("sidecar-ready", serde_json::json!({ "port": 18420 })).unwrap();
```

### Rust Sidecar Lifecycle Control

```rust
// src-tauri/src/lib.rs
use tauri_plugin_shell::ShellExt;

.setup(|app| {
    let sidecar_cmd = app.shell()
        .sidecar("silentcut-server")?
        .env("SILENTCUT_PORT", "18420");

    let (mut rx, child) = sidecar_cmd.spawn()?;

    // Store child handle so we can kill it on exit
    app.manage(Mutex::new(child));

    // Watch sidecar stdout for ready signal
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(line) = event {
                if line.contains("Application startup complete") {
                    app_handle.emit("sidecar-ready", json!({ "port": 18420 })).ok();
                }
            }
        }
    });
    Ok(())
})
```

---

## 5. Boundary B — Frontend ↔ Python (HTTP REST)

### When to use
All **stateless request-response operations**: loading a project, running detection, fetching segment list, toggling a segment, submitting trim job.

### Why HTTP, not stdio or pipes
stdio (reading from process stdout line by line) works for simple tools but breaks down for structured bidirectional communication. HTTP gives you: standard status codes, JSON schema validation via Pydantic, OpenAPI docs auto-generated, and easy testability outside the app.

### Transport Layer Detail

```
React (WebView)
    │
    │  fetch('http://localhost:18420/project/load', { method: 'POST', ... })
    │  ← standard browser fetch API, works natively in WebView
    ▼
FastAPI (Python Sidecar on port 18420)
    │
    │  uvicorn handles request
    │  Pydantic validates body
    │  Use case executes
    │  Returns JSON response
    ▼
React receives JSON → Zustand store update → UI re-renders
```

### API Client (TypeScript)

```typescript
// src/services/apiClient.ts

const BASE_URL = 'http://localhost:18420';

export class ApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl: string = BASE_URL) {
        this.baseUrl = baseUrl;
    }

    async loadProject(videoPath: string): Promise<ProjectDto> {
        const response = await fetch(`${this.baseUrl}/project/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_path: videoPath }),
        });
        if (!response.ok) throw new ApiError(response.status, await response.text());
        return response.json() as Promise<ProjectDto>;
    }

    async detectSilence(
        projectId: string,
        mode: 'auto' | 'manual',
        config: DetectionConfig
    ): Promise<DetectionJobDto> {
        const response = await fetch(`${this.baseUrl}/project/${projectId}/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, config }),
        });
        if (!response.ok) throw new ApiError(response.status, await response.text());
        return response.json() as Promise<DetectionJobDto>;
    }

    async getSegments(projectId: string): Promise<SegmentDto[]> {
        const response = await fetch(`${this.baseUrl}/project/${projectId}/segments`);
        if (!response.ok) throw new ApiError(response.status, await response.text());
        const data = await response.json();
        return data.segments;
    }

    async toggleSegment(
        projectId: string,
        segmentId: string,
        isRemoved: boolean
    ): Promise<SegmentDto> {
        const response = await fetch(
            `${this.baseUrl}/project/${projectId}/segment/${segmentId}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_removed: isRemoved }),
            }
        );
        if (!response.ok) throw new ApiError(response.status, await response.text());
        const data = await response.json();
        return data.segment;
    }

    async submitTrim(projectId: string, outputPath: string): Promise<TrimJobDto> {
        const response = await fetch(`${this.baseUrl}/project/${projectId}/trim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ output_path: outputPath }),
        });
        if (!response.ok) throw new ApiError(response.status, await response.text());
        return response.json() as Promise<TrimJobDto>;
    }
}

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}
```

### FastAPI Routes (Python)

```python
# presentation/api/project_router.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from application.use_cases.load_project import LoadProjectUseCase

class LoadProjectRequest(BaseModel):
    video_path: str

class ProjectResponse(BaseModel):
    project_id: str
    duration_ms: int
    video_path: str

def build(load_use_case: LoadProjectUseCase) -> APIRouter:
    router = APIRouter(prefix="/project", tags=["project"])

    @router.post("/load", response_model=ProjectResponse)
    async def load_project(request: LoadProjectRequest):
        project = await load_use_case.execute(request.video_path)
        return ProjectResponse(
            project_id=str(project.id),
            duration_ms=project.duration_ms,
            video_path=str(project.source_path),
        )

    return router
```

---

## 6. Boundary C — Python → Frontend (WebSocket)

### When to use
**Long-running async operations** where you need real-time progress feedback: silence detection (can take 10-30s for 1hr video) and FFmpeg trim execution.

WebSocket is suggested because it gives you the option to connect to it with the frontend, and is well-suited for progress streaming scenarios.

### Why WebSocket over SSE (Server-Sent Events)?
SSE is one-directional (server → client only). WebSocket is bidirectional. For SilentCut, you might want to **cancel** a long-running job mid-stream — which requires sending a cancel message from client to server. SSE cannot do that. WebSocket can.

```
Python starts long job (detect/trim)
    │
    │  job_id returned immediately in HTTP response (non-blocking)
    │
    ▼
Frontend opens WebSocket connection to ws://localhost:18420/ws/progress/{job_id}
    │
    ◄── { "percent": 12.5, "message": "Processing 00:02:31...", "is_complete": false }
    ◄── { "percent": 45.0, "message": "Processing 00:12:14...", "is_complete": false }
    ◄── { "percent": 78.3, "message": "Processing 00:45:02...", "is_complete": false }
    ◄── { "percent": 100,  "message": "Done. 847 segments found.", "is_complete": true }
    │
    ──► { "type": "cancel" }   ← user can send cancel mid-stream
```

### WebSocket Client (TypeScript)

```typescript
// src/services/wsClient.ts

export interface ProgressEvent {
    percent: number;
    message: string;
    currentMs: number;
    isComplete: boolean;
    error: string | null;
}

export class ProgressSocket {
    private ws: WebSocket | null = null;
    private readonly url: string;

    constructor(jobId: string, port: number = 18420) {
        this.url = `ws://localhost:${port}/ws/progress/${jobId}`;
    }

    connect(
        onProgress: (event: ProgressEvent) => void,
        onComplete: (event: ProgressEvent) => void,
        onError: (error: Event) => void
    ): void {
        this.ws = new WebSocket(this.url);

        this.ws.onmessage = (event) => {
            const data: ProgressEvent = JSON.parse(event.data);
            if (data.error) {
                onError(new ErrorEvent('ws-error', { message: data.error }));
                return;
            }
            if (data.isComplete) {
                onComplete(data);
                this.disconnect();
            } else {
                onProgress(data);
            }
        };

        this.ws.onerror = onError;
    }

    cancel(): void {
        this.ws?.send(JSON.stringify({ type: 'cancel' }));
        this.disconnect();
    }

    disconnect(): void {
        this.ws?.close();
        this.ws = null;
    }
}
```

### WebSocket Server (Python)

```python
# presentation/ws/progress_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from application.use_cases.job_registry import JobRegistry
import asyncio
import json

router = APIRouter()

@router.websocket("/ws/progress/{job_id}")
async def progress_stream(websocket: WebSocket, job_id: str, registry: JobRegistry):
    await websocket.accept()
    job = registry.get(job_id)

    if not job:
        await websocket.send_json({"error": f"Job {job_id} not found"})
        await websocket.close()
        return

    try:
        # Subscribe to job progress events
        async for event in job.progress_stream():
            await websocket.send_json({
                "percent": event.percent,
                "message": event.message,
                "current_ms": event.current_ms,
                "is_complete": event.is_complete,
                "error": event.error,
            })

            # Check for cancel message from client (non-blocking)
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(), timeout=0.001
                )
                if data.get("type") == "cancel":
                    job.cancel()
                    break
            except asyncio.TimeoutError:
                pass  # No cancel message, continue streaming

            if event.is_complete:
                break

    except WebSocketDisconnect:
        job.cancel()  # User closed tab/window mid-job
```

---

## 7. Complete Data Flow: Auto Mode End-to-End

```
USER: Drops video file onto UI
──────────────────────────────────────────────────────

STEP 1: Get file path (Frontend → Rust)
  Frontend: await invoke('open_video_dialog')
  Rust:     opens native file picker
  Returns:  "/Users/me/Videos/rawvideo.mp4"

──────────────────────────────────────────────────────

STEP 2: Load project (Frontend → Python HTTP)
  POST http://localhost:18420/project/load
  Body: { "video_path": "/Users/me/Videos/rawvideo.mp4" }

  Python executes:
    1. ffprobe to read video duration and codec info
    2. Extracts audio track: ffmpeg -vn -ar 16000 -ac 1 → temp.wav
    3. Creates VideoProject entity
    4. Stores in InMemoryProjectRepository

  Returns: { "project_id": "uuid-abc", "duration_ms": 3600000 }

──────────────────────────────────────────────────────

STEP 3: Start detection (Frontend → Python HTTP)
  POST http://localhost:18420/project/uuid-abc/detect
  Body: { "mode": "auto", "config": { "threshold": 0.5, "min_silence_duration_ms": 1000 } }

  Python executes:
    1. Creates DetectSilenceJob, registers in JobRegistry
    2. Starts async background task (does NOT block HTTP response)
    3. Returns IMMEDIATELY with job_id

  Returns: { "job_id": "job-xyz", "status": "started" }

──────────────────────────────────────────────────────

STEP 4: Stream progress (Python → Frontend WebSocket)
  Frontend opens: ws://localhost:18420/ws/progress/job-xyz

  Background task runs:
    SileroVADAdapter.detect(audio_path)
    ← emits ProgressEvent every ~2 seconds

  WebSocket stream:
    { "percent": 0,   "message": "Starting VAD...",            "is_complete": false }
    { "percent": 18,  "message": "Analyzing 00:10:48...",      "is_complete": false }
    { "percent": 55,  "message": "Analyzing 00:33:00...",      "is_complete": false }
    { "percent": 89,  "message": "Analyzing 00:53:24...",      "is_complete": false }
    { "percent": 100, "message": "Found 312 silence segments", "is_complete": true  }

  Zustand store: setProcessing(false), setDetectionDone(true)
  UI: show "Trim" button

──────────────────────────────────────────────────────

STEP 5: Submit trim (Frontend → Python HTTP)
  POST http://localhost:18420/project/uuid-abc/trim
  Body: { "output_path": "/Users/me/Videos/rawvideo_trimmed.mp4" }

  Python executes:
    1. Creates TrimJob, registers in JobRegistry
    2. Starts background task
    3. Returns IMMEDIATELY with job_id

  Returns: { "job_id": "trim-001", "status": "started" }

──────────────────────────────────────────────────────

STEP 6: Stream trim progress (Python → Frontend WebSocket)
  Frontend opens: ws://localhost:18420/ws/progress/trim-001

  Background task runs:
    FFmpegCutter.cut(project, output_path)
    Generates concat segments → ffmpeg cut → ffmpeg concat
    ← emits ProgressEvent per segment cut

  WebSocket stream:
    { "percent": 0,   "message": "Preparing segments...",   "is_complete": false }
    { "percent": 34,  "message": "Cutting segment 108/312", "is_complete": false }
    { "percent": 67,  "message": "Cutting segment 213/312", "is_complete": false }
    { "percent": 100, "message": "Output saved.",           "is_complete": true  }

  UI: show "Open in Finder / Explorer" button

──────────────────────────────────────────────────────

USER: Clicks "Open output folder"
  Frontend: await invoke('open_in_file_manager', { path: outputPath })
  Rust: opens OS file manager at path
```

---

## 8. Complete Data Flow: Manual Mode Delta

Manual mode is identical to Auto up to Step 3. After detection, instead of going straight to trim:

```
STEP 3b: Fetch segments (Frontend → Python HTTP)
  GET http://localhost:18420/project/uuid-abc/segments

  Returns: {
    "segments": [
      { "id": "s-001", "start_ms": 0,    "end_ms": 4200,  "type": "speech",  "is_removed": false },
      { "id": "s-002", "start_ms": 4200, "end_ms": 7100,  "type": "silence", "is_removed": false },
      { "id": "s-003", "start_ms": 7100, "end_ms": 23000, "type": "speech",  "is_removed": false },
      ...
    ]
  }

──────────────────────────────────────────────────────

STEP 4b: User toggles segment (Frontend → Python HTTP)
  (User clicks a silence segment in the list)

  PATCH http://localhost:18420/project/uuid-abc/segment/s-002
  Body: { "is_removed": true }

  Python: ToggleSegmentUseCase → Segment.toggle() → repo.save()

  Returns: { "segment": { "id": "s-002", ..., "is_removed": true } }

  Zustand store: updateSegment(updatedSegment)
  UI: segment row shows strikethrough / greyed out

──────────────────────────────────────────────────────

  User reviews all segments, then clicks "Render"
  → continues to STEP 5 (same as Auto)
```

---

## 9. DTO Contracts (Shared Types)

These DTOs are the **contract** between Python and TypeScript. Both sides must agree on this schema.

### TypeScript DTOs

```typescript
// src/types/dtos.ts

export interface ProjectDto {
    project_id: string;
    duration_ms: number;
    video_path: string;
}

export interface DetectionJobDto {
    job_id: string;
    status: 'started' | 'running' | 'complete' | 'error';
}

export interface TrimJobDto {
    job_id: string;
    status: 'started' | 'running' | 'complete' | 'error';
}

export interface SegmentDto {
    id: string;
    start_ms: number;
    end_ms: number;
    type: 'speech' | 'silence';
    is_removed: boolean;
}

export interface ProgressEventDto {
    percent: number;
    message: string;
    current_ms: number;
    is_complete: boolean;
    error: string | null;
}

export interface DetectionConfig {
    threshold: number;           // 0.0 - 1.0, default 0.5
    min_silence_duration_ms: number; // default 1000
    speech_pad_ms: number;       // default 200
}
```

### Python DTOs (Pydantic)

```python
# presentation/schemas.py
from pydantic import BaseModel, Field
from typing import Literal

class LoadProjectRequest(BaseModel):
    video_path: str

class ProjectResponse(BaseModel):
    project_id: str
    duration_ms: int
    video_path: str

class DetectionConfig(BaseModel):
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    min_silence_duration_ms: int = Field(default=1000, ge=100)
    speech_pad_ms: int = Field(default=200, ge=0)

class DetectRequest(BaseModel):
    mode: Literal["auto", "manual"]
    config: DetectionConfig = DetectionConfig()

class JobResponse(BaseModel):
    job_id: str
    status: Literal["started", "running", "complete", "error"]

class SegmentResponse(BaseModel):
    id: str
    start_ms: int
    end_ms: int
    type: Literal["speech", "silence"]
    is_removed: bool

class SegmentsListResponse(BaseModel):
    segments: list[SegmentResponse]

class ToggleSegmentRequest(BaseModel):
    is_removed: bool

class TrimRequest(BaseModel):
    output_path: str

class ProgressEventMessage(BaseModel):
    percent: float
    message: str
    current_ms: int
    is_complete: bool
    error: str | None = None
```

---

## 10. Error Handling Across Boundaries

Each boundary has different error semantics. Do not mix them.

### Tauri IPC Errors (Frontend ↔ Rust)
```typescript
try {
    const path = await invoke<string>('open_video_dialog');
} catch (e) {
    // Rust returned Err(...) — user cancelled dialog, permission denied, etc.
    if (e === 'No file selected') return; // user cancelled — not an error
    console.error('Unexpected IPC error:', e);
}
```

### HTTP Errors (Frontend ↔ Python)
```typescript
// In ApiClient: throw ApiError on non-2xx
// In components: catch ApiError, show toast notification

try {
    const project = await apiClient.loadProject(videoPath);
} catch (e) {
    if (e instanceof ApiError) {
        if (e.status === 422) toast.error('Invalid video file format');
        else if (e.status === 500) toast.error('Processing error: ' + e.message);
    }
}
```

### WebSocket Errors (Python → Frontend)
```typescript
// In ProgressSocket: error can arrive in-band (JSON with error field)
// or as a WebSocket protocol error (ws.onerror)

progressSocket.connect(
    onProgress: (event) => store.updateProgress(event),
    onComplete: (event) => { store.setDone(); progressSocket.disconnect(); },
    onError: (err) => {
        store.setError('Job failed. See logs.');
        progressSocket.disconnect();
    }
);
```

### Python Internal Errors (Use Case layer)
```python
# Use cases raise domain exceptions, not HTTP exceptions
# The presentation layer (router) converts them

from fastapi import HTTPException

@router.post("/project/load")
async def load_project(request: LoadProjectRequest):
    try:
        project = await load_use_case.execute(request.video_path)
        return ProjectResponse(...)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidVideoFormatError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal processing error")
```

---

## 11. Sidecar Readiness & Port Discovery

A common failure: frontend sends HTTP request before Python has finished booting. Fix with a readiness handshake:

```rust
// Rust: watch sidecar stdout for startup signal
tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                // FastAPI prints this on startup
                if line.contains("Application startup complete") {
                    app_handle.emit("sidecar-ready", json!({ "port": 18420 })).ok();
                }
            }
            CommandEvent::Error(e) => {
                app_handle.emit("sidecar-error", json!({ "error": e })).ok();
            }
            _ => {}
        }
    }
});
```

```typescript
// Frontend: gate all API calls behind readiness
const { isReady, setReady } = useProjectStore();

useEffect(() => {
    const setup = async () => {
        const unlisten = await listen<{ port: number }>('sidecar-ready', () => {
            setReady(true);
        });
        return unlisten;
    };
    const cleanup = setup();
    return () => { cleanup.then(fn => fn()); };
}, []);

// Disable all controls until isReady === true
```

---

## 12. Summary: Which Protocol Does What

```
┌─────────────────────────────────────────────────────────────────────┐
│  OPERATION               │ PROTOCOL        │ INITIATOR → RECEIVER   │
├─────────────────────────────────────────────────────────────────────┤
│  Open file dialog        │ Tauri IPC       │ Frontend → Rust         │
│  Sidecar ready signal    │ Tauri IPC Event │ Rust → Frontend         │
│  Open output folder      │ Tauri IPC       │ Frontend → Rust         │
│  App close cleanup       │ Tauri IPC Event │ Rust → Frontend         │
├─────────────────────────────────────────────────────────────────────┤
│  Load video project      │ HTTP POST       │ Frontend → Python       │
│  Start detection job     │ HTTP POST       │ Frontend → Python       │
│  Get segments list       │ HTTP GET        │ Frontend → Python       │
│  Toggle segment          │ HTTP PATCH      │ Frontend → Python       │
│  Submit trim job         │ HTTP POST       │ Frontend → Python       │
├─────────────────────────────────────────────────────────────────────┤
│  Detection progress      │ WebSocket       │ Python → Frontend       │
│  Trim progress           │ WebSocket       │ Python → Frontend       │
│  Cancel running job      │ WebSocket msg   │ Frontend → Python       │
├─────────────────────────────────────────────────────────────────────┤
│  Spawn Python process    │ OS process API  │ Rust → Python           │
│  Kill Python process     │ OS process API  │ Rust → Python           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 13. Port & Bundling Notes

**Port selection:** `18420` is chosen to avoid conflicts with common development ports (3000, 8000, 8080, 5173). In production bundle, this is hardcoded. Do not make it configurable in V1 — unnecessary complexity.

**CORS:** FastAPI must allow localhost origin:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420",  # Tauri dev server
                   "tauri://localhost"],       # Tauri production WebView
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**PyInstaller bundle:** Python binary must include all dependencies. Use `--onedir` not `--onefile` to avoid slow cold-start extraction. Tauri bundles the entire `dist/` folder of PyInstaller output.

---

*Communication Blueprint v1.0 — SilentCut*