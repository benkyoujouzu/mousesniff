use std::ffi::{c_void, OsStr};
use std::mem::size_of;
use std::os::windows::prelude::OsStrExt;
use std::sync::mpsc::{channel, Receiver, Sender, TryRecvError};
use std::{collections::VecDeque, thread::JoinHandle};
use std::{mem, thread};
use windows::Win32::Devices::HumanInterfaceDevice::{
    HID_USAGE_GENERIC_MOUSE, HID_USAGE_PAGE_GENERIC,
};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::{
    GetRawInputBuffer, GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT,
    RAWINPUTDEVICE, RAWINPUTHEADER, RIDEV_DEVNOTIFY, RIDEV_INPUTSINK, RID_INPUT, RIM_TYPEMOUSE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
    GetWindowLongPtrW, RegisterClassExW, SetWindowLongPtrW, TranslateMessage, GWL_USERDATA,
    WINDOW_EX_STYLE, WINDOW_STYLE, WM_INPUT, WS_VISIBLE, WS_EX_TOPMOST, WS_POPUP,
};
use windows::{
    self,
    core::PCWSTR,
    Win32::{System::LibraryLoader::GetModuleHandleW, UI::WindowsAndMessaging::WNDCLASSEXW},
};
enum Command {
    Exit,
}

pub struct MouseRawEvent {
    pub dx: i32,
    pub dy: i32,
}

pub struct MouseRawInputManager {
    receiver: Receiver<MouseRawEvent>,
    sender: Sender<Command>,
    joiner: Option<JoinHandle<()>>,
}

pub unsafe extern "system" fn call_default_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_INPUT {
        let tx_ptr = GetWindowLongPtrW(hwnd, GWL_USERDATA) as *mut Sender<MouseRawEvent>;
        let tx = Box::from_raw(tx_ptr);
        unsafe {
            let mut data: RAWINPUT = mem::zeroed();
            let mut data_size = mem::size_of::<RAWINPUT>() as u32;
            let header_size = mem::size_of::<RAWINPUTHEADER>() as u32;

            let status = GetRawInputData(
                HRAWINPUT(lparam.0),
                RID_INPUT,
                Some(&mut data as *mut _ as _),
                &mut data_size,
                header_size,
            );
            if status > 0 && data.header.dwType == RIM_TYPEMOUSE.0 {
                let raw_data = data.data.mouse;
                let data = MouseRawEvent {
                    dx: raw_data.lLastX,
                    dy: raw_data.lLastY,
                };
                tx.send(data).unwrap();
            }
        }
        Box::into_raw(tx);
    }
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
            // WS_EX_TOPMOST,
            PCWSTR::from_raw(classname.as_ptr()),
            PCWSTR::from_raw(classname.as_ptr()),
            WINDOW_STYLE::default(),
            // WS_VISIBLE,
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

impl MouseRawInputManager {
    pub fn new() -> MouseRawInputManager {
        let (tx, rx) = channel();
        let (txc, rxc) = channel();

        let joiner = thread::spawn(move || {
            let hwnd = create_window_class();

            register_mouse_raw_input(hwnd);

            unsafe {
                let tx_ptr = Box::into_raw(Box::new(tx));
                SetWindowLongPtrW(hwnd, GWL_USERDATA, tx_ptr as isize);
                let mut msg = mem::zeroed();

                loop {
                    if GetMessageW(&mut msg, None, 0, 0) == false {
                        break;
                    }
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                    match rxc.try_recv() {
                        Ok(c) => match c {
                            Command::Exit => break,
                        },
                        Err(TryRecvError::Disconnected) => break,
                        _ => (),
                    }
                }

                let tx_ptr = GetWindowLongPtrW(hwnd, GWL_USERDATA) as *mut Sender<MouseRawEvent>;
                drop(Box::from_raw(tx_ptr));
                DestroyWindow(hwnd);
            }
        });

        MouseRawInputManager {
            receiver: rx,
            sender: txc,
            joiner: Some(joiner),
        }
    }

    pub fn get_event(&self) -> MouseRawEvent {
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

    #[test]
    fn it_works() {
        // println!("test start");
        // let mut manager = MouseRawInputManager::new();
        // loop {
        //     if let Some(event) = manager.get_event() {
        //         println!("{}, {}", event.dx, event.dy);
        //     }
        // }
    }
}
