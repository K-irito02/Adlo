use adl_browser::webview_handle::{Bounds, CleanupDone, WebViewHandle};
use adl_browser::{BrowserManager, BrowserPool, SiteMetaCacheStore};
use adl_errors::AppError;
use std::sync::{Arc, Mutex};

/// 记录 show 调用的桩，用于断言 `activate_tab` 的作用范围。
struct RecordingHandle {
    id: String,
    calls: Arc<Mutex<Vec<String>>>,
}

fn record(calls: &Arc<Mutex<Vec<String>>>, entry: String) {
    match calls.lock() {
        Ok(mut guard) => guard.push(entry),
        Err(e) => e.into_inner().push(entry),
    }
}

impl WebViewHandle for RecordingHandle {
    fn navigate(&self, _url: &str) -> Result<(), AppError> {
        Ok(())
    }
    fn close(&self) -> Result<(), AppError> {
        Ok(())
    }
    fn set_bounds(&self, _bounds: Bounds) -> Result<(), AppError> {
        Ok(())
    }
    fn eval_js(&self, _js: &str) -> Result<String, AppError> {
        Ok(String::new())
    }
    fn set_color_scheme(&self, _scheme: &str) -> Result<(), AppError> {
        Ok(())
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn show(&self) -> Result<(), AppError> {
        record(&self.calls, format!("show:{}", self.id));
        Ok(())
    }
    fn set_zoom(&self, _factor: f64) -> Result<(), AppError> {
        Ok(())
    }
    fn mute(&self, _muted: bool) -> Result<(), AppError> {
        Ok(())
    }
    fn clear_cookies(&self, done: CleanupDone) -> Result<(), AppError> {
        record(&self.calls, format!("clear_cookies:{}", self.id));
        let _ = done.send(Ok(()));
        Ok(())
    }
    fn clear_site_cookies(&self, done: CleanupDone) -> Result<(), AppError> {
        record(&self.calls, format!("clear_site_cookies:{}", self.id));
        let _ = done.send(Ok(()));
        Ok(())
    }
    fn clear_cache_and_reload(&self, done: CleanupDone) -> Result<(), AppError> {
        record(&self.calls, format!("clear_cache_and_reload:{}", self.id));
        let _ = done.send(Ok(()));
        Ok(())
    }
    fn clear_site_cache(&self, done: CleanupDone) -> Result<(), AppError> {
        record(&self.calls, format!("clear_site_cache:{}", self.id));
        let _ = done.send(Ok(()));
        Ok(())
    }
    fn hard_reload(&self) -> Result<(), AppError> {
        record(&self.calls, format!("hard_reload:{}", self.id));
        Ok(())
    }
    fn open_devtools(&self) -> Result<(), AppError> {
        record(&self.calls, format!("open_devtools:{}", self.id));
        Ok(())
    }
    fn go_back(&self) -> Result<bool, AppError> {
        Ok(false)
    }
    fn go_forward(&self) -> Result<bool, AppError> {
        Ok(false)
    }
    fn can_go_back(&self) -> Result<bool, AppError> {
        Ok(false)
    }
    fn can_go_forward(&self) -> Result<bool, AppError> {
        Ok(false)
    }
}

#[test]
fn test_pool_integration_lifecycle() {
    let pool = BrowserPool::new();
    assert_eq!(pool.register("tab-a".into()), None);
    assert_eq!(pool.register("tab-b".into()), None);
    assert_eq!(pool.register("tab-c".into()), None);
    assert_eq!(pool.size(), 3);
    assert_eq!(pool.tab_ids(), vec!["tab-a".to_string(), "tab-b".to_string(), "tab-c".to_string()]);
    pool.remove("tab-a");
    assert_eq!(pool.size(), 2);
}

#[test]
fn test_pool_registration_never_evicts() {
    let pool = BrowserPool::new();
    pool.register("a".into());
    pool.register("b".into());
    assert_eq!(pool.register("c".into()), None);
    assert_eq!(pool.register("d".into()), None);
    assert_eq!(pool.size(), 4);
    assert_eq!(
        pool.tab_ids(),
        vec!["a".to_string(), "b".to_string(), "c".to_string(), "d".to_string()]
    );
}

#[test]
fn activate_tab_only_affects_the_target_tab() {
    // 中心与右侧面板是两个独立宿主、共享同一个 WebView 池：激活一个 tab 只能
    // show 它自己，**不得**隐藏池中其它 tab —— 否则一个宿主打开标签会把另一个
    // 宿主正在显示的 WebView 一并隐藏（单宿主时代遗留的整体互斥语义）。
    let dir = std::env::temp_dir().join(format!("adl-bwm-activate-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    assert!(std::fs::create_dir_all(&dir).is_ok());
    let store = SiteMetaCacheStore::open(&dir).expect("open site meta cache store");
    let manager = BrowserManager::new(store);

    let calls = Arc::new(Mutex::new(Vec::new()));
    for id in ["center-tab", "panel-tab"] {
        let handle = Arc::new(RecordingHandle { id: id.to_string(), calls: calls.clone() });
        assert!(manager.create_for_tab(handle, id).is_ok());
    }

    assert!(manager.activate_tab("center-tab").is_ok());
    assert!(manager.activate_tab("panel-tab").is_ok());
    // 未注册 handle 的 tab 不视为错误（前端「先 create 后 activate」的时序之外）。
    assert!(manager.activate_tab("unknown-tab").is_ok());

    let recorded = calls.lock().expect("calls mutex poisoned").clone();
    assert_eq!(recorded, vec!["show:center-tab".to_string(), "show:panel-tab".to_string()]);

    // 先释放持有 SQLite 连接的 manager，否则 Windows 下目录被占用、remove_dir_all 失败
    // （`let _ =` 会静默吞掉，临时目录残留）。
    drop(manager);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn tab_scoped_actions_target_only_the_requested_webview() {
    // 「打开开发者工具」「强制刷新」「清除本站 Cookie」都必须按 tab 定位：
    // 中心与右侧面板共享同一个 WebView 池，打错 tab 的后果是“点了没反应”
    // 或者调试到别的页面（历史 bug：命令不带 label 时命中应用壳自身）。
    let dir = std::env::temp_dir().join(format!("adl-bwm-tab-scoped-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    assert!(std::fs::create_dir_all(&dir).is_ok());
    let store = SiteMetaCacheStore::open(&dir).expect("open site meta cache store");
    let manager = BrowserManager::new(store);

    let calls = Arc::new(Mutex::new(Vec::new()));
    for id in ["center-tab", "panel-tab"] {
        let handle = Arc::new(RecordingHandle { id: id.to_string(), calls: calls.clone() });
        assert!(manager.create_for_tab(handle, id).is_ok());
    }

    assert!(manager.open_devtools_for_tab("center-tab").is_ok());
    assert!(manager.hard_reload_tab("panel-tab").is_ok());

    // 清理类动作用完成回执：命令层靠它判断成败，不能“发出即成功”。
    let (tx, rx) = std::sync::mpsc::channel();
    assert!(manager.clear_site_cookies_for_tab("panel-tab", tx).is_ok());
    assert!(matches!(rx.recv_timeout(std::time::Duration::from_secs(1)), Ok(Ok(()))));

    let (tx, rx) = std::sync::mpsc::channel();
    assert!(manager.clear_cache_for_tab("center-tab", tx).is_ok());
    assert!(matches!(rx.recv_timeout(std::time::Duration::from_secs(1)), Ok(Ok(()))));

    let (tx, rx) = std::sync::mpsc::channel();
    assert!(manager.clear_site_cache_for_tab("panel-tab", tx).is_ok());
    assert!(matches!(rx.recv_timeout(std::time::Duration::from_secs(1)), Ok(Ok(()))));

    let recorded = calls.lock().expect("calls mutex poisoned").clone();
    assert_eq!(
        recorded,
        vec![
            "open_devtools:center-tab".to_string(),
            "hard_reload:panel-tab".to_string(),
            "clear_site_cookies:panel-tab".to_string(),
            // 本用例覆盖：三个清理动作只把动作透传到目标 tab 的 handle（下面的
            // recorded 序列逐 tab 断言），不会串到另一个宿主的标签。
            "clear_cache_and_reload:center-tab".to_string(),
            "clear_site_cache:panel-tab".to_string(),
        ]
    );

    // 未入池的标签（仍以 iframe 渲染 / 尚未创建）→ NotFound，供前端提示“未就绪”，
    // 不能笼统按内部错误处理。本轮六个需要 WebView 的入口口径必须一致。
    let err = manager.open_devtools_for_tab("no-webview").unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)), "unexpected error: {err:?}");
    let err = manager.hard_reload_tab("no-webview").unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)), "unexpected error: {err:?}");
    let (tx, _rx) = std::sync::mpsc::channel();
    let err = manager.clear_cookies_for_tab("no-webview", tx).unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)), "unexpected error: {err:?}");
    let (tx, _rx) = std::sync::mpsc::channel();
    let err = manager.clear_site_cookies_for_tab("no-webview", tx).unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)), "unexpected error: {err:?}");
    let (tx, _rx) = std::sync::mpsc::channel();
    let err = manager.clear_cache_for_tab("no-webview", tx).unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)), "unexpected error: {err:?}");
    let (tx, _rx) = std::sync::mpsc::channel();
    let err = manager.clear_site_cache_for_tab("no-webview", tx).unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)), "unexpected error: {err:?}");

    drop(manager);
    let _ = std::fs::remove_dir_all(&dir);
}
