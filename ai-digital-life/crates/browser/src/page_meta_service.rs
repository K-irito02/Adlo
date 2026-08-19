use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use adl_errors::AppError;

use crate::meta_merge::{
    existing_favicon_baseline, should_apply_exact_match_title, should_replace_favicon,
};
use crate::site_meta_cache::{SiteMetaCacheEntry, SiteMetaCacheStore, normalize_cache_key};

pub struct PageMetaService {
    store: Arc<SiteMetaCacheStore>,
    pub(crate) memory: Mutex<HashMap<String, SiteMetaCacheEntry>>,
}

impl PageMetaService {
    pub fn new(store: Arc<SiteMetaCacheStore>) -> Self {
        Self { store, memory: Mutex::new(HashMap::new()) }
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

    /// 清空全部缓存条目（内存 + 磁盘）。命令层 `browser_site_meta_clear` 使用：
    /// 仅清 store 会留下会话内 `peek`/get 仍命中陈旧内存条目的窗口。
    pub fn clear(&self) -> Result<(), AppError> {
        self.memory.lock().unwrap_or_else(|e| e.into_inner()).clear();
        self.store.clear()
    }

    /// 批量写入缓存条目（前端写路径，与预览端 PUT /site-meta-cache 对齐）。
    /// 键统一经 `normalize_cache_key` 规范化；内存 + 磁盘同步写入。
    pub fn upsert(&self, entries: &HashMap<String, SiteMetaCacheEntry>) -> Result<(), AppError> {
        let mut normalized = HashMap::with_capacity(entries.len());
        for (url, entry) in entries {
            normalized.insert(normalize_cache_key(url), entry.clone());
        }
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        for (k, v) in &normalized {
            memory.insert(k.clone(), v.clone());
        }
        drop(memory);
        self.store.upsert(&normalized)
    }

    /// 批量删除缓存条目（前端写路径，与预览端 DELETE /site-meta-cache 对齐）。
    pub fn remove(&self, urls: &[String]) -> Result<(), AppError> {
        let keys: Vec<String> = urls.iter().map(|u| normalize_cache_key(u)).collect();
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        for k in &keys {
            memory.remove(k);
        }
        drop(memory);
        self.store.remove(&keys)
    }

    /// 回填已抓取 favicon 的 data-URI（静默渲染路径生成后调用），持久化到内存 + 磁盘，
    /// 使重启后镜像/缓存仍携带 data-URI —— 否则防盗链站点（bilibili/runoob）重启后
    /// 只剩裸 favicon URL，前端跨域 <img> 命中防盗链重定向回兜底图标。
    /// 无该 URL 的既有条目时不写入（data-URI 仅在已有 favicon_url 的基础上补全）。
    pub fn update_favicon_data_uri(&self, url: &str, data_uri: &str) -> Result<bool, AppError> {
        let key = normalize_cache_key(url);
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let Some(entry) = memory.get_mut(&key) else {
            return Ok(false);
        };
        if entry.favicon_data_uri == data_uri {
            return Ok(false);
        }
        entry.favicon_data_uri = data_uri.to_string();
        let cloned = entry.clone();
        drop(memory);
        let mut map = HashMap::new();
        map.insert(key.clone(), cloned);
        self.store.upsert(&map)?;
        Ok(true)
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
        tracing::debug!(
            url = %key,
            title_applied,
            favicon_applied,
            new_title = %entry.title,
            new_title_len = entry.title.len(),
            new_favicon = %entry.favicon_url,
            new_favicon_len = entry.favicon_url.len(),
            "page_meta.report: cache updated"
        );
        let mut map = HashMap::new();
        map.insert(key.clone(), entry);
        if let Err(e) = self.store.upsert(&map) {
            tracing::warn!(url = %key, error = %e, "persist site meta upsert failed");
        }
        Ok(true)
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
    use crate::meta_merge::{META_SOURCE_COM, META_SOURCE_HTTP};
    use crate::site_meta_cache::SiteMetaCacheStore;
    use std::env::temp_dir;

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
    async fn clear_empties_memory_and_store() {
        // 清空必须同时覆盖内存缓存与磁盘缓存：仅清 store 会留下会话内 peek 命中
        // 陈旧内存条目的窗口。
        let (svc, dir) = open_service("clear");
        svc.report("https://a.example/", "标题", "", META_SOURCE_COM).await.unwrap();
        assert!(svc.peek("https://a.example/").is_some());
        svc.clear().unwrap();
        assert!(svc.peek("https://a.example/").is_none(), "clear 必须清空内存缓存");
        let store = SiteMetaCacheStore::open(&dir).unwrap();
        assert!(store.get_all().unwrap().is_empty(), "clear 必须清空磁盘缓存");
    }

    #[tokio::test]
    async fn upsert_and_remove_update_memory_and_store() {
        // 前端写路径（tauri/preview 双端一致）：upsert 写内存 + 磁盘且键归一化，
        // remove 同步删除。
        let (svc, dir) = open_service("upsert-remove");
        let mut entries = HashMap::new();
        entries.insert(
            "https://a.example/".into(),
            SiteMetaCacheEntry {
                title: "A".into(),
                title_source: META_SOURCE_COM.into(),
                favicon_url: "".into(),
                favicon_data_uri: "".into(),
                fetched_at: 0,
                last_ok_at: 0,
                next_retry_at: 0,
                fail_count: 0,
            },
        );
        svc.upsert(&entries).unwrap();
        assert_eq!(svc.peek("https://a.example/#frag").unwrap().title, "A", "键应归一化");
        svc.remove(&["https://a.example/".into()]).unwrap();
        assert!(svc.peek("https://a.example/").is_none());
        let store = SiteMetaCacheStore::open(&dir).unwrap();
        assert!(store.get_all().unwrap().is_empty(), "remove 必须同步磁盘");
    }

    #[tokio::test]
    async fn update_favicon_data_uri_persists_and_preserves_fields() {
        // 静默路径回填 data-URI：必须写内存 + 磁盘，且保留既有的 title/favicon_url。
        let (svc, dir) = open_service("data-uri");
        svc.report("https://b.example/", "B站", "https://cdn.b.example/icon.ico", META_SOURCE_COM)
            .await
            .unwrap();
        // 更新 data-URI → 返回 changed=true
        assert!(
            svc.update_favicon_data_uri("https://b.example/", "data:image/x-icon;base64,AA")
                .unwrap()
        );
        let e = svc.peek("https://b.example/").unwrap();
        assert_eq!(e.favicon_data_uri, "data:image/x-icon;base64,AA");
        assert_eq!(e.title, "B站", "回填 data-URI 不得覆盖标题");
        assert_eq!(e.favicon_url, "https://cdn.b.example/icon.ico", "回填不得覆盖 favicon URL");
        // 相同值再更新 → changed=false 且不报错
        assert!(
            !svc.update_favicon_data_uri("https://b.example/", "data:image/x-icon;base64,AA")
                .unwrap()
        );
        // 磁盘持久化（新建服务从 store 预载能取回 data-URI）
        let store = crate::site_meta_cache::SiteMetaCacheStore::open(&dir).unwrap();
        let svc2 = PageMetaService::new(store);
        svc2.preload().await.unwrap();
        assert_eq!(
            svc2.peek("https://b.example/").unwrap().favicon_data_uri,
            "data:image/x-icon;base64,AA"
        );
        // 无既有条目 → no-op（返回 false，不新增）
        assert!(
            !svc.update_favicon_data_uri("https://missing.example/", "data:image/png;base64,BB")
                .unwrap()
        );
        assert!(svc.peek("https://missing.example/").is_none());
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
        // 占位标题无法经 report 写入（占位门控拒绝 incoming 占位），
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
        // ⑬a：report 的 upsert 失败此前被 `let _ =` 静默吞掉，磁盘持久化丢失无任何痕迹。
        // 必须通过 tracing::warn! 记录。
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
    async fn report_captcha_title_is_rejected() {
        // report 来源（iframe 渲染期）携带验证码标题 → should_apply_exact_match_title 拒绝，
        // 不会覆盖现有占位/真实标题。
        let (svc, _) = open_service("report-captcha");
        let changed = svc
            .report("https://www.bilibili.com/", "验证码_哔哩哔哩", "", META_SOURCE_HTTP)
            .await
            .unwrap();
        // 无既有条目时 report 返回 false 且不新增内存条目（验证码标题绝不落库/落缓存）。
        assert!(!changed);
        assert!(svc.peek("https://www.bilibili.com/").is_none(), "验证码标题不得写入缓存");
    }
}
