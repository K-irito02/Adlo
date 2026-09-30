use tauri::{Emitter, Manager};

use crate::commands::ipc;
use crate::error::CommandError;
use adl_browser::webview_handle::{Bounds, sanitize_strip_bounds};
use adl_errors::AppError;
use adl_types::IpcResult;

/// WebView label for the transparent divider-strip child webview.
///
/// The strip straddles the center/right-panel boundary so the panel resize
/// handle stays grabbable when two OS-level WebView2 children (dsh host +
/// browser tab) adjoin edge-to-edge with zero visual gap. Deliberately
/// isolated from browser tab labels and never registered with
/// `BrowserManager`.
pub const STRIP_VIEW_LABEL: &str = "adl-divider-strip";

/// Strip control page served from the frontend bundle (`frontend/divider-strip.html`).
const STRIP_PAGE: &str = "divider-strip.html";

/// Theme payload for the strip control surface. Colors are resolved CSS values
/// read from the main document at show time, because the strip is a separate
/// document that cannot see the main window's custom properties.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StripTheme {
    pub line: String,
    pub glow: String,
}

/// Show (idempotent recreate) the divider strip at the given bounds.
///
/// Destroy-then-create doubles as z-order reassertion: the strip must stay
/// above sibling child webviews, and a freshly attached child is topmost.
/// Must stay `async` — creating webviews on Windows deadlocks in synchronous
/// commands (see the WebView2 issue referenced by `WebviewBuilder::new`).
#[tauri::command]
pub async fn divider_strip_show(
    app: tauri::AppHandle,
    bounds: Bounds,
    theme: StripTheme,
    aria_label: String,
    lang: String,
) -> Result<IpcResult<()>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), AppError> {
            let window = app_inner
                .get_window("main")
                .ok_or_else(|| AppError::Internal("main window not found".into()))?;
            // Validate before destroying: a transient bad input must not take
            // down a healthy strip (S19).
            let sanitized = sanitize_strip_bounds(&bounds)
                .ok_or_else(|| AppError::Internal("divider strip: non-finite bounds".into()))?;
            destroy_strip_view(&window)?;

            let config_script = strip_init_script(&theme, &aria_label, &lang)?;
            let builder = tauri::webview::WebviewBuilder::new(
                STRIP_VIEW_LABEL,
                tauri::WebviewUrl::App(STRIP_PAGE.into()),
            )
            .transparent(true)
            .focused(false)
            .initialization_script(config_script)
            .on_navigation(|url| {
                // The strip is a local control surface: only the app page may
                // load — the asset protocol host differs per platform
                // (`asset.localhost` on Windows/Linux, `localhost` on macOS,
                // loopback in dev builds). Denials are warned: the guard runs
                // once per strip lifetime, so this never spams.
                let allowed = url.scheme() == "tauri"
                    || url.host_str().is_some_and(|h| {
                        h == "localhost" || h == "127.0.0.1" || h == "asset.localhost"
                    });
                if !allowed {
                    tracing::warn!(url = %url, "divider strip blocked unexpected navigation");
                }
                allowed
            });
            window
                .add_child(
                    builder,
                    tauri::LogicalPosition::new(-10000.0, -10000.0),
                    tauri::LogicalSize::new(800.0, 600.0),
                )
                .map_err(|e| AppError::Internal(format!("failed to create divider strip: {e}")))?;
            // 建窗失败不留离屏残留：失败原子化（L-1）。
            set_strip_bounds(&window, &sanitized).inspect_err(|_| {
                let _ = destroy_strip_view(&window);
            })?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch: {e}")))?;

    Ok(ipc(rx.await.map_err(|e| AppError::Internal(format!("show channel: {e}")))?))
}

/// Reposition / resize the divider strip.
///
/// A missing strip is a no-op `Ok`: bounds updates routinely race hide/show
/// reconciliation, and erroring would spam the frontend log.
#[tauri::command]
pub async fn divider_strip_set_bounds(
    app: tauri::AppHandle,
    bounds: Bounds,
) -> Result<IpcResult<()>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();
    // Degenerate input is a no-op `Ok`, mirroring the missing-strip case above.
    let Some(bounds) = sanitize_strip_bounds(&bounds) else {
        return Ok(ipc(Ok(())));
    };

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), AppError> {
            let window = app_inner
                .get_window("main")
                .ok_or_else(|| AppError::Internal("main window not found".into()))?;
            if window.get_webview(STRIP_VIEW_LABEL).is_some() {
                set_strip_bounds(&window, &bounds)?;
            }
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch: {e}")))?;

    Ok(ipc(rx.await.map_err(|e| AppError::Internal(format!("set bounds channel: {e}")))?))
}

