use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();

            let (mut rx, child) = app
                .shell()
                .sidecar("lethe-server")
                .expect("failed to create sidecar command")
                .spawn()
                .expect("failed to spawn sidecar");

            // Store child for cleanup
            let state = handle.state::<SidecarState>();
            *state.child.lock().unwrap() = Some(child);

            // Watch stdout for ready signal
            let app_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let text = String::from_utf8_lossy(&line);
                            if text.contains("Application startup complete") {
                                let _ = app_handle
                                    .emit("sidecar-ready", serde_json::json!({"port": 18420}));
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[sidecar] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[sidecar] terminated: {:?}", payload.code);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<SidecarState>();
                if let Some(child) = state.child.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
