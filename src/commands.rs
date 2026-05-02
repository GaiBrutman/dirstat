use std::path::Path;
use std::sync::atomic::Ordering;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use crate::scan_state::ScanState;
use crate::scanner::{scan_directory, FileNode};
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize, Clone)]
pub struct ScanProgressPayload {
    pub count: u64,
    pub current_path: String,
}

#[tauri::command]
pub async fn scan(
    path: String,
    app: AppHandle,
    state: State<'_, ScanState>,
) -> Result<FileNode, String> {
    if path.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    if !Path::new(&path).exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    state.cancel.store(false, Ordering::SeqCst);
    state.counter.store(0, Ordering::SeqCst);

    let cancel = state.cancel.clone();
    let counter = state.counter.clone();

    tauri::async_runtime::spawn_blocking(move || {
        scan_directory(&path, &cancel, &counter, &|count, current_path| {
            let _ = app.emit("scan_progress", ScanProgressPayload {
                count,
                current_path: current_path.to_string(),
            });
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, ScanState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_in_explorer(path: String, app: AppHandle) -> Result<(), String> {
    app.opener().reveal_item_in_dir(&path).map_err(|e| e.to_string())
}
