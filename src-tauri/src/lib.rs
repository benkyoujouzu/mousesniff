use std::{sync::{Arc, Mutex}, time::SystemTime};

use tao::{
    self,
    event::{DeviceEvent, Event},
    event_loop::{ControlFlow, EventLoopProxy, EventLoopWindowTarget},
};
use tauri_runtime_wry::{Context, EventLoopIterationContext, Message, Plugin, PluginBuilder, WebContextStore};
use tauri_runtime::UserEvent;

#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct MouseRawData {
    t: i64,
    dx: i32,
    dy: i32,
}

pub struct Database {
    mouse_data: Vec<MouseRawData>,
    log_start_time: SystemTime,
}

impl Database {
    pub fn new() -> Self {
        Database {
            mouse_data: Vec::with_capacity(10000),
            log_start_time: SystemTime::now(),
        }
    }

    fn push_mouse_data(&mut self, d: MouseRawData) {
        let data = &mut self.mouse_data;
        data.push(d);
    }

    pub fn get_mouse_data(&mut self) -> Vec<MouseRawData> {
        let data = Vec::from(self.mouse_data.clone());
        self.mouse_data.clear();
        data
    }

    pub fn restart(&mut self) {
        self.mouse_data.clear();
        self.log_start_time = SystemTime::now();
    }

    fn get_log_start_time(&self) -> SystemTime {
        self.log_start_time.clone()
    }

}
pub struct RawInputPlugin {
    database: Arc<Mutex<Database>>,
}

impl RawInputPlugin {
    pub fn new(database: Arc<Mutex<Database>>) -> Self {
        Self {database}
    }
}

impl<T: UserEvent> Plugin<T> for RawInputPlugin {
    fn on_event(
        &mut self,
        event: &Event<Message<T>>,
        _event_loop: &EventLoopWindowTarget<Message<T>>,
        _proxy: &EventLoopProxy<Message<T>>,
        _control_flow: &mut ControlFlow,
        _context: EventLoopIterationContext<'_, T>,
        _web_context: &WebContextStore,
    ) -> bool {
        match event {
            Event::DeviceEvent {
                event:
                    DeviceEvent::MouseMotion {
                        delta: (dx, dy), ..
                    },
                ..
            } => {
                let database_ref = self.database.clone();
                let mut database = database_ref.lock().unwrap();
                let t = database.get_log_start_time().elapsed().unwrap().as_micros() as i64;
                database.push_mouse_data(MouseRawData { t, dx: *dx as i32, dy: *dy as i32});
                // println!("dx: {}, dy: {}", dx, dy);
                false
            }
            _ => false,
        }
    }
}

impl<T: UserEvent> PluginBuilder<T> for RawInputPlugin {
    type Plugin = RawInputPlugin;
    fn build(self, _context: Context<T>) -> RawInputPlugin {
        RawInputPlugin::new(self.database.clone())
    }
}