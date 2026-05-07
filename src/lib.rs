mod scanner;
mod commands;
mod scan_state;
mod duplicates;

use scan_state::ScanState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ScanState::default())
        .invoke_handler(tauri::generate_handler![
            commands::scan,
            commands::cancel_scan,
            commands::move_to_trash,
            commands::open_in_explorer,
            commands::find_duplicates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
