use adl_browser::webview_handle::{Bounds, WebViewHandle};
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
    fn clear_cookies(&self) -> Result<(), AppError> {
        Ok(())
    }
    fn clear_cache(&self) -> Result<(), AppError> {
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
