---
name: local-first-desktop
description: >
  Apply this skill whenever the user is building, designing, or reviewing a desktop application
  that should behave like industry-standard software (Word, Figma, VS Code, Obsidian, DaVinci
  Resolve). Trigger on any of: "desktop app", "Tauri", "Electron", "packaged as .exe/.dmg/.deb",
  "bundle backend", "sidecar", "offline", "local storage", "user data", "history persisted
  locally", "no server dependency", "self-contained installer", "SQLite", or when the user
  complains that their app sends local paths to a remote server. Also trigger when an AI agent
  has generated code that routes local file operations through an external hosted server when
  it should not. This skill enforces the Local-First paradigm as the architectural default for
  all desktop applications — storage, state, history, and processing belong on the user's
  machine unless there is a concrete, irreducible reason for an external network call.
---

# Local-First Desktop Architecture

## Core Paradigm

Local-First software treats the user's device as the primary runtime and the primary data store.
The network is an optional enhancement, never a dependency for core functionality.

The original Ink & Switch definition: **"You own your data, in spite of the cloud."**

Operational translation for desktop apps:

> If the user unplugs their Ethernet cable right now, every core feature of this application
> must continue to work identically.

This is not a network resilience feature. It is the foundational design contract.

---

## The Decision Gate: Local vs External

Apply this gate to every component, every data write, every API call you design.

### Stays Local — No Exceptions

| Concern | Local mechanism |
|---|---|
| User documents, projects, media files | Filesystem under user-controlled path |
| Application state (recent files, window layout, preferences) | SQLite or JSON in OS app data dir |
| History, undo/redo stacks, version snapshots | SQLite with append-only log |
| Thumbnails, waveforms, preview caches | Local cache dir, regenerable on demand |
| Processing results (transcripts, renders, exports) | Filesystem adjacent to source file |
| Search indices | SQLite FTS5 or local vector store |
| Logs, telemetry (if any) | Local rotating log files; upload is opt-in only |

### Legitimately Requires External Network

A network call is justified **only** when the operation is categorically impossible without it:

| Justified external call | Reason it cannot be local |
|---|---|
| Remote AI inference (e.g. GPT-4, Claude, Whisper on HF) | Model too large to bundle; requires paid API |
| License validation | Authenticity cannot be self-certified |
| Cloud backup / cross-device sync | User explicitly opted in; canonical store is elsewhere |
| Collaboration / multiplayer | Real-time shared state across machines |
| App update check | Binary lives on remote CDN |
| Third-party OAuth | Identity provider is external by definition |

**Everything else is local. If you are routing a local file path to a remote server to do something
a local process could do, that is an architectural defect, not a design choice.**

---

## Storage Architecture

### Primary Store: SQLite

SQLite is the correct database for desktop apps. It is what Obsidian, Firefox, Signal, and
Xcode use for local state.

```
$APP_DATA/
  app.db           ← main SQLite database (projects, metadata, history)
  cache.db         ← ephemeral derived data (thumbnails, indices)

$USER_DOCUMENTS/
  MyProject/
    project.json   ← project manifest (portable, human-readable)
    assets/        ← raw user files
    exports/       ← output artifacts
```

Schema design rules:
- Every write is durably committed before the UI confirms it.
- History tables use append-only rows; never UPDATE history rows.
- Soft-delete with `deleted_at` timestamp; never hard DELETE user data.
- `created_at` and `updated_at` on every entity table, stored as Unix epoch integers.

### App Data Path by OS

```python
# Python / sidecar backend
import platformdirs
APP_NAME = "YourApp"
data_dir   = platformdirs.user_data_dir(APP_NAME)    # %APPDATA%\YourApp | ~/.local/share/YourApp
cache_dir  = platformdirs.user_cache_dir(APP_NAME)   # %LOCALAPPDATA%\YourApp\cache | ~/.cache/YourApp
config_dir = platformdirs.user_config_dir(APP_NAME)  # same as data on Windows; ~/.config/YourApp on Linux
```

```typescript
// Tauri frontend
import { appDataDir, appCacheDir } from "@tauri-apps/api/path";
const dataDir  = await appDataDir();
const cacheDir = await appCacheDir();
```

Never hardcode paths. Never use the project source directory as a data directory.

---

## Bundled Sidecar Backend Pattern (Tauri + Python/Node)

When the backend is a compiled or packaged sidecar binary, the Tauri app owns its lifecycle.
The user never sees it. It starts when the app starts; it dies when the app exits.

### Directory Layout

```
my-app/
  frontend/                    ← Tauri + React/Vue/Svelte
    src-tauri/
      tauri.conf.json
      Cargo.toml
      capabilities/default.json
      binaries/
        my-backend-x86_64-pc-windows-msvc.exe   ← compiled sidecar
        my-backend-x86_64-unknown-linux-gnu
        my-backend-aarch64-apple-darwin
  backend/                     ← FastAPI / Axum / Hono source
    main.py (or main.rs / index.ts)
    build.sh                   ← produces the binary above
```

### Tauri Sidecar Config

```json
// tauri.conf.json — externalBin registers the sidecar
{
  "bundle": {
    "externalBin": ["binaries/my-backend"]
  }
}
```

```json
// capabilities/default.json
{
  "permissions": [
    "core:default",
    "shell:allow-execute",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        { "name": "binaries/my-backend", "sidecar": true, "args": true }
      ]
    },
    "fs:allow-read-file",
    "fs:allow-write-file",
    "fs:default"
  ]
}
```

