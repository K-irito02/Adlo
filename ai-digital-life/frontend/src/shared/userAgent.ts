/**
 * Canonical User-Agent string for outbound HTTP requests from the browser
 * subsystem (Tauri WebView navigation + Vite preview proxy).
 *
 * Rust side mirrors this exact string in `src-tauri/src/commands/browser.rs`
 * (`USER_AGENT` const). Update both locations together — they must stay in sync
 * so that Tauri-mode and preview-mode requests appear identical to servers.
 */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
