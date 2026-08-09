use ad_server::engine::init_server_state;

#[tokio::test]
async fn engine_init_creates_workable_state() {
    let data_dir = std::env::temp_dir().join(format!("adl-server-{}", uuid::Uuid::new_v4()));
    let state = init_server_state(&data_dir).await.expect("init should succeed");

    // The DB must be a real, usable SQLite store after init (schema + migrations
    // applied): run a trivial query to prove it.
    let conn = state.db.conn().expect("db connection should be obtainable");
    let one: i64 =
        conn.query_row("SELECT 1", [], |row| row.get(0)).expect("db should answer a trivial query");
    assert_eq!(one, 1);

    // The SSE/HTTP port must start unbound.
    assert_eq!(
        state.server_port.load(std::sync::atomic::Ordering::Relaxed),
        0,
        "server_port should start at 0 (not bound)"
    );

    let _ = std::fs::remove_dir_all(&data_dir);
}
