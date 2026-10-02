use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

fn lock_pool(inner: &Mutex<Vec<String>>) -> MutexGuard<'_, Vec<String>> {
    inner.lock().unwrap_or_else(PoisonError::into_inner)
}

#[derive(Debug, Clone)]
pub struct BrowserPool {
    inner: Arc<Mutex<Vec<String>>>,
}

impl BrowserPool {
    pub fn new() -> Self {
        Self { inner: Arc::new(Mutex::new(Vec::new())) }
    }

    /// Register a tab's membership. Pool is unbounded; never evicts.
    ///
    /// The `Option<String>` return is the documented eviction-hint contract with the
    /// frontend pool singleton (`createForTab`): it is currently always `None` because
    /// the pool never evicts. Kept as the extension point for a future bounded pool.
    pub fn register(&self, tab_id: String) -> Option<String> {
        let mut tabs = lock_pool(&self.inner);
        if !tabs.iter().any(|id| id == &tab_id) {
            tabs.push(tab_id);
        }
        None
    }

    /// Remove a tab from the pool.
    pub fn remove(&self, tab_id: &str) {
        lock_pool(&self.inner).retain(|id| id != tab_id);
    }

    pub fn size(&self) -> usize {
        lock_pool(&self.inner).len()
    }

    /// All tab IDs in pool（插入顺序）。
    pub fn tab_ids(&self) -> Vec<String> {
        lock_pool(&self.inner).clone()
    }
}

impl Default for BrowserPool {
    fn default() -> Self {
        Self::new()
    }
}
