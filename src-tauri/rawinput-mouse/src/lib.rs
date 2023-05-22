use std::ffi::OsStr;
use std::mem::size_of;
use std::os::windows::prelude::OsStrExt;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::{collections::VecDeque, thread::JoinHandle};
use std::{mem, ptr, thread};
use windows::Win32::Devices::HumanInterfaceDevice::{
    HID_USAGE_GENERIC_MOUSE, HID_USAGE_PAGE_GENERIC,
};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::{
    GetRawInputBuffer, RegisterRawInputDevices, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER,
    RIDEV_DEVNOTIFY, RIDEV_INPUTSINK, RIM_TYPEMOUSE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassExW, WINDOW_EX_STYLE, WINDOW_STYLE,
};
use windows::{
    self,
    core::PCWSTR,
    Win32::{System::LibraryLoader::GetModuleHandleW, UI::WindowsAndMessaging::WNDCLASSEXW},
};
enum Command {
    Exit,
    GetEvent,
}

pub struct MouseRawEvent {
    pub dx: i32,
    pub dy: i32,
}

pub struct MouseRawInputManager {
    joiner: Option<JoinHandle<()>>,
    sender: Sender<Command>,
    receiver: Receiver<Option<MouseRawEvent>>,
}

pub unsafe extern "system" fn call_default_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

fn create_window_class() -> HWND {
    let hwnd: HWND;
    unsafe {
        let hinstance = GetModuleHandleW(PCWSTR::null()).unwrap_or_default();
        let classname = OsStr::new("RawInput Hidden Window")
            .encode_wide()
            .chain(Some(0).into_iter())
            .collect::<Vec<_>>();

        let wcex = WNDCLASSEXW {
            cbSize: mem::size_of::<WNDCLASSEXW>() as u32,
            style: Default::default(),
            lpfnWndProc: Some(call_default_window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: GetModuleHandleW(PCWSTR::null()).unwrap_or_default(),
            hIcon: Default::default(),
            hCursor: Default::default(),
            hbrBackground: Default::default(),
            lpszMenuName: PCWSTR::null(),
            lpszClassName: PCWSTR::from_raw(classname.as_ptr()),
            hIconSm: Default::default(),
        };
        let a = RegisterClassExW(&wcex);
        if a == 0 {
            panic!("Registering WindowClass Failed!");
        }

        hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            PCWSTR::from_raw(classname.as_ptr()),
            PCWSTR::from_raw(classname.as_ptr()),
            WINDOW_STYLE::default(),
            0,
            0,
            0,
            0,
            None,
            None,
            hinstance,
            None,
        );
        if hwnd.0 == 0 {
            panic!("Window Creation Failed!");
        }
    }
    hwnd
}

fn register_mouse_raw_input(hwnd: HWND) {
    let flags = RIDEV_DEVNOTIFY | RIDEV_INPUTSINK;
    let devices = [RAWINPUTDEVICE {
        usUsagePage: HID_USAGE_PAGE_GENERIC,
        usUsage: HID_USAGE_GENERIC_MOUSE,
        dwFlags: flags,
        hwndTarget: hwnd,
    }];
    let device_size = size_of::<RAWINPUTDEVICE>() as u32;
    unsafe {
        let succ = RegisterRawInputDevices(&devices, device_size) == true;
        if !succ {
            panic!("Register Mouse Raw Input Failed!");
        }
    }
}

fn get_event_buffered(event_queue: &mut VecDeque<MouseRawEvent>) -> Option<MouseRawEvent> {
    while event_queue.is_empty() {
        win_get_event(event_queue);
    }
    let event = event_queue.pop_front();
    event
}

fn win_get_event(event_queue: &mut VecDeque<MouseRawEvent>) {
    unsafe {
        let mut array_alloc: [u8; 1024] = mem::MaybeUninit::uninit().assume_init();
        loop {
            let mut buffer_size = array_alloc.len() as u32;
            let numberofelements = GetRawInputBuffer(
                Some(array_alloc.as_mut_ptr() as *mut RAWINPUT),
                &mut buffer_size,
                mem::size_of::<RAWINPUTHEADER>() as u32,
            ) as i32;

            if numberofelements as i32 == -1 {
                panic!("GetRawInputBuffer Gave Error!");
            }
            if numberofelements as i32 == 0 {
                return;
            }

            let mut array_ptr = array_alloc.as_mut_ptr();

            for _ in 0..numberofelements as u32 {
                let first_elem = *(array_ptr as *mut RAWINPUT);
                if first_elem.header.dwType == RIM_TYPEMOUSE.0 {
                    let raw_data = first_elem.data.mouse;
                    let data = MouseRawEvent {
                        dx: raw_data.lLastX,
                        dy: raw_data.lLastY,
                    };
                    event_queue.push_back(data);
                }
                array_ptr = array_ptr.offset(first_elem.header.dwSize as isize);
            }
        }
    }
}

impl MouseRawInputManager {
    pub fn new() -> MouseRawInputManager {
        let (tx, rx) = channel();
        let (tx2, rx2) = channel();

        let joiner = thread::spawn(move || {
            let hwnd = create_window_class();
            register_mouse_raw_input(hwnd);
            let mut event_queue = VecDeque::new();

            let mut exit = false;
            while !exit {
                match rx.recv().unwrap() {
                    Command::GetEvent => {
                        tx2.send(get_event_buffered(&mut event_queue)).unwrap();
                    }
                    Command::Exit => {
                        exit = true;
                    }
                };
            }
            unsafe {
                DestroyWindow(hwnd);
            }
        });

        MouseRawInputManager {
            joiner: Some(joiner),
            sender: tx,
            receiver: rx2,
        }
    }

    pub fn get_event(&self) -> Option<MouseRawEvent> {
        self.sender.send(Command::GetEvent).unwrap();
        self.receiver.recv().unwrap()
    }
}

impl Drop for MouseRawInputManager {
    fn drop(&mut self) {
        self.sender.send(Command::Exit).unwrap();
        self.joiner.take().unwrap().join().unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {}
}
