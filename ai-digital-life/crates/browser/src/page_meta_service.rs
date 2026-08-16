use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use adl_errors::AppError;

use crate::browser_meta::PageMeta;
use crate::meta_merge::{
    META_SOURCE_HTTP, existing_favicon_baseline, should_apply_exact_match_title,
    should_replace_favicon,
};
use crate::site_meta_cache::{SiteMetaCacheEntry, SiteMetaCacheStore, normalize_cache_key};

pub const META_TTL_MS: i64 = 7 * 24 * 3600 * 1000;
pub const RETRY_BASE_MS: i64 = 5 * 60 * 1000;
pub const RETRY_MAX_MS: i64 = 2 * 3600 * 1000;

pub trait PageMetaFetcher: Send + Sync {
    /// 返回空 title/favicon 表示抓取失败（复用 empty_page_meta 语义）。
    fn fetch(
        &self,
        url: &str,
        force: bool,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>>;
}

pub struct PageMetaService {
    store: Arc<SiteMetaCacheStore>,
    pub(crate) memory: Mutex<HashMap<String, SiteMetaCacheEntry>>,
    in_flight: Mutex<HashMap<String, Arc<tokio::sync::Notify>>>,
}

impl PageMetaService {
    pub fn new(store: Arc<SiteMetaCacheStore>) -> Self {
        Self { store, memory: Mutex::new(HashMap::new()), in_flight: Mutex::new(HashMap::new()) }
    }

    pub async fn preload(&self) -> Result<(), AppError> {
        let all = self.store.get_all()?;
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        for (k, v) in all {
            memory.entry(k).or_insert(v);
        }
        Ok(())
    }

    pub fn peek(&self, url: &str) -> Option<SiteMetaCacheEntry> {
        let memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        memory.get(&normalize_cache_key(url)).cloned()
    }

    pub fn retry_due(&self, url: &str, now: i64) -> bool {
        self.peek(url).is_none_or(|e| now >= e.next_retry_at)
    }

    pub fn mark_failure(&self, url: &str) {
        let key = normalize_cache_key(url);
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let now = chrono_now_ms();
        let entry = memory.entry(key.clone()).or_insert_with(|| SiteMetaCacheEntry {
            title: String::new(),
            title_source: String::new(),
            favicon_url: String::new(),
            favicon_data_uri: String::new(),
            fetched_at: now,
            last_ok_at: 0,
            next_retry_at: now + RETRY_BASE_MS,
            fail_count: 1,
        });
        entry.fail_count = entry.fail_count.saturating_add(1);
        let delay = (RETRY_BASE_MS << entry.fail_count.min(5)).min(RETRY_MAX_MS);
        entry.next_retry_at = now + delay;
    }

    pub async fn get(
        &self,
        url: &str,
        force: bool,
        fetcher: &dyn PageMetaFetcher,
    ) -> Result<PageMeta, AppError> {
        let key = normalize_cache_key(url);
        let now = chrono_now_ms();
        // 单飞行：用 contains_key 区分持有者（Arc::ptr_eq 无法区分：entry() 会返回
        // 与持有者同一个 Arc clone，导致并发请求错误地也执行抓取）。
        let is_owner = {
            let mut map = self.in_flight.lock().unwrap_or_else(|e| e.into_inner());
            if map.contains_key(&key) {
                false // 已有并发请求在跑
            } else {
                map.insert(key.clone(), Arc::new(tokio::sync::Notify::new()));
                true
            }
        };
        if !is_owner {
            // 等待持有者完成：取持有的 Notify，await 后返回其缓存结果
            let notify =
                self.in_flight.lock().unwrap_or_else(|e| e.into_inner()).get(&key).cloned();
            if let Some(n) = notify {
                n.notified().await;
            }
            return Ok(self.peek(&key).map(to_page_meta).unwrap_or_default());
        }
        // 执行抓取（持有者）
        let meta = fetcher.fetch(url, force).await;
        if !meta.title.is_empty() || !meta.favicon.is_empty() || !meta.favicon_data_uri.is_empty() {
            self.write_success(&key, &meta, META_SOURCE_HTTP, now);
        } else {
            self.mark_failure(&key);
        }
        // 释放单飞行并唤醒等待者
        if let Some(n) = self.in_flight.lock().unwrap_or_else(|e| e.into_inner()).remove(&key) {
            n.notify_waiters();
        }
        Ok(PageMeta { url: key, ..meta })
    }

