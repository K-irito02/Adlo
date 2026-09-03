use crate::config::{AppConfig, load};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::watch;

pub struct ConfigWatcher {
    tx: watch::Sender<Arc<AppConfig>>,
    rx: watch::Receiver<Arc<AppConfig>>,
}

impl ConfigWatcher {
    pub fn new(initial: AppConfig) -> Self {
        let (tx, rx) = watch::channel(Arc::new(initial));
        Self { tx, rx }
    }

    pub async fn start_watching(&self, config_path: PathBuf, data_dir: PathBuf) {
        let tx = self.tx.clone();
        tokio::spawn(async move {
            let (notify_tx, mut notify_rx) = tokio::sync::mpsc::channel::<()>(16);

            let path_clone = config_path.clone();
            let notify_tx_clone = notify_tx.clone();
            tokio::task::spawn_blocking(move || {
                use notify::{Event, RecursiveMode, Watcher};
                let (tx, rx) = std::sync::mpsc::channel::<notify::Result<Event>>();
                let mut watcher = match notify::recommended_watcher(tx) {
                    Ok(w) => w,
                    Err(e) => {
                        tracing::error!("Failed to create file watcher: {}", e);
                        return;
                    },
                };
                if let Err(e) = watcher.watch(&path_clone, RecursiveMode::NonRecursive) {
                    tracing::error!("Failed to watch config file: {}", e);
                    return;
                }
                for _e in rx.into_iter().flatten() {
                    let _ = notify_tx_clone.blocking_send(());
                }
            });

            while notify_rx.recv().await.is_some() {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                while notify_rx.try_recv().is_ok() {}

                match load(&data_dir) {
                    Ok(new_config) => {
                        tracing::info!("Config file changed, reloading");
                        let _ = tx.send(Arc::new(new_config));
                    },
                    Err(e) => {
                        tracing::warn!("Failed to reload config: {}", e);
                    },
                }
            }
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
            browser_inactive_tab_suspend_ms: 3_600_000,
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
