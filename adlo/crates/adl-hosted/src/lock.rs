use std::sync::Arc;

use tokio::sync::Mutex;

/// 跨任务安装互斥锁的构造器：`new()` 返回全新的 `Arc<Mutex<()>>`，
/// 调用方持有同一 `Arc` 拷贝即可串行化安装任务（同一时刻只跑一个）。
pub struct InstallLock;

impl InstallLock {
    // 跨任务契约要求 `new() -> Arc<Mutex<()>>`（构造全新共享锁），
    // 命名故意为 `new` 以匹配调用点 `InstallLock::new()`。
    #[allow(clippy::new_ret_no_self)]
    pub fn new() -> Arc<Mutex<()>> {
        Arc::new(Mutex::new(()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_lock_starts_unlocked() {
        let lock = InstallLock::new();
        let _guard = lock.try_lock().expect("fresh lock is free");
    }
}
