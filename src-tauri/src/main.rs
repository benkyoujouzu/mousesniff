#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    sync::{Arc, Mutex},
    thread::JoinHandle,
    time::SystemTime,
};
use tao::{
    self,
    event::{DeviceEvent, Event},
    event_loop::{ControlFlow, DeviceEventFilter, EventLoop},
    platform::windows::EventLoopExtWindows,
};
use tauri::State;

#[tauri::command]
fn log_restart(state: State<Arc<Mutex<Database>>>) {
    let mut db = state.lock().unwrap();
    db.restart();
}

#[tauri::command]
fn log_mouse_event(state: State<Arc<Mutex<Database>>>) {
    let s = (*state).clone();
    {
        let db = s.lock().unwrap();
        if let Some(_h) = db.get_log_thread() {
            return;
        }
    }
    let handle = std::thread::spawn(move || {
        let event_loop: EventLoop<()> = EventLoop::new_any_thread();
        event_loop.set_device_event_filter(DeviceEventFilter::Never);

        event_loop.run(move |event, _, control_flow| {
            *control_flow = ControlFlow::Wait;
            match event {
                Event::DeviceEvent {
                    device_id: _,
                    event,
                    ..
                } => match event {
                    DeviceEvent::MouseMotion {
                        delta: (dx, dy), ..
                    } => {
                        let mut db = s.lock().unwrap();
                        let t = db.get_log_start_time().elapsed().unwrap().as_micros() as i64;
                        let mevent = MouseRawData {
                            dx: dx as i32,
                            dy: dy as i32,
                            t,
                        };
                        db.push_mouse_data(mevent);
                    }
                    _ => (),
                },
                _ => (),
            };
            ()
        });
    });

    let mut db = (*state).lock().unwrap();
    db.set_log_thread(handle);
}

#[tauri::command]
fn get_mouse_data(state: State<Arc<Mutex<Database>>>) -> Vec<MouseRawData> {
    let s = (*state).clone();
    let data = s.lock().unwrap().get_mouse_data();
    data
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
struct MouseRawData {
    t: i64,
    dx: i32,
    dy: i32,
}

struct Database {
    mouse_data: Vec<MouseRawData>,
    log_start_time: SystemTime,
    log_thread: Option<JoinHandle<()>>,
}

impl Database {
    fn new() -> Self {
        Database {
            mouse_data: Vec::with_capacity(10000),
            log_start_time: SystemTime::now(),
            log_thread: None,
        }
    }

    fn push_mouse_data(&mut self, d: MouseRawData) {
        let data = &mut self.mouse_data;
        data.push(d);
    }

    fn get_mouse_data(&mut self) -> Vec<MouseRawData> {
        let data = Vec::from(self.mouse_data.clone());
        self.mouse_data.clear();
        data
    }

    fn restart(&mut self) {
        self.mouse_data.clear();
        self.log_start_time = SystemTime::now();
    }

    fn get_log_start_time(&self) -> SystemTime {
        self.log_start_time.clone()
    }

    fn get_log_thread(&self) -> &Option<JoinHandle<()>> {
        &self.log_thread
    }

    fn set_log_thread(&mut self, h: JoinHandle<()>) {
        self.log_thread = Some(h);
    }
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Arc::new(Mutex::new(Database::new())))
        .invoke_handler(tauri::generate_handler![
            log_mouse_event,
            log_restart,
            get_mouse_data
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");
    app.run(|_, _| {})
}
