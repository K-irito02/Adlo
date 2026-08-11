//! Anthropic cache breakpoint allocation, mirroring OpenCode's
//! `ANTHROPIC_BREAKPOINT_CAP` (cap 4). Breakpoints are ephemeral TTL cache
//! markers: exhausting them is safe — callers simply drop the marker.

/// Anthropic only accepts `5m` / `1h` cache TTLs.
pub fn ttl_bucket(ttl_seconds: Option<u64>) -> Option<&'static str> {
    match ttl_seconds {
        Some(s) if s >= 3600 => Some("1h"),
        _ => Some("5m"),
    }
}

/// Tracks how many Anthropic cache breakpoints remain and how many were dropped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CacheBreakpoints {
    remaining: u32,
    dropped: u32,
}

impl CacheBreakpoints {
    pub const CAP: u32 = 4;

    pub fn new() -> Self {
        Self { remaining: Self::CAP, dropped: 0 }
    }

    /// Try to reserve a breakpoint. Returns `true` if granted, `false` if the
    /// cap was reached (and the caller should skip marking).
    pub fn allocate(&mut self) -> bool {
        if self.remaining == 0 {
            self.dropped += 1;
            false
        } else {
            self.remaining -= 1;
            true
        }
    }

    pub fn dropped(&self) -> u32 {
        self.dropped
    }
}

impl Default for CacheBreakpoints {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::CachePolicy;

    #[test]
    fn breakpoints_start_at_cap() {
        let mut b = CacheBreakpoints::new();
        for _ in 0..4 {
            assert!(b.allocate(), "should allocate within cap");
        }
        assert!(!b.allocate(), "cap reached");
        assert_eq!(b.dropped(), 1);
    }

    #[test]
    fn allocate_after_full_drops() {
        let mut b = CacheBreakpoints::new();
        for _ in 0..8 {
            b.allocate();
        }
        assert_eq!(b.dropped(), 4);
    }

    #[test]
    fn ttl_bucket_maps_hour_and_minute() {
        assert_eq!(ttl_bucket(Some(3600)), Some("1h"));
        assert_eq!(ttl_bucket(Some(7200)), Some("1h"));
        assert_eq!(ttl_bucket(Some(300)), Some("5m"));
        assert_eq!(ttl_bucket(None), Some("5m"));
    }

    #[test]
    fn cache_policy_default_is_auto() {
        assert_eq!(CachePolicy::default(), CachePolicy::Auto);
    }
}
