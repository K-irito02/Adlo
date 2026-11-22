#[cfg(windows)]
mod imp {
    use std::any::Any;
    use std::collections::HashMap;
    use std::sync::Arc;
    use std::sync::Mutex;

    use once_cell::sync::Lazy;
    use webview2_com::IsDocumentPlayingAudioChangedEventHandler;
    use webview2_com::IsMutedChangedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2_17, ICoreWebView2_18,
    };
    use windows::core::IUnknown;
    use windows::core::Interface;

    use crate::WebView2EventBridge;

    type EventRegistrationToken = i64;

    #[allow(dead_code)]
    struct HandlerBox(Box<dyn Any>);
    unsafe impl Send for HandlerBox {}

    static HANDLER_STORE: Lazy<Mutex<HashMap<String, Vec<HandlerBox>>>> =
        Lazy::new(|| Mutex::new(HashMap::new()));

    pub fn cleanup_audio_handler(tab_id: &str) {
        let mut store = HANDLER_STORE.lock().unwrap_or_else(|e| e.into_inner());
        store.remove(tab_id);
    }

    pub fn setup_audio_changed_handler(
        core: &ICoreWebView2,
        tab_id: &str,
        bridge: &Arc<dyn WebView2EventBridge>,
    ) -> Result<(), String> {
        let tid = tab_id.to_string();
        cleanup_audio_handler(&tid);

        unsafe {
            let core17: ICoreWebView2_17 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!(tab_id = %tid, "ICoreWebView2_17 not available: {e}");
                    return Ok(());
                },
            };

            let bridge_for_audio = bridge.clone();
            let tid_for_audio = tid.clone();
            let audio_handler = IsDocumentPlayingAudioChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| {
                    let Some(sender) = sender else {
                        return Ok(());
                    };
                    let core17: ICoreWebView2_17 = match sender.cast() {
                        Ok(c) => c,
                        Err(_) => return Ok(()),
                    };
                    let mut is_playing_val: windows::core::BOOL = windows::core::BOOL(0);
                    let _ = core17.IsDocumentPlayingAudio(&mut is_playing_val);
                    let is_playing = is_playing_val.0 != 0;
                    let core18: ICoreWebView2_18 = match core17.cast() {
                        Ok(c) => c,
                        Err(_) => return Ok(()),
                    };
                    let mut is_muted_val: windows::core::BOOL = windows::core::BOOL(0);
                    let _ = core18.IsMuted(&mut is_muted_val);
                    let is_muted = is_muted_val.0 != 0;
                    bridge_for_audio.emit_audio_changed(&tid_for_audio, is_playing, is_muted);
                    Ok(())
                },
            ));

            let mut token: EventRegistrationToken = 0;
            if let Err(e) = core17
                .add_IsDocumentPlayingAudioChanged(&audio_handler, &mut token as *mut _ as *mut _)
            {
                tracing::error!(tab_id = %tid, "add_IsDocumentPlayingAudioChanged failed: {e}");
                return Ok(());
            }

            let core18: ICoreWebView2_18 = match core17.cast() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!(tab_id = %tid, "ICoreWebView2_18 not available: {e}");
                    return Ok(());
                },
            };

            let bridge_for_mute = bridge.clone();
            let tid_for_mute = tid.clone();
            let mute_handler = IsMutedChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| {
                    let Some(sender) = sender else {
                        return Ok(());
                    };
                    // 读取当前实际播放状态：静音变化不应改变播放状态——此前硬编码
                    // is_playing=false 会把"正在播放"错误清零，导致音量图标闪烁消失
                    // （2026-08-21 事项 7 根因 1）。
                    let core17: ICoreWebView2_17 = match sender.cast() {
                        Ok(c) => c,
                        Err(_) => return Ok(()),
                    };
                    let mut is_playing_val: windows::core::BOOL = windows::core::BOOL(0);
                    let _ = core17.IsDocumentPlayingAudio(&mut is_playing_val);
                    let is_playing = is_playing_val.0 != 0;
                    let core18: ICoreWebView2_18 = match core17.cast() {
                        Ok(c) => c,
                        Err(_) => return Ok(()),
                    };
                    let mut is_muted_val: windows::core::BOOL = windows::core::BOOL(0);
                    let _ = core18.IsMuted(&mut is_muted_val);
                    let is_muted = is_muted_val.0 != 0;
                    bridge_for_mute.emit_audio_changed(&tid_for_mute, is_playing, is_muted);
                    Ok(())
                },
            ));

            let mut mute_token: EventRegistrationToken = 0;
            if let Err(e) =
                core18.add_IsMutedChanged(&mute_handler, &mut mute_token as *mut _ as *mut _)
            {
                tracing::error!(tab_id = %tid, "add_IsMutedChanged failed: {e}");
                return Ok(());
            }

            let mut store = HANDLER_STORE.lock().unwrap_or_else(|e| e.into_inner());
            let entry = store.entry(tid.clone()).or_default();
            entry.push(HandlerBox(Box::new(audio_handler)));
            entry.push(HandlerBox(Box::new(mute_handler)));

            if tid.starts_with("silent_") {
                // 静默 WebView（可见标签/显式刷新触发）逐条 INFO 会淹没终端。
                tracing::debug!(tab_id = %tid, "audio handlers registered for silent tab");
            } else {
                tracing::info!(tab_id = %tid, "audio handlers registered (ICoreWebView2_17 + _18)");
            }
        }

        Ok(())
    }

    pub fn mute_tab(core: &ICoreWebView2, muted: bool) -> Result<(), String> {
        unsafe {
            let core18: ICoreWebView2_18 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("ICoreWebView2_18 not available for mute: {e}");
                    return Err(format!("ICoreWebView2_18 not available: {e}"));
                },
            };

            if let Err(e) = core18.SetIsMuted(muted) {
                tracing::error!("SetIsMuted failed: {e}");
                return Err(format!("SetIsMuted failed: {e}"));
            }

            tracing::info!(muted = %muted, "tab audio mute toggled");
        }

        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    use tracing::debug;

    pub fn setup_audio_changed_handler(_tab_id: &str) -> Result<(), String> {
        debug!("audio handler not available on non-Windows");
        Ok(())
    }

    pub fn mute_tab(_muted: bool) -> Result<(), String> {
        debug!("mute tab not available on non-Windows");
        Ok(())
    }
}

pub use imp::{cleanup_audio_handler, mute_tab, setup_audio_changed_handler};
