//! 只读倾倒站点元数据缓存摘要（排错用）——回答"这个 URL 为什么每次启动都重抓 / 为什么没有图标"。
//!
//! 用法：
//!   cargo run -p adl-browser --example dump-site-meta -- <data_dir> [url]
//!   cargo run -p adl-browser --example dump-site-meta -- <data_dir> --missing-favicon [--limit N]
//!
//! - `<data_dir>`：站点元数据缓存目录（通常是 `<数据目录>` 根，内含 `site-meta-cache.db`；
//!   如 `%APPDATA%\com.adlo.app.slot-1`）
//! - 无 url：打印整体统计（条目总数 / 可命中数 / 空条目 / 退避中的失败墓碑，以及
//!   退避中的墓碑 URL 列表，最多 20 条）
//! - 带 url：按 `normalize_cache_key` 规范化后打印该条目的完整内容
//! - `--missing-favicon`：列出「有标题但没有任何图标」的条目（默认最多 50 条，`--limit` 可调）；
//!   这是「网站图标停在兜底首字母」类问题的第一现场（桌面 live 上报常只带标题）
//!
//! 注意：`SiteMetaCacheStore::open` 内部可能执行 `CREATE TABLE IF NOT EXISTS`
//! （以及对缺列旧表的 DROP+CREATE 迁移），首次在旧库上运行会少量写库；正常情况下无副作用。
use adl_browser::{SiteMetaCacheStore, normalize_cache_key};
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// 标题可能带换行/制表符：列表模式压成单行，避免输出被拆散。
fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn print_entry(key: &str, entry: &adl_browser::SiteMetaCacheEntry) {
    println!("key: {key}");
    println!("  title          = {}", entry.title);
    println!("  title_source   = {}", entry.title_source);
    println!("  favicon_url    = {}", entry.favicon_url);
    println!("  favicon_data_uri_len = {}", entry.favicon_data_uri.len());
    println!("  fetched_at     = {}", entry.fetched_at);
    println!("  last_ok_at     = {}", entry.last_ok_at);
    println!("  next_retry_at  = {}", entry.next_retry_at);
    println!("  fail_count     = {}", entry.fail_count);
}

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(data_dir) = args.next() else {
        eprintln!("usage: dump-site-meta <data_dir> [url] [--missing-favicon] [--limit <N>]");
        std::process::exit(2);
    };

    let mut url: Option<String> = None;
    let mut missing_favicon = false;
    let mut limit: usize = 50;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--missing-favicon" => missing_favicon = true,
            "--limit" => {
                let Some(value) = args.next() else {
                    eprintln!("--limit requires a number");
                    std::process::exit(2);
                };
                match value.parse::<usize>() {
                    Ok(n) if n > 0 => limit = n,
                    _ => {
                        eprintln!("--limit must be a positive integer");
                        std::process::exit(2);
                    },
                }
            },
            other if url.is_none() && !other.starts_with("--") => url = Some(other.to_string()),
            other => {
                eprintln!("unknown argument: {other}");
                std::process::exit(2);
            },
        }
    }

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

    if let Some(url) = url {
        let key = normalize_cache_key(&url);
        match all.get(&key) {
            Some(entry) => print_entry(&key, entry),
            None => println!("key: {key}\n  <no entry>"),
        }
        return;
    }

    let now = now_ms();
    if missing_favicon {
        // 「有标题、无 favicon_url 且无 data-URI」= 首字母迟迟不换真实图标的候选。
        let mut rows: Vec<(&String, &adl_browser::SiteMetaCacheEntry)> = all
            .iter()
            .filter(|(_, e)| {
                !e.title.is_empty() && e.favicon_url.is_empty() && e.favicon_data_uri.is_empty()
            })
            .collect();
        rows.sort_by(|a, b| b.1.last_ok_at.cmp(&a.1.last_ok_at).then_with(|| a.0.cmp(b.0)));
        println!("entries without any favicon (title present): {}", rows.len());
        for (key, entry) in rows.iter().take(limit) {
            let title = one_line(&entry.title);
            let title: String = title.chars().take(60).collect();
            println!(
                "{key}\t{title}\tlast_ok_at={}",
                if entry.last_ok_at == 0 {
                    "never".to_string()
                } else {
                    entry.last_ok_at.to_string()
                }
            );
        }
        if rows.len() > limit {
            println!("… {} more (use --limit to raise)", rows.len() - limit);
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
