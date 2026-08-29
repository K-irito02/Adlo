//! Capture the live WebView2 `DownloadOperation` handle for each download so that
//! pause/resume/cancel can actually control the native engine (not just flip a DB
//! flag). We attach our own `add_DownloadStarting` handler to the `ICoreWebView2`
//! core — in addition to wry's own handler, which discards the operation.

#[cfg(windows)]
pub fn setup_download_operation_capture(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    manager: &crate::download_manager::DownloadManager,
    is_silent: bool,
) -> Result<(), String> {
    // A silent (background metadata) webview cancels every download it triggers,
    // so its DownloadOperation handles are always dead. Registering them would
    // overwrite a genuine paused/in-progress operation for the same URL (the
    // meta fetch of an installer URL fires DownloadStarting right after the real
    // transfer paused) — leaving Resume() on a cancelled operation (fails with
    // 0x8007139F) and a progress monitor that sees a stale INTERRUPTED handle.
    // Skip the capture entirely for silent webviews.
    if is_silent {
        return Ok(());
    }
    use webview2_com::DownloadStartingEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2_4, ICoreWebView2DownloadOperation,
        ICoreWebView2DownloadStartingEventArgs,
    };
    use webview2_com::take_pwstr;
    use windows::core::Interface;

    let manager = manager.clone();

    // `add_DownloadStarting` lives on ICoreWebView2_4 and later; cast the core.
    let core: ICoreWebView2_4 = match core.cast() {
        Ok(c) => c,
        Err(e) => return Err(format!("ICoreWebView2_4 cast failed: {e}")),
    };

    // Store the operation keyed by its URI. The DB record's `url` equals the same
    // URI (wry passes `DownloadOperation().Uri()` into the started handler), so the
    // pause/resume/cancel commands can look it up by record url.
    let handler = DownloadStartingEventHandler::create(Box::new(
        move |_sender: Option<ICoreWebView2>,
              args: Option<ICoreWebView2DownloadStartingEventArgs>| {
            let Some(args) = args else {
                return Ok(());
            };
            let op: ICoreWebView2DownloadOperation = match unsafe { args.DownloadOperation() } {
                Ok(op) => op,
                Err(e) => {
                    tracing::warn!(error = %e, "[ADL-DL] setup_download_operation_capture: failed to get DownloadOperation");
                    return Ok(());
                },
            };
            let uri = {
                let mut p = windows::core::PWSTR::null();
                match unsafe { op.Uri(&mut p) } {
                    Ok(()) => take_pwstr(p),
                    Err(_) => String::new(),
                }
            };
            if uri.is_empty() {
                return Ok(());
            }
            // The manager logs the capture decision (including when it keeps an
            // existing IN_PROGRESS operation instead of a silent-webview duplicate).
            manager.register_operation(&uri, op);
            Ok(())
        },
    ));

    let mut token: i64 = 0;
    unsafe { core.add_DownloadStarting(&handler, &mut token) }
        .map_err(|e| format!("add_DownloadStarting failed: {e}"))?;

    tracing::info!("[ADL-DL] setup_download_operation_capture: DownloadStarting handler attached");
    Ok(())
}
