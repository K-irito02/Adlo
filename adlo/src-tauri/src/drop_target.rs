//! Windows 文件拖放：在 WebView2 子窗口上注册自己的 `IDropTarget`。
//!
//! 桌面实测：wry 的 `with_drag_drop_handler` 没有把回调送到 Tauri 的
//! `RunEvent::WindowEvent`（日志无 `[ADL-DROP]`），`WM_DROPFILES` 也被 WebView2 先行吞掉。
//! 这里在独立 STA 线程上枚举主窗口的所有子窗口并注册 drop target，在其上收到落点后
//! 写入 `file_drop` 队列并广播 `adl:file-drop`。
//!
//! **设计取舍**：注册时会对已存在 target 的 HWND 先 `RevokeDragDrop`，即替换 wry 的
//! target。wry 的通道在本环境本就不回调，替换后 Tauri 的 `DragDropEvent` 不再产生；
//! Windows 桌面的拖放统一以 `adl:file-drop` 为准（工作区打开与覆盖层消费都订阅它）。
//! `main.rs` 里的 `RunEvent::WindowEvent::DragDrop` 分支只作为其它平台/未来 wry 的兜底。

#![cfg(target_os = "windows")]

use std::cell::Cell;
use std::ffi::OsString;
use std::os::raw::c_void;
use std::os::windows::ffi::OsStringExt;
use std::path::PathBuf;
use std::time::Duration;

use tauri::Emitter;
use windows::Win32::Foundation::{DRAGDROP_E_INVALIDHWND, HWND, LPARAM, POINT, POINTL};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::System::Com::{
    COINIT_APARTMENTTHREADED, CoInitializeEx, DVASPECT_CONTENT, FORMATETC, IDataObject,
    TYMED_HGLOBAL,
};
use windows::Win32::System::Ole::{
    CF_HDROP, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE, IDropTarget, IDropTarget_Impl,
    RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop,
};
use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, EnumChildWindows, GetMessageW, MSG, TranslateMessage,
};
use windows::core::{BOOL, implement};

#[implement(IDropTarget)]
struct BackgroundDropTarget {
    app: tauri::AppHandle,
    hwnd: HWND,
    enter_is_valid: Cell<bool>,
    cursor_effect: Cell<DROPEFFECT>,
}

impl BackgroundDropTarget {
    fn new(app: tauri::AppHandle, hwnd: HWND) -> Self {
        Self {
            app,
            hwnd,
            enter_is_valid: Cell::new(false),
            cursor_effect: Cell::new(DROPEFFECT_NONE),
        }
    }

    fn emit(&self, payload: serde_json::Value) {
        let _ = self.app.emit("adl:file-drop", payload);
    }

    fn collect_paths(data_obj: windows::core::Ref<'_, IDataObject>) -> Option<Vec<String>> {
        let drop_format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let data = data_obj.as_ref()?;
        // SAFETY: `data` 在借用期内有效，`drop_format` 是合法的 FORMATETC；
        // 成功返回的 STGMEDIUM 由本函数负责释放。
        let mut medium = unsafe { data.GetData(&drop_format) }.ok()?;
        // SAFETY: `drop_format` 声明 tymed 为 TYMED_HGLOBAL，成功时 union 的 hGlobal 有效。
        let hglobal = unsafe { medium.u.hGlobal.0 };
        let hdrop = HDROP(hglobal);
        // SAFETY: `hdrop` 来自 CF_HDROP 的 HGLOBAL；0xFFFF_FFFF 查询文件数量是文档约定用法。
        let count = unsafe { DragQueryFileW(hdrop, 0xFFFF_FFFF, None) };
        let mut paths = Vec::new();
        for index in 0..count {
            // SAFETY: 同一 HDROP，index 在 0..count 范围内；None 查询所需字符数。
            let length = unsafe { DragQueryFileW(hdrop, index, None) } as usize;
            let mut buffer = vec![0u16; length + 1];
            // SAFETY: 缓冲区按 API 返回长度分配，包含结尾 NUL。
            unsafe { DragQueryFileW(hdrop, index, Some(&mut buffer)) };
            let path: PathBuf = OsString::from_wide(&buffer[0..length]).into();
            paths.push(path.to_string_lossy().into_owned());
        }
        // GetData 取得的 STGMEDIUM 必须 ReleaseStgMedium（DragFinish 只用于 WM_DROPFILES）。
        // SAFETY: `medium` 由 GetData 填充且仅在此释放一次。
        unsafe { ReleaseStgMedium(&mut medium) };
        Some(paths)
    }
}

impl IDropTarget_Impl for BackgroundDropTarget_Impl {
    fn DragEnter(
        &self,
        data_obj: windows::core::Ref<'_, IDataObject>,
        _key_state: MODIFIERKEYS_FLAGS,
        _point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let Some(paths) = BackgroundDropTarget::collect_paths(data_obj) else {
            return Ok(());
        };
        if paths.is_empty() {
            return Ok(());
        }
        self.enter_is_valid.set(true);
        self.cursor_effect.set(DROPEFFECT_COPY);
        self.emit(serde_json::json!({ "type": "enter", "paths": paths }));
        // SAFETY: OLE 调用方保证 `effect` 指向可写的 DROPEFFECT（IDropTarget 契约）。
        unsafe { *effect = DROPEFFECT_COPY };
        Ok(())
    }

