use lru::LruCache;
use std::collections::HashMap;
use std::num::NonZeroUsize;

/// In-memory cache for extracted log data.
/// key: run_id, value: map of job_id → log_text
/// Uses `lru::LruCache` for O(1) get/insert with automatic LRU eviction.
pub(crate) struct CiLogCache {
    inner: LruCache<u64, HashMap<u64, String>>,
}

impl CiLogCache {
    pub(crate) fn new(max_entries: usize) -> Self {
        let cap = NonZeroUsize::new(max_entries.max(1)).unwrap_or(NonZeroUsize::MIN);
        Self { inner: LruCache::new(cap) }
    }

    pub(crate) fn get(&mut self, run_id: &u64) -> Option<&HashMap<u64, String>> {
        self.inner.get(run_id)
    }

    pub(crate) fn insert(&mut self, run_id: u64, logs: HashMap<u64, String>) {
        self.inner.put(run_id, logs);
    }
}
