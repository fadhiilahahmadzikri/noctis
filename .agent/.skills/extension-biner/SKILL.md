---
name: file-association-desktop
description: >
  Apply this skill whenever the user wants their desktop app to open when a user double-clicks
  a file, register a custom file extension with the OS, implement "Open With" context menu
  behavior, or make their app behave like Adobe Premiere (.prproj), VS Code (.code-workspace),
  CapCut, Figma, or Microsoft Word (.docx). Trigger on phrases like: "double-click opens my
  app", "custom file extension", "project file format", "open with", "file association",
  "register extension", "open workspace from file", ".myext opens the app", "like Premiere Pro",
  "like CapCut project file". Also trigger when the user wants their Tauri or Electron app to
  receive a file path on startup. This skill covers the full cross-platform implementation
  including OS registry mechanics, Tauri v2 config, Rust handler, single-instance plugin,
  cold-start vs hot-open distinction, and custom project file format design.
---

# File Association for Desktop Apps

## What This Is

**File Association** is an OS-level feature that maps a file extension to an application.
When a user double-clicks `myproject.Noctis`, the OS launches the registered binary with the
file path as an argument. This is how every major creative tool works:

| App | Extension | Behavior |
|---|---|---|
| Adobe Premiere Pro | `.prproj` | Opens project workspace |
| CapCut | `.capcut` | Opens video project |
| VS Code | `.code-workspace` | Opens workspace with settings |
| Figma (desktop) | `.fig` | Opens design file |
| Microsoft Word | `.docx` | Opens document |
| Obsidian | `.md` in vault | Opens note in vault |

---

## How Each OS Delivers the File Path

This is the most important thing to understand. The mechanism differs by platform.

### Windows & Linux — CLI argument

The OS spawns a **new process** with the file path as `argv[1]`:
```
Noctis.exe "C:\Users\User\Documents\myproject.Noctis"
```

**Problem**: If the app is already running, Windows spawns a second instance.
**Solution**: `tauri-plugin-single-instance` intercepts the second process and forwards
`argv[1]` to the already-running instance, then exits.

### macOS — Apple Events (`RunEvent::Opened`)

The OS sends a `NSOpenFiles` Apple Event to the app, not a new process.
Tauri exposes this as `RunEvent::Opened { urls }`.
No second-instance problem on macOS.

---

## Project File Format Design

Design the `.yourext` file as a portable, self-describing JSON or TOML manifest.
It must NOT contain absolute paths to app internals — only user-controlled asset paths.

```json
{
  "version": 1,
  "app": "Noctis",
  "created_at": 1716739200,
  "video_path": "relative/path/or/absolute/user/path.mkv",
  "trim_points": [{ "start_ms": 1000, "end_ms": 5000 }],
  "captions": [],
  "export_settings": { "format": "mp4", "quality": "high" }
}
```

Rules:
- `version` field is mandatory — you will need schema migrations.
- Store user asset paths as provided; do not canonicalize to machine-specific paths.
- The file is the sharable, portable unit. A user should be able to copy it to another machine.
- App state (window position, recent files, theme) lives in SQLite, not in the project file.

---

## Tauri v2 Implementation

### Step 1 — `tauri.conf.json`: declare the association

```json
{
  "bundle": {
    "fileAssociations": [
      {
        "ext": ["Noctis"],
        "name": "Noctis Project",
        "description": "Noctis video project file",
        "mimeType": "application/x-Noctis-project",
        "role": "Editor"
      }
    ],
    "windows": {
      "nsis": {
        "installerHooks": "./windows/hooks.nsi"
      }
    }
  }
}
```

### Step 2 — Windows NSIS hook (required for Windows installer registration)

Download `FileAssociation.nsh` from the NSIS contrib repository and place it in
`src-tauri/windows/`. Then create `src-tauri/windows/hooks.nsi`:

```nsi
!include "FileAssociation.nsh"

!macro NSIS_HOOK_POSTINSTALL
  ${registerExtension} "$INSTDIR\your-app.exe" ".Noctis" "Noctis_Project"
!macroend

!macro NSIS_HOOK_UNINSTALL
  ${unregisterExtension} ".Noctis" "Noctis_Project"
!macroend
```

### Step 3 — `Cargo.toml`: add single-instance plugin

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-single-instance = "2"
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Step 4 — `src/lib.rs`: full handler

