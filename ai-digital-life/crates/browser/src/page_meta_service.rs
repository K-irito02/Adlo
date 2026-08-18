use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use adl_errors::AppError;
use futures::StreamExt;

use crate::browser_meta::PageMeta;
use crate::meta_merge::{
    META_SOURCE_HTTP, existing_favicon_baseline, is_placeholder_title,
    should_apply_exact_match_title, should_replace_favicon,
};
use crate::site_meta_cache::{SiteMetaCacheEntry, SiteMetaCacheStore, normalize_cache_key};

pub const META_TTL_MS: i64 = 7 * 24 * 3600 * 1000;
pub const RETRY_BASE_MS: i64 = 5 * 60 * 1000;
pub const RETRY_MAX_MS: i64 = 2 * 3600 * 1000;

pub trait PageMetaFetcher: Send + Sync {
    /// 返回空 title/favicon 表示抓取失败（复用 empty_page_meta 语义）。
    /// force 仅在 PageMetaService::get 层生效（绕过 TTL/退避短路），不传递给抓取实现。
    fn fetch(
        &self,
        url: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>>;
}

pub struct PageMetaService {
    store: Arc<SiteMetaCacheStore>,
    pub(crate) memory: Mutex<HashMap<String, SiteMetaCacheEntry>>,
    in_flight: Mutex<HashMap<String, Arc<tokio::sync::Notify>>>,
}

/// RAII 守卫：无论抓取正常结束还是 panic 展开，都移除 in_flight 条目并唤醒等待者，
/// 防止 fetcher 内部 panic 后条目永久泄漏（⑬b）导致后续请求永久阻塞。
struct InFlightGuard<'a> {
    svc: &'a PageMetaService,
    key: String,
}

