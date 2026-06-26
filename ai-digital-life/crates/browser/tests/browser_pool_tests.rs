use adl_browser::BrowserPool;

#[test]
fn test_pool_register_tracks_lru_order() {
    let pool = BrowserPool::new(3);
    assert_eq!(pool.register("tab-1".into()), None);
    assert_eq!(pool.register("tab-2".into()), None);
    assert_eq!(pool.register("tab-3".into()), None);
    assert_eq!(pool.size(), 3);
    assert_eq!(pool.get_lru(), Some("tab-1".into()));
    pool.touch("tab-1");
    assert_eq!(pool.get_lru(), Some("tab-2".into()));
    assert_eq!(pool.register("tab-4".into()), Some("tab-2".into()));
    assert_eq!(pool.size(), 3);
}

#[test]
fn test_pool_remove_frees_slot() {
    let pool = BrowserPool::new(2);
    pool.register("a".into());
    pool.register("b".into());
    assert!(pool.is_full());
    pool.remove("a");
    assert!(!pool.is_full());
    assert_eq!(pool.size(), 1);
}

#[test]
fn test_pool_touch_absent_does_not_panic() {
    let pool = BrowserPool::new(3);
    pool.touch("nonexistent");
    assert_eq!(pool.size(), 0);
}

#[test]
fn test_pool_lru_removes_oldest_even_after_multiple_touches() {
    let pool = BrowserPool::new(2);
    pool.register("a".into());
    pool.register("b".into());
    pool.touch("a");
    pool.touch("b");
    pool.touch("a");
    assert_eq!(pool.get_lru(), Some("b".into()));
}