/// Destroy the divider strip (no-op if absent).
#[tauri::command]
pub async fn divider_strip_hide(app: tauri::AppHandle) -> Result<IpcResult<()>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), AppError> {
            let window = app_inner
                .get_window("main")
                .ok_or_else(|| AppError::Internal("main window not found".into()))?;
            destroy_strip_view(&window)?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch: {e}")))?;

    Ok(ipc(rx.await.map_err(|e| AppError::Internal(format!("hide channel: {e}")))?))
}

/// Forward a strip drag report to the main window frontend.
///
/// The strip is a separate document and cannot touch panel state; the main
/// window owns all resize geometry. Reports are fire-and-forget from the
/// strip's side; ordering across reports is guarded by `seq` in the frontend.
/// The strip page (`divider-strip.html`) invokes this command — keep
/// `divider_strip_drag` allowed in `digital-life.toml`.
#[tauri::command]
pub async fn divider_strip_drag(
    app: tauri::AppHandle,
    seq: u64,
    phase: String,
    dx: f64,
) -> Result<IpcResult<()>, CommandError> {
    if phase != "start" && phase != "move" && phase != "end" {
        tracing::warn!(phase = %phase, "divider_strip_drag: unknown phase, ignored");
        return Ok(ipc(Ok(())));
    }
    let dx = if dx.is_finite() { dx } else { 0.0 };
    let _ = app.emit(
        "digital-life://divider-strip-drag",
        serde_json::json!({ "seq": seq, "phase": phase, "dx": dx }),
    );
    Ok(ipc(Ok(())))
}

/// Close the strip webview if present (no-op if absent).
fn destroy_strip_view(window: &tauri::Window<tauri::Wry>) -> Result<(), AppError> {
    if let Some(webview) = window.get_webview(STRIP_VIEW_LABEL) {
        webview
            .close()
            .map_err(|e| AppError::Internal(format!("failed to close divider strip: {e}")))?;
    }
    Ok(())
}

/// Position a labelled strip child webview to physical bounds.
///
/// Mirrors the `browser_set_dsh_bounds` convention (CSS pixels treated as
/// physical) so the strip aligns pixel-perfect with its sibling webviews.
fn set_strip_bounds(window: &tauri::Window<tauri::Wry>, bounds: &Bounds) -> Result<(), AppError> {
    let webview = window.get_webview(STRIP_VIEW_LABEL).ok_or_else(|| {
        AppError::Internal(format!("failed to set bounds: {STRIP_VIEW_LABEL} not found"))
    })?;
    let rect = tauri::Rect {
        position: tauri::Position::Physical(tauri::PhysicalPosition::new(
            bounds.x as i32,
            bounds.y as i32,
        )),
        size: tauri::Size::Physical(tauri::PhysicalSize::new(
            bounds.width.max(0.0) as u32,
            bounds.height.max(0.0) as u32,
        )),
    };
    webview
        .set_bounds(rect)
        .map_err(|e| AppError::Internal(format!("failed to set strip bounds: {e}")))
}

/// Inject the strip runtime config before page scripts run.
fn strip_init_script(theme: &StripTheme, aria_label: &str, lang: &str) -> Result<String, AppError> {
    let theme_json = serde_json::to_string(theme)
        .map_err(|e| AppError::Internal(format!("strip theme: {e}")))?;
    let label_json = serde_json::to_string(aria_label)
        .map_err(|e| AppError::Internal(format!("strip label: {e}")))?;
    let lang_json =
        serde_json::to_string(lang).map_err(|e| AppError::Internal(format!("strip lang: {e}")))?;
    Ok(format!(
        "window.__DIVIDER_STRIP__={{theme:{theme_json},ariaLabel:{label_json},lang:{lang_json}}};"
    ))
}