```typescript
// lib.ts — sidecar lifecycle
import { Command } from "@tauri-apps/plugin-shell";

let sidecarProcess: ReturnType<typeof Command.sidecar> | null = null;

export async function startBackend(): Promise<void> {
  const dataDir = await appDataDir();
  const cmd = Command.sidecar("binaries/my-backend", ["--data-dir", dataDir]);
  sidecarProcess = cmd;
  await cmd.spawn();
}
```

The backend receives `--data-dir` at startup. It writes **all** state there. It never assumes
a remote database exists.

### Backend Startup Contract

```python
# FastAPI example — backend/main.py
import argparse
import sqlite3
from pathlib import Path
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--port", type=int, default=18420)
    return parser.parse_args()

args = parse_args()
DATA_DIR = Path(args.data_dir)
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "app.db"

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(DB_PATH)
    yield

app = FastAPI(lifespan=lifespan)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=args.port)
```

Rules:
- Bind to `127.0.0.1` only. Never `0.0.0.0` for a local sidecar.
- Use a random or configurable port; detect port conflicts.
- Expose a `/health` endpoint; frontend polls it before making other calls.

---

## File Upload Anti-Pattern vs Correct Pattern

### Wrong (what the Kiro agent produced)

```
User picks file → frontend sends local path to remote server → server tries to open it → 404
```

The remote server has no access to the user's filesystem. This is a category error.

### Correct for Remote-Processing Apps (unavoidable network)

```
User picks file
  → Tauri fs plugin reads bytes from local disk
  → Frontend uploads bytes via multipart POST to remote server
  → Server processes and returns result
  → Result saved locally (not kept on server indefinitely)
```

### Correct for Local-Processing Apps (preferred)

```
User picks file
  → Tauri fs plugin reads file info (size, duration, etc.)
  → Sidecar backend processes file IN PLACE from its path
  → Results written to local DB and local output dir
  → No bytes leave the machine
```

The sidecar has full local filesystem access. Pass the **path** to the sidecar; the sidecar
reads the file directly. The frontend never needs to upload anything to the sidecar — the
sidecar is already on the same machine.

```typescript
// Frontend → sidecar: pass path, not bytes
const result = await fetch(`http://127.0.0.1:18420/project/load`, {
  method: "POST",
  body: JSON.stringify({ file_path: selectedPath }),   // path, not file bytes
  headers: { "Content-Type": "application/json" }
});
```

---

## What Determines Whether Heavy Compute Stays Local or Goes Remote

Ask one question: **Can a reasonable user's machine handle this without degrading the UX?**

| Operation | Local if | Remote if |
|---|---|---|
| Video trim / cut | Always (ffmpeg binary bundled) | Never |
| Speech-to-text | Model ≤ 1 GB and user opted in to download | Model is too large or user explicitly chose cloud |
| Image classification | Model ≤ 200 MB bundled | Model requires GPU cluster |
| LLM inference | Ollama / llama.cpp, if user installed it | Model requires >16 GB VRAM |
| Database queries | Always local (SQLite) | Requires cross-device sync |

Bundle lightweight models (Whisper tiny/base, Silero VAD, ONNX classifiers) as sidecar assets.
Provide cloud inference as an opt-in fallback, not the default.

---

## Packaging Checklist

Before bundling an installer, verify:

- [ ] App launches and is fully functional with no internet connection
- [ ] All user data writes go to `appDataDir()` or `appCacheDir()`, not source tree
- [ ] Sidecar binary is listed in `externalBin` and included in bundle
- [ ] Backend binds to `127.0.0.1`, not `0.0.0.0`
- [ ] SQLite `app.db` is created on first run in the data dir, not shipped pre-populated
- [ ] App gracefully handles sidecar startup failure (retry, error UI, not silent hang)
- [ ] No hardcoded `/tmp` or `C:\Users\<hardcoded username>\` paths anywhere
- [ ] Remote calls (if any) fail gracefully; core features still work when they fail
- [ ] App icon is set in `tauri.conf.json` `bundle.icon` before building installer

---

## Anti-Patterns to Flag Immediately

These are architectural defects that must be corrected, not accepted:

1. **Remote path assumption** — Backend on a remote server receiving a local filesystem path.
2. **Cloud-mandatory CRUD** — Basic create/read/update/delete routed through Supabase/Firebase
   for a single-user desktop app with no collaboration feature.
3. **No local persistence** — App state lost on restart; everything re-fetched from server.
4. **Data directory hardcoded** — `./data/` relative to working directory instead of OS app dir.
5. **Sidecar bound to 0.0.0.0** — Local backend accessible from the network, not just localhost.
6. **Upload-then-process for local compute** — Sending file bytes to a server for processing
   that a bundled binary (ffmpeg, SQLite, ONNX runtime) could do locally.
7. **Supabase/Postgres as primary store for single-user app** — SQLite is the correct choice;
   a full RDBMS server is operational overhead with zero benefit for a desktop-local data model.

---

## Reference Stack by Use Case

| App type | Storage | Compute | Sync (opt-in) |
|---|---|---|---|
| Media editor (video/audio) | SQLite + filesystem | bundled ffmpeg sidecar | none or cloud backup |
| Note-taking / writing | SQLite (with FTS5) | local | optional CRDT sync |
| AI tool (local inference) | SQLite | Ollama / ONNX sidecar | API key for cloud fallback |
| AI tool (remote inference) | SQLite | remote API | inherent |
| Data analysis | SQLite / DuckDB | sidecar (Python/Rust) | none |
| Password manager | SQLite (encrypted) | local | optional end-to-end encrypted sync |
