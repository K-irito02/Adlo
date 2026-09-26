use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::watch;

use crate::config::{AppConfig, load_from};

pub struct ConfigWatcher {
    tx: watch::Sender<Arc<AppConfig>>,
    rx: watch::Receiver<Arc<AppConfig>>,
}

impl ConfigWatcher {
    pub fn new(initial: AppConfig) -> Self {
        let (tx, rx) = watch::channel(Arc::new(initial));
        Self { tx, rx }
    }

    pub async fn start_watching(&self, config_dir: PathBuf) {
        let tx = self.tx.clone();
        tokio::spawn(async move {
            let (notify_tx, mut notify_rx) = tokio::sync::mpsc::channel::<()>(16);

            let dir_clone = config_dir.clone();
            let notify_tx_clone = notify_tx.clone();
            tokio::task::spawn_blocking(move || {
                use notify::{Event, RecursiveMode, Watcher};
                // 首次运行时配置目录/文件可能尚未落盘（都随首次写入才建）。先确保监听目录存在，
                // 否则 notify 对不存在的路径返回 "Input watch path is neither a file nor a directory"。
                if let Err(e) = std::fs::create_dir_all(&dir_clone) {
                    tracing::error!("Failed to create config directory for watching: {}", e);
                    return;
                }
                let (tx, rx) = std::sync::mpsc::channel::<notify::Result<Event>>();
                let mut watcher = match notify::recommended_watcher(tx) {
                    Ok(w) => w,
                    Err(e) => {
                        tracing::error!("Failed to create file watcher: {}", e);
                        return;
                    },
                };
                // 统一 watch 配置目录而非单个文件：单文件 watch 句柄在 config 被删除重建或
                // 外部 save-as/temp+rename 原子替换后会失效并永久失去事件流。watch 目录对首
                // 次写入、删除重建、就地写（本组件 config.rs 用 std::fs::write）与替换均覆盖。
                if let Err(e) = watcher.watch(&dir_clone, RecursiveMode::NonRecursive) {
                    tracing::error!(
                        "Failed to watch config directory {}: {}",
                        dir_clone.display(),
                        e
                    );
                    return;
                }
                tracing::info!(
                    path = %dir_clone.display(),
                    "Config watcher watching config directory",
                );
                for _e in rx.into_iter().flatten() {
                    let _ = notify_tx_clone.blocking_send(());
                }
            });

            while notify_rx.recv().await.is_some() {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                while notify_rx.try_recv().is_ok() {}

                match load_from(&config_dir) {
                    Ok(new_config) => {
                        tracing::info!("Config file changed, reloading");
                        let _ = tx.send(Arc::new(new_config));
                    },
                    Err(e) => {
                        tracing::warn!("Failed to reload config: {}", e);
                    },
                }
            }
            // watcher 任务在此结束（目录 watch 全部失败或通道关闭），热更新无法继续，显式留痕。
            tracing::warn!("Config watcher exited, config hot-reload disabled");
        });
    }

    pub fn current(&self) -> Arc<AppConfig> {
        self.rx.borrow().clone()
    }

    pub fn subscribe(&self) -> watch::Receiver<Arc<AppConfig>> {
        self.rx.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_logging::LogMode;
    use adl_types::types::config::ThemeMode;

    fn test_config() -> AppConfig {
        AppConfig {
            language: "en-US".to_string(),
            theme_mode: ThemeMode::System,
            log_level: "info".to_string(),
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Overwrite,
            max_recent_workspaces: 10,
            commands: vec![],
            references: vec![],
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
            max_concurrent_workspaces: 6,
            workspace_priority_ids: vec![],
            workspace_deferred_ids: vec![],
            workspace_natural_order: vec![],
            // 任意非默认值（非产品默认断言；产品默认见 default_browser_inactive_tab_suspend_ms）。
            browser_inactive_tab_suspend_ms: 3_600_000,
            terminal_history_budget_bytes: 1 << 30,
        }
    }

    #[test]
    fn watcher_returns_initial_config() {
        let watcher = ConfigWatcher::new(test_config());
        let current = watcher.current();
        assert_eq!(current.max_recent_workspaces, 10);
    }

    #[tokio::test]
    async fn watcher_subscribe_receives_initial() {
        let watcher = ConfigWatcher::new(test_config());
        let rx = watcher.subscribe();
        let config = rx.borrow().clone();
        assert_eq!(config.max_recent_workspaces, 10);
    }
}