    fn write_success(&self, key: &str, meta: &PageMeta, source: &str, now: i64) {
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let existing = memory.get(key).cloned();
        let title_source = {
            let cur = existing.as_ref();
            let cur_title = cur.map(|e| e.title.as_str()).unwrap_or("");
            let cur_source = cur.map(|e| e.title_source.as_str());
            if should_apply_exact_match_title(cur_title, key, &meta.title, source, cur_source)
                || meta.title.is_empty()
            {
                source.to_string()
            } else {
                cur.map(|e| e.title_source.clone()).unwrap_or_default()
            }
        };
        let entry = SiteMetaCacheEntry {
            title: if meta.title.is_empty() {
                existing.as_ref().map(|e| e.title.clone()).unwrap_or_default()
            } else {
                meta.title.clone()
            },
            title_source,
            favicon_url: {
                let existing_fav = existing
                    .as_ref()
                    .map(|e| existing_favicon_baseline(&e.favicon_data_uri, &e.favicon_url));
                if should_replace_favicon(existing_fav.as_deref(), &meta.favicon) {
                    meta.favicon.clone()
                } else {
                    existing.as_ref().map(|e| e.favicon_url.clone()).unwrap_or_default()
                }
            },
            favicon_data_uri: {
                let existing_uri =
                    existing.as_ref().map(|e| e.favicon_data_uri.clone()).unwrap_or_default();
                if meta.favicon_data_uri.is_empty() {
                    existing_uri
                } else {
                    meta.favicon_data_uri.clone()
                }
            },
            fetched_at: now,
            last_ok_at: now,
            next_retry_at: 0,
            fail_count: 0,
        };
        memory.insert(key.to_string(), entry.clone());
        drop(memory);
        let mut map = HashMap::new();
        map.insert(key.to_string(), entry);
        let _ = self.store.upsert(&map);
    }

    pub async fn report(
        &self,
        url: &str,
        title: &str,
        favicon: &str,
        source: &str,
    ) -> Result<bool, AppError> {
        let key = normalize_cache_key(url);
        let now = chrono_now_ms();
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let existing = memory.get(&key).cloned();
        let cur_title = existing.as_ref().map(|e| e.title.as_str()).unwrap_or("");
        let cur_source = existing.as_ref().map(|e| e.title_source.as_str());
        let title_applied = !title.is_empty()
            && should_apply_exact_match_title(cur_title, &key, title, source, cur_source);
        let existing_fav = existing
            .as_ref()
            .map(|e| existing_favicon_baseline(&e.favicon_data_uri, &e.favicon_url));
        let favicon_applied = should_replace_favicon(existing_fav.as_deref(), favicon);
        if !title_applied && !favicon_applied {
            return Ok(false);
        }
        let entry = SiteMetaCacheEntry {
            title: if title_applied {
                title.to_string()
            } else {
                existing.as_ref().map(|e| e.title.clone()).unwrap_or_default()
            },
            title_source: if title_applied {
                source.to_string()
            } else {
                existing.as_ref().map(|e| e.title_source.clone()).unwrap_or_default()
            },
            favicon_url: if favicon_applied {
                favicon.to_string()
            } else {
                existing.as_ref().map(|e| e.favicon_url.clone()).unwrap_or_default()
            },
            favicon_data_uri: existing
                .as_ref()
                .map(|e| e.favicon_data_uri.clone())
                .unwrap_or_default(),
            fetched_at: now,
            last_ok_at: now,
            next_retry_at: 0,
            fail_count: 0,
        };
        memory.insert(key.clone(), entry.clone());
        drop(memory);
        let mut map = HashMap::new();
        map.insert(key, entry);
        let _ = self.store.upsert(&map);
        Ok(true)
    }

    pub async fn warmup(
        &self,
        urls: &[String],
        fetcher: &dyn PageMetaFetcher,
        limit: usize,
    ) -> Result<(), AppError> {
        let mut seen = std::collections::HashSet::new();
        let mut tasks = Vec::new();
        for u in urls {
            let key = normalize_cache_key(u);
            if !seen.insert(key.clone()) {
                continue;
            }
            if tasks.len() >= limit {
                break;
            }
            if self.retry_due(&key, chrono_now_ms()) {
                // 任务持有 key 的 owned 拷贝，避免借用循环局部变量导致 E0597
                let key = key.clone();
                tasks.push(async move {
                    let _ = self.get(&key, false, fetcher).await;
                });
            }
        }
        for t in tasks {
            t.await;
        }
        Ok(())
    }
}

fn to_page_meta(e: SiteMetaCacheEntry) -> PageMeta {
    PageMeta {
        title: e.title,
        favicon: e.favicon_url,
        favicon_data_uri: e.favicon_data_uri,
        url: String::new(),
    }
}

fn chrono_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meta_merge::META_SOURCE_COM;
    use crate::site_meta_cache::SiteMetaCacheStore;
    use std::env::temp_dir;

