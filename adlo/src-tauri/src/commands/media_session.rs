//! Windows 系统媒体卡片（SMTC）宿主实现 —— 事项 17 路线 A。
//!
//! 为什么由 Rust 自建（2026-11-21 实测）：系统卡片第一行「应用名 + 图标」按**创建媒体会话的
//! 进程身份**（AUMID）解析。WebView2 用自己的浏览器进程注册 Chromium 媒体会话，归属恒为
//! `msedgewebview2.exe`（未登记 DisplayName/IconUri），所以卡片显示「未知应用」且没有图标；
//! 宿主的进程 AUMID 与窗口 AUMID 都改不掉它（`smtc-probe` 一直读到 `msedgewebview2.exe`）。
//!
//! 现在的分工：
//! - Chromium 的媒体会话由 `--disable-features=MediaSessionService` 关闭（启动参数见
//!   `tauri.conf.json` 的 `additionalBrowserArgs` 与 `main.rs` 的环境变量兜底）；
//! - 本模块在主窗口线程上通过 `ISystemMediaTransportControlsInterop::GetForWindow` 自建会话，
//!   身份即本进程 AUMID（`com.adlo.app`，已登记「Adlo + 图标」）；
//! - 标题 / 进度由前端经 IPC 推送（本地预览与浏览器标签页同级，前端做轮播）；系统卡片上的播放/暂停/停止回调
//!   以事件回传前端，由真实 `<audio>` / `<video>` 执行。
//!
//! 线程约定：SMTC 对象与窗口同属一个套间，**只在主线程创建与使用**。命令线程通过
//! `AppHandle::run_on_main_thread` 投递，会话存在主线程的 `thread_local` 里（WinRT 接口
//! 不是 `Send`，不能放进 `tauri::State`）。

use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::IpcResult;

/// 系统卡片按钮 → 前端的事件名与载荷：`{ "command": "play" | "pause" | "stop" }`。
pub const EVENT_COMMAND: &str = "digital-life://media-session-command";

/// 前端推送的「正在播放」快照（`serde(rename_all = "camelCase")`）。
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    /// 曲目名（本地预览取文件名，不含扩展名；浏览器标签取站点/页面标题）。
    ///
    /// 系统卡片只展示这一行：用户明确要求不显示副标题（应用名 / 站点域名），
    /// 因此不再携带 artist/album。
    pub title: String,
    pub status: PlaybackStatus,
    /// 毫秒；未知时省略（例如时长未解析出来）。
    pub position_ms: Option<f64>,
    pub duration_ms: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackStatus {
    Playing,
    Paused,
    Stopped,
}

/// 更新系统卡片内容。返回 `false` 表示当前平台不支持（浏览器模式走 `navigator.mediaSession`）。
#[tauri::command]
pub fn media_session_update(app: tauri::AppHandle, now_playing: NowPlaying) -> IpcResult<bool> {
    ipc(update(&app, now_playing))
}

/// 清空系统卡片（预览关闭 / 播放结束）。
#[tauri::command]
pub fn media_session_clear(app: tauri::AppHandle) -> IpcResult<bool> {
    ipc(clear(&app))
}

#[cfg(windows)]
fn update(app: &tauri::AppHandle, now_playing: NowPlaying) -> Result<bool, AppError> {
    app.run_on_main_thread({
        let app = app.clone();
        move || imp::apply(&app, &now_playing)
    })
    .map_err(|error| AppError::Internal(format!("media session dispatch failed: {error}")))?;
    Ok(true)
}

#[cfg(not(windows))]
fn update(_app: &tauri::AppHandle, _now_playing: NowPlaying) -> Result<bool, AppError> {
    Ok(false)
}

#[cfg(windows)]
fn clear(app: &tauri::AppHandle) -> Result<bool, AppError> {
    app.run_on_main_thread(imp::clear)
        .map_err(|error| AppError::Internal(format!("media session dispatch failed: {error}")))?;
    Ok(true)
}

#[cfg(not(windows))]
fn clear(_app: &tauri::AppHandle) -> Result<bool, AppError> {
    Ok(false)
}

