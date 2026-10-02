use adl_browser::BrowserPool;

#[test]
fn register_tracks_membership_without_duplicates() {
    let pool = BrowserPool::new();
    assert_eq!(pool.register("tab-1".into()), None);
    assert_eq!(pool.register("tab-2".into()), None);
    // 同一 tab 重复注册不产生重复成员
    assert_eq!(pool.register("tab-1".into()), None);
    assert_eq!(pool.size(), 2);
    assert_eq!(pool.tab_ids(), vec!["tab-1".to_string(), "tab-2".to_string()]);
}

#[test]
fn test_pool_remove_frees_slot() {
    let pool = BrowserPool::new();
    pool.register("a".into());
    pool.register("b".into());
    assert_eq!(pool.size(), 2);
    pool.remove("a");
    assert_eq!(pool.tab_ids(), vec!["b".to_string()]);
    assert_eq!(pool.size(), 1);
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
