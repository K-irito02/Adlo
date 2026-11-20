//! 诊断用：列出当前 Windows 媒体会话的 SourceAppUserModelId / 标题，
//! 并枚举顶层窗口的 `PKEY_AppUserModel_ID`（确认窗口身份是否真的写进去了）。
//!
//! 运行：`cargo run -p adlo --example smtc-probe`（需要当前有媒体会话在播放或刚暂停）。

#[cfg(windows)]
fn main() {
    print_sessions();
    print_window_aumids();
}

#[cfg(windows)]
fn print_sessions() {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    let manager = match GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .and_then(|operation| operation.get())
    {
        Ok(manager) => manager,
        Err(error) => {
            eprintln!("RequestAsync failed: {error}");
            return;
        },
    };
    let sessions = match manager.GetSessions() {
        Ok(sessions) => sessions,
        Err(error) => {
            eprintln!("GetSessions failed: {error}");
            return;
        },
    };
    if sessions.Size().unwrap_or(0) == 0 {
        println!("NO_SESSIONS");
        return;
    }
    for session in sessions {
        let aumid = session
            .SourceAppUserModelId()
            .map(|value| value.to_string())
            .unwrap_or_else(|_| "<unavailable>".to_string());
        let title = session
            .TryGetMediaPropertiesAsync()
            .and_then(|operation| operation.get())
            .and_then(|props| props.Title())
            .map(|value| value.to_string())
            .unwrap_or_default();
        println!("SESSION\tAUMID={aumid}\tTITLE={title}");
    }
}

#[cfg(windows)]
fn print_window_aumids() {
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible,
    };

    unsafe extern "system" fn callback(hwnd: HWND, _lparam: LPARAM) -> windows::core::BOOL {
        unsafe {
            if !IsWindowVisible(hwnd).as_bool() {
                return true.into();
            }
            let length = GetWindowTextLengthW(hwnd);
            let mut buffer = vec![0u16; length as usize + 1];
            let written = GetWindowTextW(hwnd, &mut buffer);
            let title = String::from_utf16_lossy(&buffer[..written as usize]);
            if !title.contains("Adlo") {
                return true.into();
            }
            match read_window_aumid(hwnd) {
                Some(aumid) => println!("WINDOW\tTITLE={title}\tAUMID={aumid}"),
                None => println!("WINDOW\tTITLE={title}\tAUMID=<none>"),
            }
            true.into()
        }
    }

    let _ = unsafe { EnumWindows(Some(callback), LPARAM(0)) };
}

#[cfg(windows)]
fn read_window_aumid(hwnd: windows::Win32::Foundation::HWND) -> Option<String> {
    use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
    use windows::Win32::System::Com::StructuredStorage::PropVariantClear;
    use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};

    unsafe {
        let store: IPropertyStore = SHGetPropertyStoreForWindow(hwnd).ok()?;
        let key = PKEY_AppUserModel_ID;
        let mut value = store.GetValue(&key).ok()?;
        let raw = value.Anonymous.Anonymous.Anonymous.pwszVal;
        let text = if raw.is_null() {
            None
        } else {
            Some(raw.to_string().ok()?)
        };
        let _ = PropVariantClear(&mut value);
        text
    }
}

#[cfg(not(windows))]
fn main() {
    println!("windows only");
}
