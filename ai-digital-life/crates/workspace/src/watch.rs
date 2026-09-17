use adl_errors::AppError;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::mpsc;
use std::time::Duration;

/// 单批上限：超出即置 `overflow`，由前端退化为整轮重搜。
const MAX_BATCH_PATHS: usize = 500;
/// 默认去抖窗口（决策：后端去抖，避免事件风暴穿透 IPC）。
const DEFAULT_DEBOUNCE: Duration = Duration::from_millis(400);

/// watcher 额外忽略的**应用自身写入**目录（在 `tree::ignored_dirs()` 之上）：
/// 不排除会形成"应用写日志 → 事件 → 重算 → 再写日志"的自触发循环。
const EXTRA_IGNORED_DIRS: &[&str] = &[".adl-logs", "logs", "test-artifacts"];
/// 额外忽略的文件名后缀（含全名匹配项）。
const EXTRA_IGNORED_SUFFIXES: &[&str] =
    &["debug-logs.txt", "debug-logs-browser.txt", ".tmp", ".DS_Store"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FilesChangedBatch {
    pub changed: Vec<String>,
    pub removed: Vec<String>,
    pub overflow: bool,
}

/// 活动工作区文件监听器：只负责产出 `FilesChangedBatch`，不含任何搜索逻辑。
pub struct WorkspaceWatcher {
    _watcher: RecommendedWatcher,
    worker: Option<std::thread::JoinHandle<()>>,
}

fn is_ignored_path(relative: &Path) -> bool {
    for component in relative.components() {
        if let std::path::Component::Normal(name) = component {
            let name = name.to_string_lossy();
            if crate::tree::should_ignore(&name) || EXTRA_IGNORED_DIRS.contains(&name.as_ref()) {
                return true;
            }
        }
    }
    let file_name =
        relative.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    EXTRA_IGNORED_SUFFIXES.iter().any(|suffix| file_name.ends_with(suffix))
}

fn to_relative(root: &Path, absolute: &Path) -> Option<String> {
    let relative = absolute.strip_prefix(root).ok()?;
    Some(relative.to_string_lossy().replace('\\', "/"))
}

impl WorkspaceWatcher {
    /// 启动监听（默认 400ms 去抖）；`on_batch` 在**独立线程**中被调用，不阻塞 notify 回调。
    pub fn start(
        root: &Path,
        on_batch: Arc<dyn Fn(FilesChangedBatch) + Send + Sync>,
    ) -> Result<Self, AppError> {
        Self::start_with_debounce(root, on_batch, DEFAULT_DEBOUNCE)
    }

    /// 测试专用：允许指定去抖窗口（`#[cfg(test)]` 之外不可见，避免生产误用）。
    #[cfg(test)]
    pub(crate) fn start_for_test(
        root: &Path,
        on_batch: Arc<dyn Fn(FilesChangedBatch) + Send + Sync>,
        debounce: Duration,
    ) -> Result<Self, AppError> {
        Self::start_with_debounce(root, on_batch, debounce)
    }

    fn start_with_debounce(
        root: &Path,
        on_batch: Arc<dyn Fn(FilesChangedBatch) + Send + Sync>,
        debounce: Duration,
    ) -> Result<Self, AppError> {
        if !root.is_dir() {
            return Err(AppError::NotFound(format!("watch root: {}", root.display())));
        }
        let (raw_tx, raw_rx) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher = notify::recommended_watcher(move |event| {
            let _ = raw_tx.send(event);
        })
        .map_err(|e| AppError::Internal(format!("failed to create file watcher: {e}")))?;
        watcher
            .watch(root, RecursiveMode::Recursive)
            .map_err(|e| AppError::Internal(format!("failed to watch {}: {e}", root.display())))?;

        let root_owned = root.to_path_buf();
        let worker = std::thread::spawn(move || {
            let mut changed: BTreeSet<String> = BTreeSet::new();
            let mut removed: BTreeSet<String> = BTreeSet::new();
            loop {
                match raw_rx.recv_timeout(debounce) {
                    Ok(Ok(event)) => {
                        let is_remove = matches!(
                            event.kind,
                            EventKind::Remove(_)
                                | EventKind::Modify(notify::event::ModifyKind::Name(_))
                        );
                        for path in event.paths {
                            let Some(relative) = to_relative(&root_owned, &path) else {
                                continue;
                            };
                            if is_ignored_path(PathBuf::from(&relative).as_path()) {
                                continue;
                            }
                            if is_remove && !path.exists() {
                                removed.insert(relative.clone());
                                changed.remove(&relative);
                            } else {
                                removed.remove(&relative);
                                changed.insert(relative);
                            }
                        }
                    },
                    Ok(Err(err)) => {
                        tracing::warn!(error = %err, "workspace watcher reported an error");
                    },
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        if changed.is_empty() && removed.is_empty() {
                            continue;
                        }
                        let overflow = changed.len() + removed.len() > MAX_BATCH_PATHS;
                        let mut changed_list: Vec<String> =
                            std::mem::take(&mut changed).into_iter().collect();
                        let mut removed_list: Vec<String> =
                            std::mem::take(&mut removed).into_iter().collect();
                        changed_list.truncate(MAX_BATCH_PATHS);
                        removed_list.truncate(MAX_BATCH_PATHS);
                        on_batch(FilesChangedBatch {
                            changed: changed_list,
                            removed: removed_list,
                            overflow,
                        });
                    },
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        Ok(Self { _watcher: watcher, worker: Some(worker) })
    }

    /// 停止监听（drop watcher 会关闭 notify 通道，工作线程随 `Disconnected` 退出）。
    pub fn stop(mut self) {
        drop(self._watcher);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    static W_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir() -> std::path::PathBuf {
        let id = W_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("workspace-watch-test-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    /// 轮询等待谓词成立（避免依赖固定 sleep 造成 flaky）
    fn wait_until<F: Fn() -> bool>(predicate: F, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if predicate() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        predicate()
    }

    #[test]
    fn watcher_reports_written_file_as_changed() {
        let tmp = unique_tmp_dir();
        let batches: Arc<Mutex<Vec<FilesChangedBatch>>> = Arc::new(Mutex::new(vec![]));
        let sink = batches.clone();
        let watcher = WorkspaceWatcher::start_for_test(
            &tmp,
            Arc::new(move |batch| sink.lock().unwrap().push(batch)),
            Duration::from_millis(150),
        )
        .unwrap();

        std::fs::write(tmp.join("a.txt"), b"hello").unwrap();

        assert!(
            wait_until(
                || batches.lock().unwrap().iter().any(|b| b.changed.contains(&"a.txt".to_string())),
                Duration::from_secs(5)
            ),
            "expected a batch containing a.txt, got {:?}",
            batches.lock().unwrap()
        );
        watcher.stop();
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn watcher_reports_deleted_file_as_removed() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("gone.txt"), b"bye").unwrap();
        let batches: Arc<Mutex<Vec<FilesChangedBatch>>> = Arc::new(Mutex::new(vec![]));
        let sink = batches.clone();
        let watcher = WorkspaceWatcher::start_for_test(
            &tmp,
            Arc::new(move |batch| sink.lock().unwrap().push(batch)),
            Duration::from_millis(150),
        )
        .unwrap();

        std::fs::remove_file(tmp.join("gone.txt")).unwrap();

        assert!(
            wait_until(
                || batches
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|b| b.removed.contains(&"gone.txt".to_string())),
                Duration::from_secs(5)
            ),
            "expected a batch with gone.txt removed, got {:?}",
            batches.lock().unwrap()
        );
        watcher.stop();
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn watcher_debounces_bursty_writes_into_one_batch() {
        let tmp = unique_tmp_dir();
        let batches: Arc<Mutex<Vec<FilesChangedBatch>>> = Arc::new(Mutex::new(vec![]));
        let sink = batches.clone();
        let watcher = WorkspaceWatcher::start_for_test(
            &tmp,
            Arc::new(move |batch| sink.lock().unwrap().push(batch)),
            Duration::from_millis(250),
        )
        .unwrap();

        for i in 0..10 {
            std::fs::write(tmp.join(format!("burst-{i}.txt")), b"x").unwrap();
        }

        assert!(
            wait_until(
                || {
                    let all = batches.lock().unwrap();
                    all.iter().any(|b| b.changed.len() >= 10)
                        || all.iter().map(|b| b.changed.len()).sum::<usize>() >= 10
                },
                Duration::from_secs(5)
            ),
            "expected all burst writes reported, got {:?}",
            batches.lock().unwrap()
        );
        watcher.stop();
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn watcher_ignores_log_noise_dirs_and_debug_logs() {
        let tmp = unique_tmp_dir();
        std::fs::create_dir_all(tmp.join(".adl-logs")).unwrap();
        std::fs::create_dir_all(tmp.join("target")).unwrap();
        let batches: Arc<Mutex<Vec<FilesChangedBatch>>> = Arc::new(Mutex::new(vec![]));
        let sink = batches.clone();
        let watcher = WorkspaceWatcher::start_for_test(
            &tmp,
            Arc::new(move |batch| sink.lock().unwrap().push(batch)),
            Duration::from_millis(150),
        )
        .unwrap();

        std::fs::write(tmp.join(".adl-logs").join("debug-logs.txt"), b"log line").unwrap();
        std::fs::write(tmp.join("target").join("artifact.bin"), b"bin").unwrap();
        std::fs::write(tmp.join("debug-logs.txt"), b"root log").unwrap();
        std::fs::write(tmp.join("keep.txt"), b"kept").unwrap();

        assert!(
            wait_until(
                || batches
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|b| b.changed.contains(&"keep.txt".to_string())),
                Duration::from_secs(5)
            ),
            "expected keep.txt reported"
        );
        let all = batches.lock().unwrap();
        for batch in all.iter() {
            assert!(
                !batch.changed.iter().any(|p| p.contains(".adl-logs")
                    || p.starts_with("target/")
                    || p.ends_with("debug-logs.txt")),
                "ignored paths must not be reported: {:?}",
                batch.changed
            );
        }
        drop(all);
        watcher.stop();
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn watcher_rejects_missing_root() {
        let missing = std::env::temp_dir().join("workspace-watch-missing-root-does-not-exist");
        let result = WorkspaceWatcher::start(&missing, Arc::new(|_| {}));
        assert!(result.is_err(), "watching a missing root must fail, not panic");
    }
}