impl Drop for InFlightGuard<'_> {
    fn drop(&mut self) {
        if let Some(n) =
            self.svc.in_flight.lock().unwrap_or_else(|e| e.into_inner()).remove(&self.key)
        {
            n.notify_waiters();
        }
    }
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
            next_retry_at: now,
            fail_count: 0,
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
        // TTL 短路（spec 4.1）：内存命中且未过期直接返回，不发起抓取；force 绕过。
        if !force {
            if let Some(entry) = self.peek(&key) {
                let ttl_hit = entry.last_ok_at > 0 && now - entry.last_ok_at < META_TTL_MS;
                // 退避短路（RC4）：从未成功过且退避期未到 → 直接返回缓存不触发抓取，
                // 避免失败域名被后续每次 get/warmup 反复重抓（限速放大、图标来回切换）。
                let backed_off = entry.last_ok_at == 0 && now < entry.next_retry_at;
                if ttl_hit || backed_off {
                    // 携带真实 url（缓存键）返回：命令层 emit_page_meta_updated 按 meta.url
                    // 广播，url 为空将导致前端无法匹配任何 tab（R1 回归）。
                    return Ok(PageMeta { url: key.clone(), ..to_page_meta(entry) });
                }
            }
        }
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
            // 等待者路径同样携带真实 url（缓存键），与持有者抓取路径一致（R1 回归）。
            return Ok(self
                .peek(&key)
                .map(|e| PageMeta { url: key.clone(), ..to_page_meta(e) })
                .unwrap_or_default());
        }
        // 执行抓取（持有者）。守卫保证即使 fetch panic，in_flight 条目也被清理。
        let _guard = InFlightGuard { svc: self, key: key.clone() };
        let meta = fetcher.fetch(url).await;
        if !meta.title.is_empty() || !meta.favicon.is_empty() || !meta.favicon_data_uri.is_empty() {
            self.write_success(&key, &meta, META_SOURCE_HTTP, now);
        } else {
            self.mark_failure(&key);
        }
        drop(_guard); // 提前释放，通知等待者（与正常结束等价）
        // 统一返回缓存条目的合并值（RC3）：抓取失败时避免把空结果传给命令层
        // 广播 → 前端 applyBroadcastUpdate 清空镜像（真实图标被清 → 回落 DDG →
        // 下次成功恢复 → 来回切换）；成功路径同样返回 write_success 合并后的权威值
        // （含质量门控保留的既有图标）。
        // source 反映缓存条目的真实 title_source（write_success 后为 http；此前
        // 若已有 com 权威条目则保留），供命令层广播使用，避免硬编码 http 冻结 com 更新。
        // write_success / mark_failure 均写入内存条目，peek 必命中（expect 固化不变量）。
        let entry = self
            .peek(&key)
            .expect("write_success/mark_failure 均写入内存条目，抓取路径 peek 必命中");
        Ok(PageMeta {
            title: entry.title,
            favicon: entry.favicon_url,
            favicon_data_uri: entry.favicon_data_uri,
            url: key,
            source: entry.title_source,
        })
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
            title: if meta.title.is_empty() || is_placeholder_title(&meta.title, key) {
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
        if let Err(e) = self.store.upsert(&map) {
            tracing::warn!(url = %key, error = %e, "persist site meta upsert failed");
        }
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
        map.insert(key.clone(), entry);
        if let Err(e) = self.store.upsert(&map) {
            tracing::warn!(url = %key, error = %e, "persist site meta upsert failed");
        }
        Ok(true)
    }

    pub async fn warmup(
        &self,
        urls: &[String],
        fetcher: &dyn PageMetaFetcher,
        limit: usize,
    ) -> Result<Vec<PageMeta>, AppError> {
        let mut seen = std::collections::HashSet::new();
        let mut keys = Vec::new();
        for u in urls {
            let key = normalize_cache_key(u);
            if !seen.insert(key.clone()) {
                continue;
            }
            if self.retry_due(&key, chrono_now_ms()) {
                keys.push(key);
            }
        }
        // 全部 retry_due URL 并发抓取（并发上限 limit），不再截断 tasks 数量。
        let metas = futures::stream::iter(keys.into_iter().map(|key| {
            // 任务持有 key 的 owned 拷贝，避免借用循环局部变量导致 E0597
            async move {
                let _ = self.get(&key, false, fetcher).await;
                key
            }
        }))
        .buffer_unordered(limit)
        .collect::<Vec<_>>()
        .await;
        // 返回每个已处理 URL 的缓存结果（用于命令层 emit 镜像传播）
        Ok(metas
            .iter()
            .filter_map(|key| {
                self.peek(key).map(|e| PageMeta {
                    title: e.title.clone(),
                    favicon: e.favicon_url.clone(),
                    favicon_data_uri: e.favicon_data_uri.clone(),
                    url: key.clone(),
                    source: e.title_source,
                })
            })
            .collect())
    }
}

