use adl_browser::BrowserPool;

#[test]
fn test_pool_integration_lifecycle() {
    let pool = BrowserPool::new(6);
    assert_eq!(pool.register("tab-a".into()), None);
    assert_eq!(pool.register("tab-b".into()), None);
    assert_eq!(pool.register("tab-c".into()), None);
    assert_eq!(pool.size(), 3);
    pool.touch("tab-a");
    assert_eq!(pool.get_lru(), Some("tab-b".into()));
    pool.remove("tab-a");
    assert_eq!(pool.size(), 2);
}

#[test]
fn test_pool_registration_never_evicts() {
    let pool = BrowserPool::new(2);
    pool.register("a".into());
    pool.register("b".into());
    assert_eq!(pool.register("c".into()), None);
    assert_eq!(pool.register("d".into()), None);
    assert_eq!(pool.size(), 4);
    assert_eq!(pool.get_lru(), Some("a".into()));
}