    fn DragOver(
        &self,
        _key_state: MODIFIERKEYS_FLAGS,
        _point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let cursor =
            if self.enter_is_valid.get() { self.cursor_effect.get() } else { DROPEFFECT_NONE };
        // SAFETY: OLE 调用方保证 `effect` 指向可写的 DROPEFFECT（IDropTarget 契约）。
        unsafe { *effect = cursor };
        Ok(())
    }

    fn DragLeave(&self) -> windows::core::Result<()> {
        if self.enter_is_valid.replace(false) {
            self.emit(serde_json::json!({ "type": "leave" }));
        }
        Ok(())
    }

    fn Drop(
        &self,
        data_obj: windows::core::Ref<'_, IDataObject>,
        _key_state: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        _effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        if !self.enter_is_valid.replace(false) {
            return Ok(());
        }
        let Some(paths) = BackgroundDropTarget::collect_paths(data_obj) else {
            return Ok(());
        };
        let mut client = POINT { x: point.x, y: point.y };
        // SAFETY: `hwnd` 是注册 drop target 时的有效窗口句柄；`client` 是本地可写变量。
        let _ = unsafe { ScreenToClient(self.hwnd, &mut client) };
        tracing::info!(
            count = paths.len(),
            x = client.x,
            y = client.y,
            "[ADL-DROP] drop (ole target)"
        );
        crate::file_drop::record_drop(&paths);
        self.emit(serde_json::json!({ "type": "drop", "paths": paths }));
        Ok(())
    }
}

struct Registration {
    _targets: Vec<IDropTarget>,
}

fn register_on(hwnd: HWND, app: &tauri::AppHandle, targets: &mut Vec<IDropTarget>) -> bool {
    let target: IDropTarget = BackgroundDropTarget::new(app.clone(), hwnd).into();
    // SAFETY: `target` 在函数内保持存活；注册成功后随 `targets` 延长到消息泵结束，
    // `hwnd` 由调用方保证在应用生命周期内有效。
    unsafe {
        if RevokeDragDrop(hwnd) != Err(DRAGDROP_E_INVALIDHWND.into())
            && RegisterDragDrop(hwnd, &target).is_ok()
        {
            targets.push(target);
            return true;
        }
    }
    false
}

fn register_tree(root: HWND, app: &tauri::AppHandle, targets: &mut Vec<IDropTarget>) -> u32 {
    let mut count = 0u32;
    if register_on(root, app, targets) {
        count += 1;
    }
    let mut callback = |hwnd: HWND| {
        if register_on(hwnd, app, targets) {
            count += 1;
        }
        true
    };
    let mut trait_obj: &mut dyn FnMut(HWND) -> bool = &mut callback;
    // SAFETY: 仅擦除 trait object 引用的生命周期用于同步回调；
    // `trait_obj` 在 `EnumChildWindows` 返回前保持有效。
    let ptr: *mut c_void = unsafe { std::mem::transmute(&mut trait_obj) };
    unsafe extern "system" fn enumerate(hwnd: HWND, lparam: LPARAM) -> BOOL {
        // SAFETY: lparam 由下面的 EnumChildWindows 同步回传同一 ptr，调用期间引用有效。
        let closure =
            unsafe { &mut *(lparam.0 as *mut c_void as *mut &mut dyn FnMut(HWND) -> bool) };
        closure(hwnd).into()
    }
    // SAFETY: 根 HWND 有效；回调与 lparam 在 EnumChildWindows 调用期间保持有效（同步执行）。
    unsafe {
        let _ = EnumChildWindows(Some(root), Some(enumerate), LPARAM(ptr as isize));
    }
    count
}

/// 在独立 STA 线程上注册 drop target 并运行消息泵接收 OLE 回调。
pub fn install(app: tauri::AppHandle, hwnd: HWND) {
    let raw_hwnd = hwnd.0 as isize;
    // 只把整数句柄跨线程传递；HWND 在目标线程内重建，窗口在应用生命周期内不被销毁。
    let spawned =
        std::thread::Builder::new().name("adl-drop-target".to_string()).spawn(move || {
            let hwnd = HWND(raw_hwnd as *mut c_void);
            // SAFETY: 在专用 STA 线程上初始化 COM；S_FALSE（已初始化）不是错误。
            let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
            if hr.is_err() {
                // S_FALSE（已初始化）不算失败；真正的失败只影响 OLE 调用。
                tracing::warn!(hr = hr.0, "[ADL-DROP] CoInitializeEx failed");
            }
            let mut registration = Registration { _targets: Vec::new() };
            // WebView2 的子窗口在导航后才稳定出现：重试几轮，直到枚举到目标。
            for attempt in 0..20 {
                let count = register_tree(hwnd, &app, &mut registration._targets);
                if count > 0 {
                    tracing::info!(count, attempt, "[ADL-DROP] ole drop targets registered");
                    break;
                }
                std::thread::sleep(Duration::from_millis(500));
            }
            if registration._targets.is_empty() {
                tracing::warn!("[ADL-DROP] failed to register any ole drop target");
            }

            let mut message = MSG::default();
            // SAFETY: 标准 Win32 消息泵；回调只在本线程的注册 target 上触发。
            while unsafe { GetMessageW(&mut message, None, 0, 0) }.as_bool() {
                // SAFETY: `message` 由 GetMessageW 填充，Translate/Dispatch 均作用于当前线程队列。
                unsafe {
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }
            drop(registration);
        });
    if let Err(err) = spawned {
        tracing::warn!(error = %err, "[ADL-DROP] failed to spawn drop-target thread");
    }
}
