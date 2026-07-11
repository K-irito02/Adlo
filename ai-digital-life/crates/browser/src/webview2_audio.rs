#[cfg(windows)]
mod imp {
    use std::any::Any;
    use std::collections::HashMap;
    use std::sync::Mutex;

    use once_cell::sync::Lazy;
    use tauri::{Emitter, Manager, Webview};
    use webview2_com::IsDocumentPlayingAudioChangedEventHandler;
    use webview2_com::IsMutedChangedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2_17, ICoreWebView2_18,
    };
    use windows::core::IUnknown;
    use windows::core::Interface;

    type EventRegistrationToken = i64;

    /// Wrapper that makes COM handlers (which are `!Send` due to raw COM pointers)
    /// storable behind a `Mutex`. The handlers' closures capture only `Send` types
    /// (AppHandle, String), and COM's AddRef/Release are thread-safe.
    #[allow(dead_code)] // Inner field is write-only: struct exists to keep COM handlers alive, never downcast
    struct HandlerBox(Box<dyn Any>);
    unsafe impl Send for HandlerBox {}

    /// Stores COM handler interface pointers to prevent premature drop.
    /// WebView2 internally calls AddRef on handlers, but keeping the Rust-side
    /// wrappers alive is a defense-in-depth measure against potential COM interop edge cases.
    static HANDLER_STORE: Lazy<Mutex<HashMap<String, Vec<HandlerBox>>>> =
        Lazy::new(|| Mutex::new(HashMap::new()));

    pub fn cleanup_audio_handler(tab_id: &str) {
        // Recover from poisoned lock — clearing stale data is safe
        let mut store = HANDLER_STORE.lock().unwrap_or_else(|e| e.into_inner());
        store.remove(tab_id);
    }

    pub fn setup_audio_changed_handler(webview: Webview, tab_id: &str) -> Result<(), String> {
        let app = webview.app_handle().clone();
        let tid = tab_id.to_string();

        // Remove any stale handlers for this tab before creating new ones
        cleanup_audio_handler(&tid);

        let result = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();

            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!(tab_id = %tid, "failed to get CoreWebView2: {e}");
                    return;
                },
            };

            let core17: ICoreWebView2_17 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!(tab_id = %tid, "ICoreWebView2_17 not available: {e}");
                    return;
                },
            };

            let app_for_audio = app.clone();
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
                    let app = app_for_audio.clone();
                    let _ = app.emit(
                        "digital-life://browser-audio-changed",
                        serde_json::json!({
                            "tabId": tid_for_audio,
                            "isPlaying": is_playing,
                            "isMuted": is_muted,
                        }),
                    );
                    Ok(())
                },
            ));

            let mut token: EventRegistrationToken = 0;
            if let Err(e) = core17
                .add_IsDocumentPlayingAudioChanged(&audio_handler, &mut token as *mut _ as *mut _)
            {
                tracing::error!(tab_id = %tid, "add_IsDocumentPlayingAudioChanged failed: {e}");
                return;
            }

            let core18: ICoreWebView2_18 = match core17.cast() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!(tab_id = %tid, "ICoreWebView2_18 not available: {e}");
                    return;
                },
            };

            let app_for_mute = app.clone();
            let tid_for_mute = tid.clone();
            let mute_handler = IsMutedChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| {
                    let Some(sender) = sender else {
                        return Ok(());
                    };
                    let core18: ICoreWebView2_18 = match sender.cast() {
                        Ok(c) => c,
                        Err(_) => return Ok(()),
                    };
                    let mut is_muted_val: windows::core::BOOL = windows::core::BOOL(0);
                    let _ = core18.IsMuted(&mut is_muted_val);
                    let is_muted = is_muted_val.0 != 0;
                    let app = app_for_mute.clone();
                    let _ = app.emit(
                        "digital-life://browser-audio-changed",
                        serde_json::json!({
                            "tabId": tid_for_mute,
                            "isMuted": is_muted,
                        }),
                    );
                    Ok(())
                },
            ));

            let mut mute_token: EventRegistrationToken = 0;
            if let Err(e) =
                core18.add_IsMutedChanged(&mute_handler, &mut mute_token as *mut _ as *mut _)
            {
                tracing::error!(tab_id = %tid, "add_IsMutedChanged failed: {e}");
                return;
            }

            // Store handlers to keep them alive — recovers from poisoned lock
            let mut store = HANDLER_STORE.lock().unwrap_or_else(|e| e.into_inner());
            let entry = store.entry(tid.clone()).or_default();
            entry.push(HandlerBox(Box::new(audio_handler)));
            entry.push(HandlerBox(Box::new(mute_handler)));

            tracing::info!(tab_id = %tid, "audio handlers registered (ICoreWebView2_17 + _18)");
        });

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("with_webview failed: {e}")),
        }
    }

    pub fn mute_tab(webview: &Webview, muted: bool) -> Result<(), String> {
        let result = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();

            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("failed to get CoreWebView2: {e}");
                    return;
                },
            };

            let core18: ICoreWebView2_18 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("ICoreWebView2_18 not available for mute: {e}");
                    return;
                },
            };

            if let Err(e) = core18.SetIsMuted(muted) {
                tracing::error!("SetIsMuted failed: {e}");
                return;
            }

            tracing::info!(muted = %muted, "tab audio mute toggled");
        });

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("with_webview failed: {e}")),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::Webview;
    use tracing::debug;

    pub fn setup_audio_changed_handler(_webview: Webview, _tab_id: &str) -> Result<(), String> {
        debug!("audio handler not available on non-Windows");
        Ok(())
    }

    pub fn mute_tab(_webview: &Webview, _muted: bool) -> Result<(), String> {
        debug!("mute tab not available on non-Windows");
        Ok(())
    }
}

pub use imp::{cleanup_audio_handler, mute_tab, setup_audio_changed_handler};