#[cfg(windows)]
mod imp {
    use super::{EVENT_COMMAND, NowPlaying, PlaybackStatus};
    use std::cell::{Cell, RefCell};
    use tauri::{AppHandle, Emitter, Manager};
    use windows::Foundation::{TimeSpan, TypedEventHandler};
    use windows::Media::{
        ISystemMediaTransportControls2, MediaPlaybackStatus, MediaPlaybackType,
        SystemMediaTransportControls, SystemMediaTransportControlsButton,
        SystemMediaTransportControlsButtonPressedEventArgs,
        SystemMediaTransportControlsTimelineProperties,
    };
    use windows::Win32::System::WinRT::{
        ISystemMediaTransportControlsInterop, RO_INIT_SINGLETHREADED, RoGetActivationFactory,
        RoInitialize,
    };
    use windows::core::{HSTRING, Interface};

    const CLASS_NAME: &str = "Windows.Media.SystemMediaTransportControls";

    thread_local! {
        /// WinRT 接口不是 `Send`：会话只能停留在主线程。
        static SESSION: RefCell<Option<Session>> = const { RefCell::new(None) };
        /// 创建失败（无窗口 / 系统过旧）后的冷却起点：**限频重试**而不是永久放弃。
        ///
        /// 早期实现把失败永久置位，结果「长时间暂停 → 卡片被清空 → 恢复播放」时
        /// 只要重建失败一次，卡片就再也不出现（用户实测 2026-11-21）。
        static LAST_FAILURE: Cell<Option<std::time::Instant>> = const { Cell::new(None) };
    }

    /// 创建失败后的重试冷却。
    const CREATE_RETRY: std::time::Duration = std::time::Duration::from_secs(30);

    struct Session {
        controls: SystemMediaTransportControls,
        /// 进度条（`UpdateTimelineProperties`）只在 `ISystemMediaTransportControls2` 上。
        controls2: Option<ISystemMediaTransportControls2>,
        last_title: Option<String>,
    }

    pub fn apply(app: &AppHandle, now_playing: &NowPlaying) {
        // 冷却期内静默跳过（卡片是装饰层，丢一两次更新不影响播放）。
        if let Some(failed_at) = LAST_FAILURE.with(Cell::get) {
            if failed_at.elapsed() < CREATE_RETRY {
                return;
            }
        }
        let created = SESSION.with(|slot| {
            if slot.borrow().is_some() {
                return Ok(());
            }
            match Session::create(app) {
                Ok(session) => {
                    *slot.borrow_mut() = Some(session);
                    Ok(())
                },
                Err(error) => Err(error),
            }
        });
        if let Err(error) = created {
            LAST_FAILURE.with(|slot| slot.set(Some(std::time::Instant::now())));
            tracing::warn!(error = %error, "media session: SMTC creation failed (will retry)");
            return;
        }
        SESSION.with(|slot| {
            let mut borrowed = slot.borrow_mut();
            if let Some(session) = borrowed.as_mut() {
                if let Err(error) = session.apply(now_playing) {
                    tracing::warn!(error = %error, "media session: applying now-playing failed");
                }
            }
        });
    }

    /// 清空卡片：**保留会话对象**，只停帧/停用。
    ///
    /// 为什么不再 drop：重建 `GetForWindow` 会话在系统侧并不总是可靠，长时间暂停后
    /// 恢复播放会出现「卡片再也不出现」。会话与本进程 AUMID 绑定，生命周期内保活最稳。
    pub fn clear() {
        SESSION.with(|slot| {
            let mut borrowed = slot.borrow_mut();
            if let Some(session) = borrowed.as_mut() {
                let _ = session.controls.SetPlaybackStatus(MediaPlaybackStatus::Stopped);
                let _ = session.controls.SetIsEnabled(false);
                // 下次重新出现时即使标题相同也要重写一次元数据（卡片刚被禁用过）。
                session.last_title = None;
            }
        });
    }