fn to_page_meta(e: SiteMetaCacheEntry) -> PageMeta {
    PageMeta {
        title: e.title,
        favicon: e.favicon_url,
        favicon_data_uri: e.favicon_data_uri,
        url: String::new(),
        source: e.title_source,
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
                source: String::new(),
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
                source: String::new(),
            })),
        };
        svc.get("https://a.com/", false, &fetcher).await.unwrap();
        // 再失败（force 绕过 TTL 短路：TTL 内 force=false 会直接返回缓存，不触发抓取）
        *fetcher.result.lock().unwrap() = Some(PageMeta::default());
        let meta = svc.get("https://a.com/", true, &fetcher).await.unwrap();
        // RC3：抓取失败时 get 必须返回缓存条目的合并值（A），而非空结果 ——
        // 否则命令层广播空 meta 会清空前端镜像（真实图标来回切换）。
        assert_eq!(meta.title, "A");
        let cached = svc.peek("https://a.com/").unwrap();
        assert_eq!(cached.title, "A", "失败不得删除缓存");
        assert_eq!(cached.fail_count, 1);
        assert!(cached.next_retry_at > 0);
    }

    #[tokio::test]
    async fn get_respects_backoff_for_failed_url_without_force() {
        // RC4：失败域名在退避期内（next_retry_at 未到）→ get(force=false) 直接返回缓存，
        // 不触发抓取（避免失败域名被后续 get/warmup 反复重抓、限速放大）；
        // force=true 仍可强制重试。
        let (svc, _) = open_service("backoff-shortcircuit");
        let fetcher = MockFetcher { result: std::sync::Mutex::new(Some(PageMeta::default())) };
        let meta = svc.get("https://backoff.example/", true, &fetcher).await.unwrap();
        assert!(meta.title.is_empty());
        assert_eq!(svc.peek("https://backoff.example/").unwrap().fail_count, 1);
        // 退避期内非 force get：命中退避短路，不抓取
        let cached = svc.get("https://backoff.example/", false, &fetcher).await.unwrap();
        assert!(cached.title.is_empty());
        assert_eq!(
            svc.peek("https://backoff.example/").unwrap().fail_count,
            1,
            "退避期内不得重复抓取"
        );
        // force=true 绕过退避短路，再次抓取 → 失败计数递增
        let _ = svc.get("https://backoff.example/", true, &fetcher).await.unwrap();
        assert_eq!(svc.peek("https://backoff.example/").unwrap().fail_count, 2);
    }

    #[tokio::test]
    async fn first_failure_on_fresh_url_backs_off_at_base_delay() {
        // ③ 首败 off-by-one 回归：全新 URL 首败后 fail_count 必须为 1（延迟=基础 10min），
        // 而非 2（20min）——JS 侧 `5min * 2^failCount` 首败即 10min。
        let (svc, _) = open_service("first-fail");
        // 直接走失败路径（抓取返回空）触发 mark_failure
        let fetcher = MockFetcher { result: std::sync::Mutex::new(Some(PageMeta::default())) };
        let meta = svc.get("https://firstfail.example/", true, &fetcher).await.unwrap();
        assert!(meta.title.is_empty());
        let cached = svc.peek("https://firstfail.example/").unwrap();
        assert_eq!(cached.fail_count, 1, "首败 fail_count 应为 1");
        assert_eq!(
            cached.next_retry_at,
            chrono_now_ms() + (RETRY_BASE_MS << 1),
            "首败延迟应为 RETRY_BASE_MS << 1（10min，与 JS 5min * 2^failCount 一致）"
        );
        // 二次失败 → fail_count 2 → 2^2=4 倍基础延迟（与 JS 指数退避一致）
        let meta = svc.get("https://firstfail.example/", true, &fetcher).await.unwrap();
        assert!(meta.title.is_empty());
        let cached = svc.peek("https://firstfail.example/").unwrap();
        assert_eq!(cached.fail_count, 2);
        assert_eq!(cached.next_retry_at, chrono_now_ms() + (RETRY_BASE_MS << 2));
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
                        source: String::new(),
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
        // R1 回归：等待者路径（返回持有者缓存结果）必须携带真实 url（缓存键），
        // 与持有者抓取路径一致——否则 TTL 命中广播 url="" 无法匹配任何 tab。
        assert_eq!(r1.as_ref().unwrap().url, "https://a.com/");
        assert_eq!(r2.as_ref().unwrap().url, "https://a.com/");
    }

    #[tokio::test]
    async fn report_com_does_not_clobber_http_title() {
        let (svc, _) = open_service("report");
        svc.report("https://a.com/", "真实标题", "", META_SOURCE_HTTP).await.unwrap();
        svc.report("https://a.com/", "陈旧标题", "", META_SOURCE_COM).await.unwrap();
        assert_eq!(svc.peek("https://a.com/").unwrap().title, "真实标题");
    }

    #[tokio::test]
    async fn report_com_fills_placeholder_title() {
        let (svc, _) = open_service("report-placeholder");
        // 占位标题无法经 write_success / report 写入（占位门控拒绝 incoming 占位），
        // 故直接构造内存条目，模拟"当前为占位标题"（与 JS 侧经 JSON 持久层预载等价）。
        svc.memory.lock().unwrap().insert(
            "https://a.com/".into(),
            SiteMetaCacheEntry {
                title: "a.com".into(),
                title_source: META_SOURCE_HTTP.into(),
                favicon_url: String::new(),
                favicon_data_uri: String::new(),
                fetched_at: 0,
                last_ok_at: 0,
                next_retry_at: 0,
                fail_count: 0,
            },
        );
        // com 上报真实标题 → 占位当前标题可被覆盖（should_apply_exact_match_title 占位分支）
        assert!(svc.report("https://a.com/", "真实标题", "", META_SOURCE_COM).await.unwrap());
        let e = svc.peek("https://a.com/").unwrap();
        assert_eq!(e.title, "真实标题");
        assert_eq!(e.title_source, META_SOURCE_COM);
    }

    /// 最小测试订阅者：捕获 WARN/ERROR 事件消息（⑬a 断言 upsert 失败被记录日志）。
    #[derive(Clone)]
    struct CapturingSubscriber {
        warns: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    }
    impl tracing::Subscriber for CapturingSubscriber {
        fn enabled(&self, _: &tracing::Metadata<'_>) -> bool {
            true
        }
        fn new_span(&self, _: &tracing::span::Attributes<'_>) -> tracing::span::Id {
            tracing::span::Id::from_u64(1)
        }
        fn record(&self, _: &tracing::span::Id, _: &tracing::span::Record<'_>) {}
        fn record_follows_from(&self, _: &tracing::span::Id, _: &tracing::span::Id) {}
        fn event(&self, event: &tracing::Event<'_>) {
            if event.metadata().level() <= &tracing::Level::WARN {
                let mut out = String::new();
                let mut v = CollectFields(&mut out);
                event.record(&mut v);
                self.warns.lock().unwrap().push(out);
            }
        }
        fn enter(&self, _: &tracing::span::Id) {}
        fn exit(&self, _: &tracing::span::Id) {}
    }
    struct CollectFields<'a>(&'a mut String);
    impl tracing::field::Visit for CollectFields<'_> {
        fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
            self.0.push_str(&format!("{}={} ", field.name(), value));
        }
        fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
            self.0.push_str(&format!("{}={:?} ", field.name(), value));
        }
        fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
            self.0.push_str(&format!("{}={} ", field.name(), value));
        }
        fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
            self.0.push_str(&format!("{}={} ", field.name(), value));
        }
        fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
            self.0.push_str(&format!("{}={} ", field.name(), value));
        }
    }

    #[tokio::test]
    async fn upsert_failure_logs_warning() {
        // ⑬a：write_success / report 的 upsert 失败此前被 `let _ =` 静默吞掉，
        // 磁盘持久化丢失无任何痕迹。必须通过 tracing::warn! 记录。
        let dir = temp_dir().join(format!("adl-pms-upsert-warn-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // 用只读连接制造 upsert 必然失败（query_only 阻止写入）。
        let conn = rusqlite::Connection::open(dir.join("db.sqlite")).unwrap();
        conn.execute_batch("PRAGMA query_only = ON;").unwrap();
        let store = Arc::new(crate::site_meta_cache::from_connection_for_test(conn));
        let svc = Arc::new(PageMetaService::new(store));

        let warns = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let sub = CapturingSubscriber { warns: warns.clone() };
        // with_default 只影响当前线程；report 是 async，须在独立线程的 runtime 上执行，
        // 且该线程的默认订阅者指向捕获器（tokio::test 内部不能再次 block_on）。
        let svc2 = svc.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            tracing::subscriber::with_default(sub, || {
                rt.block_on(async {
                    svc2.report("https://a.com/", "标题", "", META_SOURCE_HTTP).await.unwrap();
                });
            });
        })
        .join()
        .unwrap();
        assert!(
            !warns.lock().unwrap().is_empty(),
            "upsert 失败必须记录 warn 日志（当前被静默吞掉）"
        );
    }

    #[tokio::test]
    async fn fetcher_panic_does_not_leak_in_flight_entry() {
        // ⑬b：fetcher.fetch 若 panic，in_flight 单飞行条目必须被清理并通知等待者，
        // 否则后续该 URL 的所有请求都会永久阻塞在 Notify 上。
        let (svc, _) = open_service("panic-leak");
        struct PanicFetcher;
        impl PageMetaFetcher for PanicFetcher {
            fn fetch(
                &self,
                _url: &str,
            ) -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>>
            {
                Box::pin(async move { panic!("fetcher boom") })
            }
        }
        // 在独立任务中触发 panic（tokio 捕获为 JoinError）
        let h = {
            let svc = svc.clone();
            tokio::spawn(async move { svc.get("https://a.com/", true, &PanicFetcher).await })
        };
        assert!(h.await.is_err(), "fetcher panic 应传播为任务错误");

        // panic 后再次 get：若 in_flight 泄漏，会永久等待 Notify（timeout 兜底防挂死）
        let ok_fetcher = MockFetcher {
            result: std::sync::Mutex::new(Some(PageMeta {
                title: "Recovered".into(),
                favicon: "".into(),
                favicon_data_uri: "".into(),
                url: "https://a.com/".into(),
                source: String::new(),
            })),
        };
        let r = tokio::time::timeout(
            std::time::Duration::from_millis(2000),
            svc.get("https://a.com/", true, &ok_fetcher),
        )
        .await;
        let meta = r.expect("panic 后 get 必须能完成（否则 in_flight 泄漏导致永久阻塞）");
        assert_eq!(meta.unwrap().title, "Recovered");
        assert_eq!(svc.in_flight.lock().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn get_returns_cached_within_ttl_without_fetching() {
        let (svc, _) = open_service("ttl");
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        struct CountingFetcher(std::sync::Arc<std::sync::atomic::AtomicU32>);
        impl PageMetaFetcher for CountingFetcher {
            fn fetch(
                &self,
                _url: &str,
            ) -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>>
            {
                self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Box::pin(async move {
                    PageMeta {
                        title: "X".into(),
                        favicon: "".into(),
                        favicon_data_uri: "".into(),
                        url: "https://a.com/".into(),
                        source: String::new(),
                    }
                })
            }
        }
        let f = CountingFetcher(calls.clone());
        svc.get("https://a.com/", false, &f).await.unwrap();
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        // TTL 内第二次 get：命中缓存，不抓取
        svc.get("https://a.com/", false, &f).await.unwrap();
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        // force 绕过 TTL：强制重抓
        svc.get("https://a.com/", true, &f).await.unwrap();
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn get_ttl_hit_returns_real_cached_title_source() {
        // BLOCKING 修复回归：TTL 命中的 get 必须返回缓存条目的真实 title_source（com），
        // 而非硬编码 http —— 否则命令层广播 source=http，前端会拒绝后续合法 com 更新。
        let (svc, _) = open_service("ttl-source");
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        struct CountingFetcher(std::sync::Arc<std::sync::atomic::AtomicU32>);
        impl PageMetaFetcher for CountingFetcher {
            fn fetch(
                &self,
                _url: &str,
            ) -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>>
            {
                self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Box::pin(async move {
                    PageMeta {
                        title: "X".into(),
                        favicon: "".into(),
                        favicon_data_uri: "".into(),
                        url: "https://a.com/".into(),
                        source: String::new(),
                    }
                })
            }
        }
        let f = CountingFetcher(calls.clone());
        // com report 设置 title_source=com 且 last_ok_at=now（TTL 窗口内）
        svc.report("https://a.com/", "真实标题", "", META_SOURCE_COM).await.unwrap();
        // TTL 命中：mock fetcher 不触发，返回缓存条目的真实来源
        let meta = svc.get("https://a.com/", false, &f).await.unwrap();
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0, "TTL 命中不得触发抓取");
        assert_eq!(meta.source, META_SOURCE_COM);
        // R1 回归：TTL 命中必须携带真实 url（缓存键），否则命令层按 meta.url 广播出
        // url="" 事件，前端无法匹配任何 tab（镜像与 titleSourceRef 均不更新）。
        assert_eq!(meta.url, "https://a.com/");
    }

    #[tokio::test]
    async fn get_placeholder_title_does_not_clobber_authoritative() {
        let (svc, _) = open_service("placeholder");
        let fetcher = MockFetcher {
            result: std::sync::Mutex::new(Some(PageMeta {
                title: "真实标题".into(),
                favicon: "".into(),
                favicon_data_uri: "".into(),
                url: "https://a.com/".into(),
                source: String::new(),
            })),
        };
        svc.get("https://a.com/", true, &fetcher).await.unwrap();
        // 第二次抓取返回 hostname 占位标题（force 绕过 TTL）
        *fetcher.result.lock().unwrap() = Some(PageMeta {
            title: "a.com".into(),
            favicon: "".into(),
            favicon_data_uri: "".into(),
            url: "https://a.com/".into(),
            source: String::new(),
        });
        svc.get("https://a.com/", true, &fetcher).await.unwrap();
        assert_eq!(
            svc.peek("https://a.com/").unwrap().title,
            "真实标题",
            "占位标题不得覆盖权威标题"
        );
    }

    #[tokio::test]
    async fn warmup_processes_all_retry_due_urls_with_bounded_concurrency() {
        // ⑦ 预热修复：必须处理全部 retry_due URL（而不是被 limit=8 截断），
        // 且并发受 limit 上限约束（buffer_unordered）。
        let (svc, _) = open_service("warmup-all");
        let urls: Vec<String> = (0..20).map(|i| format!("https://warmup{i}.example/")).collect();
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let active = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let max_active = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        struct ConcurrentFetcher {
            calls: std::sync::Arc<std::sync::atomic::AtomicUsize>,
            active: std::sync::Arc<std::sync::atomic::AtomicUsize>,
            max_active: std::sync::Arc<std::sync::atomic::AtomicUsize>,
        }
        impl PageMetaFetcher for ConcurrentFetcher {
            fn fetch(
                &self,
                _url: &str,
            ) -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>>
            {
                let calls = self.calls.clone();
                let active = self.active.clone();
                let max_active = self.max_active.clone();
                Box::pin(async move {
                    calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    let now = active.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                    max_active.fetch_max(now, std::sync::atomic::Ordering::SeqCst);
                    // 让出，使并发真正并行（否则串行跑完才轮到下一个）
                    tokio::task::yield_now().await;
                    active.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                    PageMeta {
                        title: "Warmed".into(),
                        favicon: "".into(),
                        favicon_data_uri: "".into(),
                        url: String::new(),
                        source: String::new(),
                    }
                })
            }
        }
        let fetcher = ConcurrentFetcher {
            calls: calls.clone(),
            active: active.clone(),
            max_active: max_active.clone(),
        };
        let metas = svc.warmup(&urls, &fetcher, 8).await.unwrap();
        // 全部 20 个 URL 均被处理（旧实现 tasks.len() >= limit 在 8 处截断）
        assert_eq!(
            calls.load(std::sync::atomic::Ordering::SeqCst),
            20,
            "warmup 必须处理全部 retry_due URL"
        );
        assert_eq!(metas.len(), 20);
        // 返回的 meta 必须携带真实 url（命令层 emit 广播用）
        assert!(
            metas
                .iter()
                .all(|m| m.url.starts_with("https://warmup") && m.url.ends_with(".example/"))
        );
        // 并发受 limit=8 约束
        assert!(
            max_active.load(std::sync::atomic::Ordering::SeqCst) <= 8,
            "warmup 并发不得超过 limit"
        );
        // 所有 URL 都被缓存（write_success 写入内存）
        assert!(svc.peek("https://warmup19.example/").is_some());
    }
}
