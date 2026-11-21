use std::path::Path;

/// Windows「应用身份」（AUMID）初始化。
///
/// 为什么需要（2026-11-21 事项 17）：WebView2 官方文档明确——宿主未设置 AUMID 时，
/// WebView 创建期会给根窗口**生成一个** AUMID；该 ID 未在注册表登记 DisplayName/IconUri，
/// 于是 Windows 媒体浮出卡片只能显示「未知应用」+ 无图标。同时进程/窗口没有显式 AUMID，
/// 任务栏与系统媒体的归属也不稳定。
///
/// 这里做两件事（都可重复执行）：
/// 1. `SetCurrentProcessExplicitAppUserModelID("com.adlo.app")`：让 WebView2 沿用宿主身份；
/// 2. 在 `HKCU\Software\Classes\AppUserModelId\com.adlo.app` 写入 `DisplayName` / `IconUri`，
///    让 Windows 能把该 AUMID 渲染成「Adlo」+ 应用图标。
#[cfg(windows)]
pub fn init_app_identity() {
    imp::init();
}

#[cfg(not(windows))]
pub fn init_app_identity() {}

/// 把 AUMID 写到**窗口**上（`PKEY_AppUserModel_ID`）。
///
/// 为什么还要窗口级：WebView2 文档说宿主未设置时会「给根窗口生成一个 AUMID」——系统媒体
/// 卡片取的是**窗口**身份。仅设进程 AUMID 时，WebView2 在创建期写下的生成值仍会覆盖归属，
/// 于是卡片继续显示「未知应用」。窗口创建后再写一次即可让卡片解析到 `com.adlo.app`。
///
/// 入参是 `tauri::Window`（而不是 `WebviewWindow`）：浏览器标签是挂在主窗口上的子 WebView，
/// 存在子 WebView 时 `get_webview_window("main")` 会返回 None（Tauri 的 `is_webview_window()`
/// 要求窗口下所有 WebView 的 label 相同），直接用 `webview.window()` 更稳。
#[cfg(windows)]
pub fn apply_window_identity(window: &tauri::Window) {
    if let Err(error) = imp::set_window_aumid(window) {
        tracing::warn!(error = %error, "app identity: setting window AUMID failed");
    }
}

#[cfg(not(windows))]
pub fn apply_window_identity(_window: &tauri::Window) {}

#[cfg(windows)]
mod imp {
    use super::Path;
    use windows::Win32::System::Registry::{
        HKEY_CURRENT_USER, KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ, RegCloseKey,
        RegCreateKeyExW, RegSetValueExW,
    };
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
    use windows::core::PCWSTR;

    /// 与 `tauri.conf.json` 的 `identifier` 及安装器写进快捷方式的 AUMID 保持一致。
    const AUMID: &str = "com.adlo.app";
    const DISPLAY_NAME: &str = "Adlo";

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn init() {
        let id = wide(AUMID);
        // SAFETY: 启动期单线程调用，字符串在调用期间存活。
        if let Err(error) = unsafe { SetCurrentProcessExplicitAppUserModelID(PCWSTR(id.as_ptr())) }
        {
            tracing::warn!(error = %error, "SetCurrentProcessExplicitAppUserModelID failed");
        }

        let icon = std::env::current_exe()
            .ok()
            .filter(|path| Path::new(path).exists())
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        if icon.is_empty() {
            tracing::warn!("app identity: current exe path unavailable, IconUri not registered");
            return;
        }
        if let Err(error) = register_aumid(AUMID, DISPLAY_NAME, &icon) {
            tracing::warn!(error = %error, "app identity: registering AUMID values failed");
        }
    }

