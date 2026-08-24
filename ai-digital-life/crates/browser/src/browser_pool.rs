use std::collections::HashSet;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

fn lock_pool(inner: &Mutex<Vec<String>>) -> MutexGuard<'_, Vec<String>> {
    inner.lock().unwrap_or_else(PoisonError::into_inner)
}

fn lock_protected(inner: &Mutex<HashSet<String>>) -> MutexGuard<'_, HashSet<String>> {
    inner.lock().unwrap_or_else(PoisonError::into_inner)
}

#[derive(Debug, Clone)]
pub struct BrowserPool {
    inner: Arc<Mutex<Vec<String>>>,
    /// Tabs that must not be LRU-evicted (pinned / playing audio), mirroring
    /// Chrome/Edge protection of pinned & audio tabs from discard.
    protected: Arc<Mutex<HashSet<String>>>,
    capacity: usize,
}

impl BrowserPool {
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Vec::new())),
            protected: Arc::new(Mutex::new(HashSet::new())),
            capacity,
        }
    }

    /// Register a tab. If pool is full, returns the LRU tab_id to evict;
    /// protected tabs are skipped. If every pooled tab is protected, the pool
    /// is allowed to grow past `capacity` instead of evicting a protected tab.
    pub fn register(&self, tab_id: String) -> Option<String> {
        let mut order = lock_pool(&self.inner);
        order.retain(|id| id != &tab_id);
        let protected = lock_protected(&self.protected);

        if order.len() >= self.capacity {
            if let Some(pos) = order.iter().position(|id| !protected.contains(id)) {
                let evicted = order.remove(pos);
                order.push(tab_id);
                return Some(evicted);
            }
            // All pooled tabs are protected — grow instead of evicting one.
            tracing::debug!(
                pool_size = order.len(),
                "pool full but all tabs protected, growing past capacity"
            );
        }

        order.push(tab_id);
        None
    }

    /// Mark a tab as protected (immune to LRU eviction). No-op unlock is fine.
    pub fn set_protected(&self, tab_id: &str, is_protected: bool) {
        let mut protected = lock_protected(&self.protected);
        if is_protected {
            protected.insert(tab_id.to_string());
        } else {
            protected.remove(tab_id);
        }
    }

    /// Mark a tab as recently used (move to end of list). No-op if tab not in pool.
    pub fn touch(&self, tab_id: &str) {
        let mut order = lock_pool(&self.inner);
        if order.iter().any(|id| id == tab_id) {
            order.retain(|id| id != tab_id);
            order.push(tab_id.to_string());
        }
    }

    /// Remove a tab from the pool.
    pub fn remove(&self, tab_id: &str) {
        lock_pool(&self.inner).retain(|id| id != tab_id);
        lock_protected(&self.protected).remove(tab_id);
    }

    /// Returns the least-recently-used tab_id, if any.
    pub fn get_lru(&self) -> Option<String> {
        lock_pool(&self.inner).first().cloned()
    }

    pub fn is_full(&self) -> bool {
        lock_pool(&self.inner).len() >= self.capacity
    }

    pub fn size(&self) -> usize {
        lock_pool(&self.inner).len()
    }

    /// All tab IDs in pool (for hiding inactive WebViews).
    pub fn tab_ids(&self) -> Vec<String> {
        lock_pool(&self.inner).clone()
    }

    /// Check if a tab_id is in the pool.
    pub fn contains(&self, tab_id: &str) -> bool {
        lock_pool(&self.inner).iter().any(|id| id == tab_id)
    }
}
