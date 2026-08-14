//! 爬虫策略：私网判定、robots 缓存、域名限速。
//!
//! 纯逻辑 + `std::sync::Mutex`，不依赖 reqwest/tokio，便于单测。
//! 供 Tauri 端 `fetch_page_meta_inner` 使用；前端对应 `frontend/dev/crawlerPolicy.ts`。

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use url::Url;

use crate::robots_txt::RobotsRules;

/// robots.txt 内存缓存 TTL：1 小时。
pub const ROBOTS_CACHE_TTL: Duration = Duration::from_secs(3600);

/// URL 是否指向本地/私网（跳过 robots 检查与限速）。
/// 判定失败（无法解析）按私网处理，保证本地开发不阻塞。
pub fn is_private_url(url_str: &str) -> bool {
    let Ok(url) = Url::parse(url_str) else {
        return true;
    };
    let Some(host) = url.host() else {
        return true;
    };
    match host {
        url::Host::Domain(d) => d.eq_ignore_ascii_case("localhost"),
        url::Host::Ipv4(ip) => {
            ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified()
        },
        url::Host::Ipv6(ip) => ip.is_loopback() || ip.is_unspecified(),
    }
}

/// 提取 URL 的 host（域名），解析失败返回 `None`。
pub fn domain_of(url_str: &str) -> Option<String> {
    Url::parse(url_str).ok().and_then(|u| u.host_str().map(|s| s.to_string()))
}

/// 按域名内存缓存 robots 规则，TTL 内命中，过期视为未命中（重新拉取）。
#[derive(Default)]
pub struct RobotsCache {
    entries: Mutex<HashMap<String, (Instant, RobotsRules)>>,
}

impl RobotsCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, domain: &str, now: Instant) -> Option<RobotsRules> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        match entries.get(domain) {
            Some((fetched_at, rules)) if now.duration_since(*fetched_at) < ROBOTS_CACHE_TTL => {
                Some(rules.clone())
            },
            _ => None,
        }
    }

    pub fn insert(&self, domain: &str, rules: RobotsRules, now: Instant) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.insert(domain.to_string(), (now, rules));
    }
}

/// 每域名限速器：同一域名在窗口期内至多允许一次。超限返回 false（调用方走兜底）。
pub struct DomainRateLimiter {
    last_allowed: Mutex<HashMap<String, Instant>>,
    window: Duration,
}

impl DomainRateLimiter {
    pub fn new(window: Duration) -> Self {
        Self { last_allowed: Mutex::new(HashMap::new()), window }
    }

    pub fn try_acquire(&self, domain: &str, now: Instant) -> bool {
        let mut last = self.last_allowed.lock().unwrap_or_else(|e| e.into_inner());
        match last.get(domain) {
            Some(prev) if now.duration_since(*prev) < self.window => false,
            _ => {
                last.insert(domain.to_string(), now);
                true
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn now() -> Instant {
        Instant::now()
    }

    #[test]
    fn private_url_detection() {
        assert!(is_private_url("http://localhost:3000"));
        assert!(is_private_url("http://127.0.0.1/"));
        assert!(is_private_url("http://127.0.0.1:5173/x"));
        assert!(is_private_url("http://192.168.1.1/"));
        assert!(is_private_url("http://10.0.0.5/"));
        assert!(is_private_url("http://172.16.5.5/"));
        assert!(is_private_url("http://169.254.1.1/"));
        assert!(is_private_url("not-a-url"));
        assert!(is_private_url("http://[::1]/"));
    }

    #[test]
    fn public_url_not_private() {
        assert!(!is_private_url("https://example.com/"));
        assert!(!is_private_url("https://github.com/K-irito02/Kora"));
        assert!(!is_private_url("http://8.8.8.8/"));
    }

    #[test]
    fn domain_of_extracts_host() {
        assert_eq!(domain_of("https://example.com/a/b").as_deref(), Some("example.com"));
        assert_eq!(domain_of("https://a.example.com:8080/x").as_deref(), Some("a.example.com"));
        assert_eq!(domain_of("not-a-url"), None);
    }

    #[test]
    fn robots_cache_hits_within_ttl_and_expires_after() {
        let cache = RobotsCache::new();
        let t0 = now();
        cache.insert("example.com", parse_robots_txt("User-agent: *\nDisallow: /x"), t0);
        assert!(cache.get("example.com", t0 + Duration::from_secs(600)).is_some());
        assert!(cache.get("example.com", t0 + ROBOTS_CACHE_TTL + Duration::from_secs(1)).is_none());
        assert!(cache.get("other.com", t0).is_none());
    }

    #[test]
    fn rate_limiter_blocks_same_domain_within_window() {
        let limiter = DomainRateLimiter::new(Duration::from_secs(5));
        let t0 = now();
        assert!(limiter.try_acquire("example.com", t0));
        assert!(!limiter.try_acquire("example.com", t0 + Duration::from_secs(2)));
        assert!(limiter.try_acquire("example.com", t0 + Duration::from_secs(5)));
        assert!(limiter.try_acquire("other.com", t0)); // 异域不受影响
    }

    fn parse_robots_txt(_raw: &str) -> crate::robots_txt::RobotsRules {
        crate::robots_txt::parse_robots_txt(_raw)
    }
}