    /// 写入 `HKCU\Software\Classes\AppUserModelId\<id>` 的 DisplayName / IconUri。
    fn register_aumid(id: &str, display_name: &str, icon_path: &str) -> Result<(), String> {
        let subkey = wide(&format!("Software\\Classes\\AppUserModelId\\{id}"));
        let mut key = Default::default();
        // SAFETY: 路径与值缓冲在调用期间存活；key 在写入后立即关闭。
        unsafe {
            let created = RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                None,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_WRITE,
                None,
                &mut key,
                None,
            );
            if created != windows::Win32::Foundation::WIN32_ERROR(0) {
                return Err(format!("RegCreateKeyExW failed: {}", created.0));
            }
            for (name, value) in [("DisplayName", display_name), ("IconUri", icon_path)] {
                let value_name = wide(name);
                let value_data = wide(value);
                let bytes = std::slice::from_raw_parts(
                    value_data.as_ptr().cast::<u8>(),
                    value_data.len() * 2,
                );
                let result =
                    RegSetValueExW(key, PCWSTR(value_name.as_ptr()), None, REG_SZ, Some(bytes));
                if result != windows::Win32::Foundation::WIN32_ERROR(0) {
                    let _ = RegCloseKey(key);
                    return Err(format!("RegSetValueExW({name}) failed: {}", result.0));
                }
            }
            let _ = RegCloseKey(key);
        }
        Ok(())
    }

    /// 在窗口属性存储上写 `PKEY_AppUserModel_ID`（覆盖 WebView2 生成值）。
    pub fn set_window_aumid(window: &tauri::Window) -> Result<(), String> {
        use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
        use windows::Win32::System::Com::StructuredStorage::{
            PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0, PropVariantClear,
        };
        use windows::Win32::System::Variant::VT_BSTR;
        use windows::Win32::UI::Shell::PropertiesSystem::{
            IPropertyStore, SHGetPropertyStoreForWindow,
        };
        use windows::core::BSTR;

        // Tauri 与 `windows` 依赖同为 0.61，`hwnd()` 直接就是同一 HWND 类型。
        let hwnd = window.hwnd().map_err(|error| format!("window handle unavailable: {error}"))?;

        // 平台没有 `From<&str> for PROPVARIANT`：按 VT_BSTR 结构字面量构造一次。
        let mut value = PROPVARIANT {
            Anonymous: PROPVARIANT_0 {
                Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                    vt: VT_BSTR,
                    wReserved1: 0,
                    wReserved2: 0,
                    wReserved3: 0,
                    Anonymous: PROPVARIANT_0_0_0 {
                        bstrVal: std::mem::ManuallyDrop::new(BSTR::from(AUMID)),
                    },
                }),
            },
        };
        let app_user_model_id = PKEY_AppUserModel_ID;

        // SAFETY: hwnd 有效；store 在作用域内释放；value 由 PropVariantClear 清理一次。
        unsafe {
            let store: IPropertyStore = SHGetPropertyStoreForWindow(hwnd)
                .map_err(|error| format!("SHGetPropertyStoreForWindow: {error}"))?;
            store
                .SetValue(&app_user_model_id, &value)
                .map_err(|error| format!("SetValue(PKEY_AppUserModel_ID): {error}"))?;
            store.Commit().map_err(|error| format!("IPropertyStore::Commit: {error}"))?;
            let _ = PropVariantClear(&mut value);
        }
        tracing::info!(aumid = AUMID, "app identity: window AUMID applied");
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use windows::Win32::System::Registry::{RRF_RT_REG_SZ, RegDeleteTreeW, RegGetValueW};

        /// 读回一个 AUMID 值（REG_SZ），用于验证写入路径。
        fn read_value(id: &str, name: &str) -> Option<String> {
            let subkey = wide(&format!("Software\\Classes\\AppUserModelId\\{id}"));
            let value_name = wide(name);
            let mut buffer = [0u16; 512];
            let mut size = (buffer.len() * 2) as u32;
            // SAFETY: 缓冲与字符串在调用期间存活；size 以字节计。
            let result = unsafe {
                RegGetValueW(
                    HKEY_CURRENT_USER,
                    PCWSTR(subkey.as_ptr()),
                    PCWSTR(value_name.as_ptr()),
                    RRF_RT_REG_SZ,
                    None,
                    Some(buffer.as_mut_ptr().cast()),
                    Some(&mut size),
                )
            };
            if result != windows::Win32::Foundation::WIN32_ERROR(0) {
                return None;
            }
            let end = buffer.iter().position(|unit| *unit == 0).unwrap_or(buffer.len());
            Some(String::from_utf16_lossy(&buffer[..end]))
        }

        /// 事项 17：AUMID 注册写入真实 HKCU（测试用独立 id，结束即删）。
        /// 这条用例守的是「Windows 能把 AUMID 解析成 Adlo + 图标」的前置条件。
        #[test]
        fn aumid_registration_writes_display_name_and_icon() {
            let test_id = "com.adlo.app.adl-selftest";
            let subkey = wide(&format!("Software\\Classes\\AppUserModelId\\{test_id}"));
            register_aumid(test_id, "Adlo Selftest", "C:\\Windows\\explorer.exe").unwrap();
            assert_eq!(read_value(test_id, "DisplayName").as_deref(), Some("Adlo Selftest"));
            assert_eq!(
                read_value(test_id, "IconUri").as_deref(),
                Some("C:\\Windows\\explorer.exe")
            );
            // 清理：不把测试身份留在用户注册表里。
            // SAFETY: 仅删除本用例创建的子树。
            unsafe {
                let _ = RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(subkey.as_ptr()));
            }
            assert!(read_value(test_id, "DisplayName").is_none());
        }
    }
}
