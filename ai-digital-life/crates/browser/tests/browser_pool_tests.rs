use adl_browser::BrowserPool;

#[test]
fn test_pool_register_tracks_lru_order() {
    let pool = BrowserPool::new();
    assert_eq!(pool.register("tab-1".into()), None);
    assert_eq!(pool.register("tab-2".into()), None);
    assert_eq!(pool.register("tab-3".into()), None);
    assert_eq!(pool.size(), 3);
    assert_eq!(pool.get_lru(), Some("tab-1".into()));
    pool.touch("tab-1");
    assert_eq!(pool.get_lru(), Some("tab-2".into()));
    assert_eq!(pool.register("tab-4".into()), None);
    assert_eq!(pool.size(), 4);
}

#[test]
fn test_pool_remove_frees_slot() {
    let pool = BrowserPool::new();
    pool.register("a".into());
    pool.register("b".into());
    assert_eq!(pool.size(), 2);
    pool.remove("a");
    assert!(!pool.contains("a"));
    assert_eq!(pool.size(), 1);
    assert!(pool.contains("b"));
}

#[test]
fn test_pool_touch_absent_does_not_panic() {
    let pool = BrowserPool::new();
    pool.touch("nonexistent");
    assert_eq!(pool.size(), 0);
}

#[test]
fn test_pool_lru_removes_oldest_even_after_multiple_touches() {
    let pool = BrowserPool::new();
    pool.register("a".into());
    pool.register("b".into());
    pool.touch("a");
    pool.touch("b");
    pool.touch("a");
    assert_eq!(pool.get_lru(), Some("b".into()));
}

#[test]
fn register_never_evicts_after_capacity_removed() {
    let pool = BrowserPool::new();
    assert_eq!(pool.register("a".into()), None);
    assert_eq!(pool.register("b".into()), None);
    // No longer evicts on capacity — "c" registers without evicting "a".
    assert_eq!(pool.register("c".into()), None);
    assert_eq!(pool.size(), 3);
}
