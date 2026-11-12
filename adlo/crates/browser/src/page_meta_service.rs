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
        // 先持 memory 锁再读 store：与 clear/upsert/remove/report 串行化，避免
        // preload 读快照 → clear 清空 → preload 把过期快照写回内存的竞态（否则
        // 内存/磁盘短暂分叉直到重启）。store.get_all 为同步调用，锁内无 await。
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let all = self.store.get_all()?;
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
    /// 全程持有 memory 锁：先写 store（写失败则不动内存，错误上抛），再清内存，
    /// 避免并发 `report()` 在 store 与内存提交之间插入后被清掉（内存/磁盘分叉）。
    pub fn clear(&self) -> Result<(), AppError> {
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        self.store.clear()?;
        memory.clear();
        Ok(())
    }

    /// 批量写入缓存条目（前端写路径，与预览端 PUT /site-meta-cache 对齐）。
    /// 键统一经 `normalize_cache_key` 规范化；内存 + 磁盘同步写入。
    /// 全程持有 memory 锁：先写 store（写失败则不动内存，错误上抛），再以同一快照
    /// 提交内存，避免并发 `report()` 的更新在窗口内被旧快照覆盖。
    pub fn upsert(&self, entries: &HashMap<String, SiteMetaCacheEntry>) -> Result<(), AppError> {
        let mut normalized = HashMap::with_capacity(entries.len());
        for (url, entry) in entries {
            normalized.insert(normalize_cache_key(url), entry.clone());
        }
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        self.store.upsert(&normalized)?;
        for (k, v) in &normalized {
            memory.insert(k.clone(), v.clone());
        }
        Ok(())
    }

    /// 批量删除缓存条目（前端写路径，与预览端 DELETE /site-meta-cache 对齐）。
    /// 全程持有 memory 锁：先写 store（写失败则不动内存，错误上抛），再删内存，
    /// 避免并发 `report()` 在窗口内写回的条目被内存侧漏删（store 残留）。
    pub fn remove(&self, urls: &[String]) -> Result<(), AppError> {
        let keys: Vec<String> = urls.iter().map(|u| normalize_cache_key(u)).collect();
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        self.store.remove(&keys)?;
        for k in &keys {
            memory.remove(k);
        }
        Ok(())
    }

    /// 回填已抓取 favicon 的 data-URI（静默渲染路径生成后调用），持久化到内存 + 磁盘，
    /// 使重启后镜像/缓存仍携带 data-URI —— 否则防盗链站点（bilibili/runoob）重启后
    /// 只剩裸 favicon URL，前端跨域 <img> 命中防盗链重定向回兜底图标。
    /// 无该 URL 的既有条目时不写入（data-URI 仅在已有 favicon_url 的基础上补全）。
    /// 全程持有 memory 锁（读-改-写与 store 提交、内存提交同一临界区）：写失败则
    /// 不动内存，错误上抛；同时保证与并发 `report()` 串行化，不丢失其标题/图标更新。
    pub fn update_favicon_data_uri(&self, url: &str, data_uri: &str) -> Result<bool, AppError> {
        let key = normalize_cache_key(url);
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let Some(existing) = memory.get(&key).cloned() else {
            return Ok(false);
        };
        if existing.favicon_data_uri == data_uri {
            return Ok(false);
        }
        let mut updated = existing;
        updated.favicon_data_uri = data_uri.to_string();
        let mut map = HashMap::new();
        map.insert(key.clone(), updated.clone());
        // 先写 store：写失败则不动内存，错误上抛，避免内存/磁盘 data-URI 分叉。
        self.store.upsert(&map)?;
        memory.insert(key, updated);
        Ok(true)
    }

    /// 失败退避基数（与预览端 `RETRY_BASE_MS` 同构）：5 分钟。
    const RETRY_BASE_MS: i64 = 5 * 60 * 1000;
    /// 失败退避上限（与预览端 `RETRY_MAX_MS` 同构）：2 小时。
    const RETRY_MAX_MS: i64 = 2 * 3600 * 1000;

    /// 抓取失败落「墓碑」：fail_count+1、`next_retry_at` 指数退避
    /// （`min(BASE * 2^min(fail_count,5), MAX)`，与预览端 `markFailure` 同构）。
    /// 双端墓碑均持久化（预览端 markFailure 经 schedulePersist 写 JSON 持久层），
    /// 跨重启仍生效。既有条目（含已有标题/图标）保留字段不清空；无成功记录
    /// （last_ok_at==0）的条目才受退避约束（backoff 判定侧负责）。全程持有
    /// memory 锁，与 report/upsert/clear/update_favicon_data_uri 串行化；
    /// store 写失败仅 warn（尽力持久化，尽力项失败不阻塞调用方）。
    pub fn note_failure(&self, url: &str) -> Result<(), AppError> {
        let key = normalize_cache_key(url);
        let now = chrono_now_ms();
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let existing = memory.get(&key).cloned();
        let fail_count =
            existing.as_ref().map(|e| e.fail_count.saturating_add(1)).unwrap_or(1).max(1);
        let shift = fail_count.clamp(1, 5);
        let delay = Self::RETRY_BASE_MS.saturating_mul(1_i64 << shift).min(Self::RETRY_MAX_MS);
        let entry = SiteMetaCacheEntry {
            title: existing.as_ref().map(|e| e.title.clone()).unwrap_or_default(),
            title_source: existing.as_ref().map(|e| e.title_source.clone()).unwrap_or_default(),
            favicon_url: existing.as_ref().map(|e| e.favicon_url.clone()).unwrap_or_default(),
            favicon_data_uri: existing
                .as_ref()
                .map(|e| e.favicon_data_uri.clone())
                .unwrap_or_default(),
            fetched_at: now,
            last_ok_at: existing.as_ref().map(|e| e.last_ok_at).unwrap_or(0),
            next_retry_at: now + delay,
            fail_count,
        };
        let mut map = HashMap::new();
        map.insert(key.clone(), entry.clone());
        if let Err(e) = self.store.upsert(&map) {
            tracing::warn!(url = %key, error = %e, "persist site meta failure tombstone failed");
        }
        memory.insert(key, entry);
        Ok(())
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
        // 全程持有 memory 锁：先写 store（失败仅记 warn，report 为尽力持久化），
        // 再提交内存，保证持久化快照与内存快照一致，且与 update_favicon_data_uri /
        // clear / upsert / remove 串行化，避免并发交错覆盖丢失更新。
        let mut map = HashMap::new();
        map.insert(key.clone(), entry.clone());
        if let Err(e) = self.store.upsert(&map) {
            tracing::warn!(url = %key, error = %e, "persist site meta upsert failed");
        }
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
        memory.insert(key, entry);
        drop(memory);
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
    async fn note_failure_backs_off_and_persists_across_restart() {
        // 静默抓取全空（超时/登录墙/反爬）时落「墓碑」条目：fail_count+1、
        // next_retry_at 指数退避，并持久化到 store —— 重启后（preload 载入）
        // 仍处于退避态，失败站点不再每次启动都重抓。
        let (svc, dir) = open_service("note-failure-persist");
        svc.note_failure("https://fail.example/").unwrap();
        let e = svc.peek("https://fail.example/").unwrap();
        assert_eq!(e.fail_count, 1);
        assert_eq!(e.last_ok_at, 0, "失败不得伪造成功");
        assert_eq!(e.title, "");
        assert!(e.next_retry_at > chrono_now_ms(), "退避期必须在未来");
        // 跨重启：新实例从同一目录 preload，墓碑仍在
        let store = crate::site_meta_cache::SiteMetaCacheStore::open(&dir).unwrap();
        let svc2 = PageMetaService::new(store);
        svc2.preload().await.unwrap();
        let e2 = svc2.peek("https://fail.example/").unwrap();
        assert_eq!(e2.fail_count, 1);
        assert!(e2.next_retry_at > 0);
        // 再次失败：退避时长不下降、fail_count 递增
        svc2.note_failure("https://fail.example/").unwrap();
        let e3 = svc2.peek("https://fail.example/").unwrap();
        assert_eq!(e3.fail_count, 2);
        assert!(e3.next_retry_at >= e2.next_retry_at);
    }

    #[tokio::test]
    async fn note_failure_preserves_good_entry_and_report_resets() {
        // 已有成功条目（last_ok_at>0）被失败不清空标题/图标；退避仅约束无成功记录的条目。
        // 之后一次成功 report 清零 fail_count / next_retry_at。
        let (svc, _) = open_service("note-failure-preserve");
        svc.report(
            "https://ok.example/",
            "真实标题",
            "https://cdn.ok.example/i.ico",
            META_SOURCE_COM,
        )
        .await
        .unwrap();
        svc.note_failure("https://ok.example/").unwrap();
        let e = svc.peek("https://ok.example/").unwrap();
        assert_eq!(e.fail_count, 1);
        assert_eq!(e.title, "真实标题", "失败不得清空既有标题");
        assert_eq!(e.favicon_url, "https://cdn.ok.example/i.ico");
        assert!(e.last_ok_at > 0);
        svc.report("https://ok.example/", "新标题", "", META_SOURCE_COM).await.unwrap();
        let e = svc.peek("https://ok.example/").unwrap();
        assert_eq!(e.fail_count, 0, "成功后退避清零");
        assert_eq!(e.next_retry_at, 0);
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