    impl Session {
        fn create(app: &AppHandle) -> Result<Self, String> {
            // 主线程通常已被 Tauri/WebView2 初始化为 STA；套间已存在时返回值可忽略。
            // SAFETY: 主线程单次初始化，重复初始化由 WinRT 自身容错（S_FALSE / RPC_E_CHANGED_MODE）。
            unsafe {
                let _ = RoInitialize(RO_INIT_SINGLETHREADED);
            }

            let interop: ISystemMediaTransportControlsInterop =
                // SAFETY: 类名是常量 HSTRING，接口 IID 由 `windows` crate 提供。
                unsafe { RoGetActivationFactory(&HSTRING::from(CLASS_NAME)) }
                    .map_err(|error| format!("RoGetActivationFactory({CLASS_NAME}): {error}"))?;

            // 不能用 `get_webview_window("main")`：浏览器标签是挂在主窗口上的子 WebView
            // （label `adl-browser-view-*`），只要存在一个，Tauri 的 `is_webview_window()`
            // 就为 false，主窗口的 lookup 直接返回 None（2026-11-21 实测：恢复的标签页
            // 先开始播放时，首次建会话失败并报 `main window unavailable`）。
            // `get_window` 只查窗口表，不受子 WebView 影响。
            let window = app
                .get_window("main")
                .or_else(|| app.windows().into_values().next())
                .ok_or_else(|| "main window unavailable".to_string())?;
            let hwnd = window.hwnd().map_err(|error| format!("window handle: {error}"))?;
            // 系统卡片的应用身份在**建会话时**解析：启动期恢复的标签页可能先于
            // `on_page_load` 上报媒体状态，这里再幂等写一次窗口 AUMID，避免首张卡
            // 拿到 WebView2 生成的「未知应用」身份。
            crate::app_identity::apply_window_identity(&window);
            let controls: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd) }
                .map_err(|error| format!("GetForWindow: {error}"))?;

            // 只启用真正有处理器的按钮：播放 / 暂停 / 停止。没有播放列表，上一首/下一首
            // 保持禁用（卡片里是灰的，与改造前一致），避免点了没反应。
            controls.SetIsPlayEnabled(true).map_err(|e| format!("SetIsPlayEnabled: {e}"))?;
            controls.SetIsPauseEnabled(true).map_err(|e| format!("SetIsPauseEnabled: {e}"))?;
            controls.SetIsStopEnabled(true).map_err(|e| format!("SetIsStopEnabled: {e}"))?;
            controls.SetIsNextEnabled(false).map_err(|e| format!("SetIsNextEnabled: {e}"))?;
            controls
                .SetIsPreviousEnabled(false)
                .map_err(|e| format!("SetIsPreviousEnabled: {e}"))?;

            let emitter = app.clone();
            let handler = TypedEventHandler::<
                SystemMediaTransportControls,
                SystemMediaTransportControlsButtonPressedEventArgs,
            >::new(move |_sender, args| {
                if let Some(command) = args.as_ref().and_then(button_command) {
                    let _ = emitter.emit(EVENT_COMMAND, serde_json::json!({ "command": command }));
                }
                Ok(())
            });
            controls.ButtonPressed(&handler).map_err(|e| format!("ButtonPressed: {e}"))?;

            // `windows` 0.61 没有把这个接口的进度方法投影到类上，拿接口句柄自行调用。
            let controls2 = controls.cast::<ISystemMediaTransportControls2>().ok();