```rust
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, RunEvent};

#[derive(Default)]
pub struct LaunchFile(pub Mutex<Option<String>>);

#[tauri::command]
fn get_launch_file(state: tauri::State<LaunchFile>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn load_project_file(path: String) -> Result<serde_json::Value, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&content)
        .map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(LaunchFile::default())
        .invoke_handler(tauri::generate_handler![get_launch_file, load_project_file])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Second instance spawned (Windows): forward file path to first instance
            if let Some(path) = argv.get(1) {
                if path.ends_with(".Noctis") {
                    app.emit("file-opened", path.clone()).ok();
                }
            }
            // Bring existing window to front
            if let Some(window) = app.get_webview_window("main") {
                window.set_focus().ok();
            }
        }))
        .setup(|app| {
            // Cold start on Windows/Linux: file path in argv[1]
            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = args.get(1).filter(|p| p.ends_with(".Noctis")) {
                *app.state::<LaunchFile>().0.lock().unwrap() = Some(path.clone());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // macOS cold start and hot open: Apple Events
            if let RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .filter_map(|p| p.to_str().map(String::from))
                    .filter(|p| p.ends_with(".Noctis"))
                    .collect();
                if let Some(path) = paths.first() {
                    // Try to emit to running frontend; store for cold start fallback
                    if app.emit("file-opened", path.clone()).is_err() {
                        *app.state::<LaunchFile>().0.lock().unwrap() = Some(path.clone());
                    }
                }
            }
        });
}
```

### Step 5 — `capabilities/default.json`: add single-instance permission

```json
{
  "permissions": [
    "core:default",
    "fs:allow-read-file",
    "fs:default",
    "single-instance:allow-get",
    "dialog:allow-open"
  ]
}
```

### Step 6 — Frontend: handle both cold-start and hot-open

```typescript
// hooks/useFileAssociation.ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

export function useFileAssociation(
  onOpen: (path: string) => void
): void {
  useEffect(() => {
    // Cold start: app was launched by double-clicking a file
    invoke<string | null>("get_launch_file").then((path) => {
      if (path) onOpen(path);
    });

    // Hot open: app already running when file was double-clicked
    const unlistenPromise = listen<string>("file-opened", (event) => {
      onOpen(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);
}
```

```typescript
// App.tsx
import { useFileAssociation } from "./hooks/useFileAssociation";
import { invoke } from "@tauri-apps/api/core";

export function App() {
  const { setProject } = useProjectStore();

  useFileAssociation(async (path: string) => {
    const projectData = await invoke<ProjectFile>("load_project_file", { path });
    setProject(projectData, path);
  });

  return <Workspace />;
}
```

---

## The Two Opening Scenarios

You must handle both. Failing to handle cold-start means double-click from file explorer
launches the app but ignores the file. Failing to handle hot-open means a second double-click
on a different file does nothing.

| Scenario | What happens | How it arrives |
|---|---|---|
| **Cold start** | App not running; user double-clicks file | `argv[1]` (Win/Linux) or `RunEvent::Opened` before window ready (macOS) |
| **Hot open** | App already running; user double-clicks another file | `single-instance` callback forwards argv → `emit("file-opened", path)` (Win/Linux) or `RunEvent::Opened` at runtime (macOS) |

---

## Registration Only Takes Effect After Install

File associations are registered by the **installer**, not by the binary itself.
Running `cargo tauri dev` does NOT register the extension.
You must run `cargo tauri build` → run the installer → then test double-click.

To iterate quickly: use Windows Sandbox, copy the installer in, install, test, tear down.

---

## Anti-Patterns

1. **Reading argv without filtering**: `argv[0]` is the binary path itself. `argv[1]` may not
   exist (user launched from start menu, not from file). Always bounds-check and validate
   the extension before treating it as a project file.

2. **Emitting `file-opened` before the webview is ready**: On cold start, the frontend
   hasn't mounted its listeners yet. Store the path in `LaunchFile` state and let the
   frontend fetch it via `invoke("get_launch_file")` after mounting.

3. **Not unregistering on uninstall**: The NSIS hook must include `NSIS_HOOK_UNINSTALL`.
   Orphaned registry entries cause "Windows cannot open this file" errors after uninstall.

4. **Storing absolute machine-specific paths in the project file**: The `.Noctis` file should
   be portable. Store paths relative to the project file or as user-provided originals.

5. **Skipping single-instance plugin on Windows**: Without it, double-clicking three files
   launches three separate app instances, each thinking it owns the session.