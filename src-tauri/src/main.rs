#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use mousesniff::{Database, MouseRawData, RawInputPlugin};
use std::sync::{Arc, Mutex};
use tauri::{DeviceEventFilter, State};

#[tauri::command]
fn log_restart(state: State<Arc<Mutex<Database>>>) {
    let mut db = state.lock().unwrap();
    db.restart();
}

#[tauri::command]
fn get_mouse_data(state: State<Arc<Mutex<Database>>>) -> Vec<MouseRawData> {
    let s = (*state).clone();
    let data = s.lock().unwrap().get_mouse_data();
    data
}

fn main() {
    let database = Arc::new(Mutex::new(Database::new()));
    let mut app = tauri::Builder::default()
        .manage(database.clone())
        .invoke_handler(tauri::generate_handler![log_restart, get_mouse_data])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");
    // app.set_device_event_filter(DeviceEventFilter::Never);
    app.set_device_event_filter(DeviceEventFilter::Unfocused);
    app.wry_plugin(RawInputPlugin::new(database.clone()));
    app.run(|_, _| {})
}