            Ok(Self { controls, controls2, last_title: None })
        }

        fn apply(&mut self, now_playing: &NowPlaying) -> Result<(), String> {
            self.controls.SetIsEnabled(true).map_err(|e| format!("SetIsEnabled: {e}"))?;
            self.controls
                .SetPlaybackStatus(playback_status(now_playing.status))
                .map_err(|e| format!("SetPlaybackStatus: {e}"))?;
            self.update_metadata(now_playing)?;
            self.update_timeline(now_playing)?;
            Ok(())
        }

        /// 元数据只在曲目变化时写：`timeupdate` 每秒都会推一次快照。
        ///
        /// 只写标题：系统卡片不显示副标题（用户口径，2026-11-21）。
        fn update_metadata(&mut self, now_playing: &NowPlaying) -> Result<(), String> {
            if self.last_title.as_deref() == Some(now_playing.title.as_str()) {
                return Ok(());
            }
            let updater =
                self.controls.DisplayUpdater().map_err(|e| format!("DisplayUpdater: {e}"))?;
            updater.SetType(MediaPlaybackType::Music).map_err(|e| format!("SetType: {e}"))?;
            let music = updater.MusicProperties().map_err(|e| format!("MusicProperties: {e}"))?;
            music
                .SetTitle(&HSTRING::from(now_playing.title.as_str()))
                .map_err(|e| format!("SetTitle: {e}"))?;
            updater.Update().map_err(|e| format!("DisplayUpdater::Update: {e}"))?;
            self.last_title = Some(now_playing.title.clone());
            Ok(())
        }

        fn update_timeline(&mut self, now_playing: &NowPlaying) -> Result<(), String> {
            let (Some(position_ms), Some(duration_ms), Some(controls2)) =
                (now_playing.position_ms, now_playing.duration_ms, self.controls2.as_ref())
            else {
                return Ok(());
            };
            if !duration_ms.is_finite() || duration_ms <= 0.0 {
                return Ok(());
            }
            let props = SystemMediaTransportControlsTimelineProperties::new()
                .map_err(|e| format!("TimelineProperties::new: {e}"))?;
            let start = TimeSpan { Duration: 0 };
            let end = to_time_span(duration_ms);
            let position = to_time_span(position_ms.min(duration_ms));
            props.SetStartTime(start).map_err(|e| format!("SetStartTime: {e}"))?;
            props.SetMinSeekTime(start).map_err(|e| format!("SetMinSeekTime: {e}"))?;
            props.SetEndTime(end).map_err(|e| format!("SetEndTime: {e}"))?;
            props.SetMaxSeekTime(end).map_err(|e| format!("SetMaxSeekTime: {e}"))?;
            props.SetPosition(position).map_err(|e| format!("SetPosition: {e}"))?;
            // SAFETY: 两个指针都指向有效的 WinRT 对象，属性结构在调用期间存活。
            unsafe { update_timeline_properties(controls2, &props) }
                .map_err(|e| format!("UpdateTimelineProperties: {e}"))
        }
    }

    fn button_command(
        args: &SystemMediaTransportControlsButtonPressedEventArgs,
    ) -> Option<&'static str> {
        let button = args.Button().ok()?;
        match button {
            SystemMediaTransportControlsButton::Play => Some("play"),
            SystemMediaTransportControlsButton::Pause => Some("pause"),
            SystemMediaTransportControlsButton::Stop => Some("stop"),
            _ => None,
        }
    }

    fn playback_status(status: PlaybackStatus) -> MediaPlaybackStatus {
        match status {
            PlaybackStatus::Playing => MediaPlaybackStatus::Playing,
            PlaybackStatus::Paused => MediaPlaybackStatus::Paused,
            PlaybackStatus::Stopped => MediaPlaybackStatus::Stopped,
        }
    }

    /// 毫秒 → WinRT `TimeSpan`（100ns 计时单位）。
    fn to_time_span(milliseconds: f64) -> TimeSpan {
        TimeSpan { Duration: (milliseconds.max(0.0) * 10_000.0).round() as i64 }
    }

    /// `windows` 0.61 只把 `ISystemMediaTransportControls2` 投影成裸接口（无方法），
    /// 进度条所需的 `UpdateTimelineProperties` 只能按 vtable 调用。
    unsafe fn update_timeline_properties(
        controls: &ISystemMediaTransportControls2,
        props: &SystemMediaTransportControlsTimelineProperties,
    ) -> windows::core::Result<()> {
        let vtable = Interface::vtable(controls);
        // SAFETY: 由调用方保证两个对象有效；HRESULT 交给 `.ok()`。
        unsafe {
            (vtable.UpdateTimelineProperties)(Interface::as_raw(controls), Interface::as_raw(props))
        }
        .ok()
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn playback_status_maps_every_state() {
            assert_eq!(playback_status(PlaybackStatus::Playing), MediaPlaybackStatus::Playing);
            assert_eq!(playback_status(PlaybackStatus::Paused), MediaPlaybackStatus::Paused);
            assert_eq!(playback_status(PlaybackStatus::Stopped), MediaPlaybackStatus::Stopped);
        }

        #[test]
        fn timeline_converts_milliseconds_to_winrt_ticks() {
            assert_eq!(to_time_span(1_000.0).Duration, 10_000_000);
            assert_eq!(to_time_span(90_000.0).Duration, 900_000_000);
            // 负值（元素尚未就绪）钳到 0，避免系统卡片出现负数进度。
            assert_eq!(to_time_span(-5.0).Duration, 0);
        }

        #[test]
        fn clear_without_session_is_noop() {
            clear();
        }
    }
}
