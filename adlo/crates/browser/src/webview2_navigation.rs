//! WebView2 navigation helpers that need request headers.
//!
//! The native new-window path is denied by the host, so a page-initiated new
//! tab is created by the frontend and navigated from `about:blank`. A plain
//! `Navigate` loses the originating document as `Referer`; sites that gate
//! hotlinking or use `document.referrer` then behave differently from a normal
//! browser. `NavigateWithWebResourceRequest` lets us attach the header to that
//! first navigation.

#[cfg(windows)]
pub fn navigate_core_with_referrer(
    environment: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment,
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    url: &str,
    referrer: &str,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_2, ICoreWebView2Environment2,
    };
    use windows::Win32::System::Com::IStream;
    use windows::core::{HSTRING, Interface};

    unsafe {
        let environment2: ICoreWebView2Environment2 =
            environment.cast().map_err(|e| format!("cast ICoreWebView2Environment2: {e}"))?;
        // CreateWebResourceRequest takes the extra headers as a CRLF-delimited
        // string (not a headers object). A single Referer header is enough.
        let headers = HSTRING::from(format!("Referer: {referrer}\r\n"));
        let request = environment2
            .CreateWebResourceRequest(
                &HSTRING::from(url),
                &HSTRING::from("GET"),
                None::<&IStream>,
                &headers,
            )
            .map_err(|e| format!("CreateWebResourceRequest: {e}"))?;
        let core2: ICoreWebView2_2 =
            core.cast().map_err(|e| format!("cast ICoreWebView2_2: {e}"))?;
        core2
            .NavigateWithWebResourceRequest(&request)
            .map_err(|e| format!("NavigateWithWebResourceRequest: {e}"))
    }
}
