use std::path::Path;
use std::sync::atomic::Ordering;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use crate::scan_state::ScanState;
use crate::scanner::{scan_directory, FileNode};
use crate::duplicates::{DuplicateGroup, find_duplicate_groups};
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

#[tauri::command]
pub async fn find_duplicates(path: String) -> Result<Vec<DuplicateGroup>, String> {
    if !Path::new(&path).exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    tauri::async_runtime::spawn_blocking(move || find_duplicate_groups(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn list_dir(path: String) -> Vec<String> {
    let p = std::path::Path::new(&path);

    let (dir, prefix) = if path.ends_with('/') || path.ends_with(std::path::MAIN_SEPARATOR) {
        (p.to_path_buf(), String::new())
    } else {
        match p.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => (
                parent.to_path_buf(),
                p.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string(),
            ),
            _ => (p.to_path_buf(), String::new()),
        }
    };

    let Ok(entries) = std::fs::read_dir(&dir) else {
        return vec![];
    };

    let show_hidden = prefix.starts_with('.');
    let prefix_lower = prefix.to_lowercase();

    let mut results: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let name_str = name.to_str().unwrap_or("");
            if !show_hidden && name_str.starts_with('.') {
                return false;
            }
            if prefix_lower.is_empty() {
                true
            } else {
                name_str.to_lowercase().starts_with(&prefix_lower)
            }
        })
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            if meta.is_dir() || meta.file_type().is_symlink() {
                e.path().to_str().map(|s| s.to_string())
            } else {
                None
            }
        })
        .take(20)
        .collect();

    results.sort();
    results
}
