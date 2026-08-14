/**
 * Canonical User-Agent string for outbound HTTP requests from the browser
 * subsystem (Vite preview proxy + robots.txt gate).
 *
 * Rust side mirrors this exact string in `src-tauri/src/commands/browser.rs`
 * (`USER_AGENT` const). Update both locations together — they must stay in sync
 * so that Tauri-mode and preview-mode requests appear identical to servers.
 * This is a compliant crawler identity (robots.txt product token: `AIDigitalLife`),
 * not a browser UA spoof.
 */
export const USER_AGENT =
  'AIDigitalLife/1.0 (+https://github.com/K-irito02/Kora; MetaFetcher)';
