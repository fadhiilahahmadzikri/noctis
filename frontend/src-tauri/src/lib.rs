use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

#[derive(Default)]
pub struct LaunchFile(pub Mutex<Option<String>>);

struct SidecarChild(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

#[tauri::command]
fn get_launch_file(state: tauri::State<LaunchFile>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LaunchFile::default())
        .manage(SidecarChild(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_launch_file])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = argv.get(1) {
                if path.ends_with(".Noctis") {
                    let _ = app.emit("file-opened", path.clone());
                }
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            // Cold start: check argv for .Noctis file
            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = args.get(1).filter(|p| p.ends_with(".Noctis")) {
                *app.state::<LaunchFile>().0.lock().unwrap() = Some(path.clone());
            }

            // Spawn sidecar backend
            let handle = app.handle().clone();
            let (mut rx, child) = app
                .shell()
                .sidecar("Noctis-server")
                .expect("failed to create sidecar")
                .spawn()
                .expect("failed to spawn sidecar");

            // Store child for cleanup
            *app.state::<SidecarChild>().0.lock().unwrap() = Some(child);

            // Watch stdout for ready signal
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line) = event {
                        let text = String::from_utf8_lossy(&line);
                        if text.contains("Application startup complete") {
                            let _ = handle.emit("sidecar-ready", serde_json::json!({"port": 18420}));
                            break;
                        }
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                // Kill sidecar on exit
                if let Some(child) = app.state::<SidecarChild>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
