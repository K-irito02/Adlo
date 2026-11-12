//! 只读倾倒站点元数据缓存摘要（排错用）——回答"这个 URL 为什么每次启动都重抓 / 为什么没有图标"。
//!
//! 用法：
//!   cargo run -p adl-browser --example dump-site-meta -- <data_dir> [url]
//!
//! - `<data_dir>`：站点元数据缓存目录（通常是 `<数据目录>` 根，内含 `site-meta-cache.db`；
//!   如 `%APPDATA%\com.adlo.app.slot-1`）
//! - 无 url：打印整体统计（条目总数 / 可命中数 / 空条目 / 退避中的失败墓碑，以及
//!   退避中的墓碑 URL 列表，最多 20 条）
//! - 带 url：按 `normalize_cache_key` 规范化后打印该条目的完整内容
//!
//! 注意：`SiteMetaCacheStore::open` 内部可能执行 `CREATE TABLE IF NOT EXISTS`
//! （以及对缺列旧表的 DROP+CREATE 迁移），首次在旧库上运行会少量写库；正常情况下无副作用。
use adl_browser::{SiteMetaCacheStore, normalize_cache_key};
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(data_dir) = args.next() else {
        eprintln!("usage: dump-site-meta <data_dir> [url]");
        std::process::exit(2);
    };
    let url = args.next();

    let store = match SiteMetaCacheStore::open(std::path::Path::new(&data_dir)) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("open store in {data_dir}: {e}");
            std::process::exit(1);
        },
    };
    let all = match store.get_all() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("read store: {e}");
            std::process::exit(1);
        },
    };

    let now = now_ms();
    if let Some(url) = url {
        let key = normalize_cache_key(&url);
        match all.get(&key) {
            Some(entry) => {
                println!("key: {key}");
                println!("  title          = {}", entry.title);
                println!("  title_source   = {}", entry.title_source);
                println!("  favicon_url    = {}", entry.favicon_url);
                println!("  favicon_data_uri_len = {}", entry.favicon_data_uri.len());
                println!("  fetched_at     = {}", entry.fetched_at);
                println!("  last_ok_at     = {}", entry.last_ok_at);
                println!("  next_retry_at  = {}", entry.next_retry_at);
                println!("  fail_count     = {}", entry.fail_count);
            },
            None => println!("key: {key}\n  <no entry>"),
        }
        return;
    }

    let mut total = 0usize;
    let mut usable = 0usize;
    let mut empty = 0usize;
    let mut backed_off: Vec<String> = Vec::new();
    for (key, entry) in &all {
        total += 1;
        let has_title = !entry.title.is_empty();
        let has_favicon = !entry.favicon_url.is_empty();
        if has_title || has_favicon {
            usable += 1;
        } else {
            empty += 1;
        }
        if entry.last_ok_at == 0 && entry.next_retry_at > now {
            backed_off.push(key.clone());
        }
    }
    println!("total entries    : {total}");
    println!("usable (cache hit): {usable}");
    println!("empty            : {empty}");
    println!("backed-off tombstones: {}", backed_off.len());
    for key in backed_off.iter().take(20) {
        println!("  - {key}");
    }
}
