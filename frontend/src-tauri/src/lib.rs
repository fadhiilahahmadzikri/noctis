use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent};

#[derive(Default)]
pub struct LaunchFile(pub Mutex<Option<String>>);

#[tauri::command]
fn get_launch_file(state: tauri::State<LaunchFile>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LaunchFile::default())
        .invoke_handler(tauri::generate_handler![get_launch_file])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Second instance: forward file path to first instance
            if let Some(path) = argv.get(1) {
                if path.ends_with(".lethe") {
                    let _ = app.emit("file-opened", path.clone());
                }
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            // Cold start: check argv for .lethe file
            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = args.get(1).filter(|p| p.ends_with(".lethe")) {
                *app.state::<LaunchFile>().0.lock().unwrap() = Some(path.clone());
            }

            // Emit sidecar-ready after short delay (backend started externally in dev)
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                let _ = handle.emit("sidecar-ready", serde_json::json!({"port": 18420}));
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // macOS: file opened via Apple Events
            if let RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .filter_map(|p| p.to_str().map(String::from))
                    .filter(|p| p.ends_with(".lethe"))
                    .collect();
                if let Some(path) = paths.first() {
                    let _ = app.emit("file-opened", path.clone());
                }
            }
        });
}
