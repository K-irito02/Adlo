use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

fn lock_pool(inner: &Mutex<Vec<String>>) -> MutexGuard<'_, Vec<String>> {
    inner.lock().unwrap_or_else(PoisonError::into_inner)
}

#[derive(Debug, Clone)]
pub struct BrowserPool {
    inner: Arc<Mutex<Vec<String>>>,
    capacity: usize,
}

impl BrowserPool {
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Vec::new())),
            capacity,
        }
    }

    /// Register a tab. If pool is full, returns the LRU tab_id to evict.
    pub fn register(&self, tab_id: String) -> Option<String> {
        let mut order = lock_pool(&self.inner);
        order.retain(|id| id != &tab_id);

        let evicted = if order.len() >= self.capacity {
            Some(order.remove(0))
        } else {
            None
        };

        order.push(tab_id);
        evicted
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
