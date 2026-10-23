//! `netprobe` provider: registry reachability probe (Task 10).
//!
//! Two lights only (`registry_ok`, `registry_latency_ms`): the
//! credential-presence third light is added in the server handler layer with
//! the existing `adl-credential` API. That crate offers no existence-only
//! query (only value-reading `get_password`), and a low-level probe must
//! never read secrets — so netprobe stays at two lights by design.
//!
//! Callers build the client once via `adl_download_source::build_http_client`
//! (proxy-aware) and pass the registry base from
//! `adl_download_source::resolve_registry`; no second client is built here.

use serde::{Deserialize, Serialize};

/// Registry reachability outcome: reachable flag plus round-trip latency.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Probe {
    pub registry_ok: bool,
    pub registry_latency_ms: u64,
}

/// HEAD the registry base with the caller-supplied short-timeout client.
/// HEAD is cheap (no body) and is the normal reachability probe; servers that
/// reject the method (405/501) or a transport failure fall back to the
/// historical GET so those registries still report correctly.
/// Any transport failure or non-2xx status → `registry_ok: false`
/// (never an error); latency is measured either way.
pub async fn check(client: &reqwest::Client, registry_base: &str) -> Probe {
    let start = std::time::Instant::now();
    let head = client.head(registry_base).send().await;
    let ok = match head {
        Ok(resp) if resp.status().is_success() => true,
        Ok(resp)
            if resp.status() != reqwest::StatusCode::METHOD_NOT_ALLOWED
                && resp.status() != reqwest::StatusCode::NOT_IMPLEMENTED =>
        {
            false
        },
        _ => client
            .get(registry_base)
            .send()
            .await
            .map(|resp| resp.status().is_success())
            .unwrap_or(false),
    };
    Probe {
        registry_ok: ok,
        registry_latency_ms: start.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
    }
}