    struct MockFetcher {
        result: std::sync::Mutex<Option<PageMeta>>,
    }
    impl PageMetaFetcher for MockFetcher {
        fn fetch(
            &self,
            _url: &str,
            _force: bool,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>> {
            let r = self.result.lock().unwrap().clone().unwrap_or_default();
            Box::pin(async move { r })
        }
    }

    fn open_service(name: &str) -> (Arc<PageMetaService>, std::path::PathBuf) {
        let dir = temp_dir().join(format!("adl-pms-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let store = SiteMetaCacheStore::open(&dir).unwrap();
        (Arc::new(PageMetaService::new(store)), dir)
    }

    #[tokio::test]
    async fn peek_returns_memory_entry() {
        let (svc, _) = open_service("peek");
        let entry = SiteMetaCacheEntry {
            title: "T".into(),
            title_source: "http".into(),
            favicon_url: "".into(),
            favicon_data_uri: "".into(),
            fetched_at: 0,
            last_ok_at: 0,
            next_retry_at: 0,
            fail_count: 0,
        };
        svc.memory.lock().unwrap().insert("https://a.com/".into(), entry.clone());
        assert_eq!(svc.peek("https://a.com/#x").unwrap().title, "T");
    }

    #[tokio::test]
    async fn get_success_writes_cache_and_sets_last_ok() {
        let (svc, _) = open_service("get-ok");
        let fetcher = MockFetcher {
            result: std::sync::Mutex::new(Some(PageMeta {
                title: "A".into(),
                favicon: "https://a.com/favicon.ico".into(),
                favicon_data_uri: "".into(),
                url: "https://a.com/".into(),
            })),
        };
        let meta = svc.get("https://a.com/", false, &fetcher).await.unwrap();
        assert_eq!(meta.title, "A");
        let cached = svc.peek("https://a.com/").unwrap();
        assert_eq!(cached.title, "A");
        assert_eq!(cached.title_source, META_SOURCE_HTTP);
        assert!(cached.last_ok_at > 0);
        assert_eq!(cached.fail_count, 0);
    }

    #[tokio::test]
    async fn get_failure_keeps_cache_and_backs_off() {
        let (svc, _) = open_service("get-fail");
        // 先成功写入
        let fetcher = MockFetcher {
            result: std::sync::Mutex::new(Some(PageMeta {
                title: "A".into(),
                favicon: "".into(),
                favicon_data_uri: "".into(),
                url: "https://a.com/".into(),
            })),
        };
        svc.get("https://a.com/", false, &fetcher).await.unwrap();
        // 再失败
        *fetcher.result.lock().unwrap() = Some(PageMeta::default());
        let meta = svc.get("https://a.com/", false, &fetcher).await.unwrap();
        assert!(meta.title.is_empty());
        let cached = svc.peek("https://a.com/").unwrap();
        assert_eq!(cached.title, "A", "失败不得删除缓存");
        assert_eq!(cached.fail_count, 1);
        assert!(cached.next_retry_at > 0);
    }

    #[tokio::test]
    async fn single_flight_deduplicates_concurrent_gets() {
        let (svc, _) = open_service("flight");
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        struct CountingFetcher(std::sync::Arc<std::sync::atomic::AtomicU32>);
        impl PageMetaFetcher for CountingFetcher {
            fn fetch(
                &self,
                _url: &str,
                _force: bool,
            ) -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>>
            {
                self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Box::pin(async move {
                    // join! 下必须让出一次，两个 get 才真正并发（否则 r1 会在 r2 轮询前
                    // 整段完成，r2 必然成为持有者 → calls==2，单飞行永远无法被检验）。
                    tokio::task::yield_now().await;
                    PageMeta {
                        title: "X".into(),
                        favicon: "".into(),
                        favicon_data_uri: "".into(),
                        url: "https://a.com/".into(),
                    }
                })
            }
        }
        let f = CountingFetcher(calls.clone());
        let (r1, r2) = tokio::join!(
            svc.get("https://a.com/", false, &f),
            svc.get("https://a.com/", false, &f)
        );
        assert!(r1.is_ok() && r2.is_ok());
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn report_com_does_not_clobber_http_title() {
        let (svc, _) = open_service("report");
        svc.report("https://a.com/", "真实标题", "", META_SOURCE_HTTP).await.unwrap();
        svc.report("https://a.com/", "陈旧标题", "", META_SOURCE_COM).await.unwrap();
        assert_eq!(svc.peek("https://a.com/").unwrap().title, "真实标题");
    }
}
