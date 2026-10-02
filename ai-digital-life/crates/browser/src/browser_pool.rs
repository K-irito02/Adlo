use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

/// 池锁中毒时静默恢复（`PoisonError::into_inner`）而非报错：池数据是
/// `Vec<String>`、每个操作都是原子的整段替换/过滤，没有可被中毒破坏的不变量，
/// 恢复安全。与 `BrowserManager` 的 handles 锁（报错）策略**有意不同**——
/// 那里守卫的是原生 WebView handle 表，丢失记录会导致 tab 永久不可见。
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

    /// All tab IDs in pool, in insertion order.
    pub fn tab_ids(&self) -> Vec<String> {
        lock_pool(&self.inner).clone()
    }
}

impl Default for BrowserPool {
    fn default() -> Self {
        Self::new()
    }
}
