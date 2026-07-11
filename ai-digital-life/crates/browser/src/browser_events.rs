use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::{Duration, Instant};

fn normalize_url(raw: &str) -> String {
    let mut s = raw.split('#').next().unwrap_or(raw).to_string();
    if s.len() > 8 && s.ends_with('/') {
        let trimmed = s.trim_end_matches('/');
        if !trimmed.is_empty() {
            s = trimmed.to_string();
        }
    }
    s
}

pub(crate) struct LastEmit {
    pub(crate) url: String,
    pub(crate) time: Instant,
}

pub(crate) static LAST_EMIT: Mutex<Option<LastEmit>> = Mutex::new(None);
pub(crate) const EMIT_DEDUP_WINDOW: Duration = Duration::from_secs(4);

/// Signal: tell poll thread to enter fast-poll mode immediately.
/// Set by the HistoryChanged COM handler (Method 5) when SPA pushState is detected.
pub(crate) static POLL_FAST_NOW: AtomicBool = AtomicBool::new(false);

pub fn navigation_handler<F: Fn(&str)>(url: &url::Url, emit_url: &F) -> bool {
    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }
    let normalized = normalize_url(url.as_str());

    let should_emit = {
        if let Ok(guard) = LAST_EMIT.lock() {
            !matches!(guard.as_ref(), Some(last) if last.url == normalized && last.time.elapsed() < EMIT_DEDUP_WINDOW)
        } else {
            true
        }
    };

    if should_emit {
        if let Ok(mut guard) = LAST_EMIT.lock() {
            *guard = Some(LastEmit { url: normalized.clone(), time: Instant::now() });
        }
        emit_url(&normalized);
    }
    true
}
