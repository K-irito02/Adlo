use adl_errors::AppError;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

/// 总量预算：changed＋removed 合计超出即置 `overflow` 并**丢弃载荷**，
/// 由前端退化为整轮重搜（前端 overflow 路径本就丢弃载荷，见 searchActions）。
const MAX_BATCH_PATHS: usize = 500;
/// 输入 channel 容量：满即视为溢出（置位，由下一次 flush 以 overflow 批次上报）。
const RAW_EVENT_CHANNEL_CAP: usize = 4096;
/// 默认去抖窗口（决策：后端去抖，避免事件风暴穿透 IPC）。
const DEFAULT_DEBOUNCE: Duration = Duration::from_millis(400);

/// watcher 额外忽略的**应用自身写入**目录（在 `tree::ignored_dirs()` 之上）：
/// 不排除会形成"应用写日志 → 事件 → 重算 → 再写日志"的自触发循环。
const EXTRA_IGNORED_DIRS: &[&str] = &[".adl-logs", "logs", "test-artifacts", ".adl-cache"];
/// 额外忽略的精确文件名（大小写不敏感）。
const EXTRA_IGNORED_FILENAMES: &[&str] = &["debug-logs.txt", "debug-logs-browser.txt"];
/// 额外忽略的文件名后缀（大小写不敏感）。
const EXTRA_IGNORED_SUFFIXES: &[&str] = &[".tmp", ".ds_store"];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
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
        relative.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if EXTRA_IGNORED_FILENAMES.contains(&file_name.as_str()) {
        return true;
    }
    EXTRA_IGNORED_SUFFIXES.iter().any(|suffix| file_name.ends_with(suffix))
}

/// 批次路径过滤器：相对路径 → 发出路径（None = 丢弃该事件）。
type PathFilter = Arc<dyn Fn(&str) -> Option<String> + Send + Sync>;

/// git 元数据白名单（gitdir/commondir 内相对路径，正斜杠，小写比较）：
/// 合法则返回合成路径 `.git/<rel>`；其余（含 objects/**、hooks/**、info/**）返回 None。
/// 前端按 `.git/` 前缀识别 git 批次：无 overflow 时只静默刷新 git 快照；
/// overflow 批次无法归因，按整轮重扫 + 选中 reconcile 处理（契约既定）。
pub(crate) fn normalize_git_meta(relative: &str) -> Option<String> {
    const TOP_FILES: &[&str] = &[
        "head",
        "index",
        "packed-refs",
        "fetch_head",
        "orig_head",
        "merge_head",
        "cherry_pick_head",
        "revert_head",
        "rebase_head",
        "merge_msg",
        "squash_msg",
        "auto_merge",
    ];
    const PREFIXES: &[&str] = &["refs/", "logs/", "rebase-merge/", "rebase-apply/"];

    let joined = relative.split('/').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("/");
    if joined.is_empty() {
        return None;
    }
    let lowered = joined.to_lowercase();
    if !joined.contains('/') && TOP_FILES.contains(&lowered.as_str()) {
        return Some(format!(".git/{joined}"));
    }
    if PREFIXES.iter().any(|prefix| lowered.starts_with(prefix)) {
        return Some(format!(".git/{joined}"));
    }
    None
}

/// 解析工作区根下的 git 元数据目录：
/// - `.git` 是目录（普通仓库/主工作树）→ `[root/.git]`
/// - `.git` 是文件（linked worktree/子模块）→ 解析 `gitdir: <path>` 指针（相对路径按根解析），
///   再读 gitdir 内 `commondir` 文件（相对路径按 gitdir 解析）得到共享 commondir；
///   返回 `[gitdir, commondir]` 去重
/// - 非仓库 / 读取失败 → 空
///
/// 词法归一化：折叠 `.` / `..` 组件（不解析符号链接、不引入 `\\?\` 前缀）。
/// git 指针里常出现 `gitdir: ../foo`、`commondir: ../..` 这类相对路径，
/// 交给 watch 之前必须消掉 `..`，否则比较去重与 notify 注册都不稳。
fn normalize_lexically(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {},
            Component::Prefix(prefix) => out.push(prefix.as_os_str()),
            Component::RootDir => out.push(std::path::MAIN_SEPARATOR_STR),
            Component::ParentDir => {
                out.pop();
            },
            Component::Normal(part) => out.push(part),
        }
    }
    out
}

pub fn resolve_git_dirs(root: &Path) -> Vec<PathBuf> {
    let dot_git = root.join(".git");
    if dot_git.is_dir() {
        return vec![dot_git];
    }
    let content = match std::fs::read_to_string(&dot_git) {
        Ok(content) => content,
        Err(_) => return Vec::new(),
    };
    let gitdir_raw = content
        .lines()
        .find_map(|line| line.trim().strip_prefix("gitdir:").map(str::trim))
        .filter(|line| !line.is_empty())
        .map(PathBuf::from);
    let Some(gitdir_raw) = gitdir_raw else {
        return Vec::new();
    };
    let gitdir = normalize_lexically(&if gitdir_raw.is_absolute() {
        gitdir_raw
    } else {
        root.join(gitdir_raw)
    });
    let mut dirs = vec![gitdir.clone()];
    if let Ok(pointer) = std::fs::read_to_string(gitdir.join("commondir")) {
        let pointer = pointer.trim();
        if !pointer.is_empty() {
            let common = PathBuf::from(pointer);
            let common = normalize_lexically(&if common.is_absolute() {
                common
            } else {
                gitdir.join(common)
            });
            if !dirs.contains(&common) {
                dirs.push(common);
            }
        }
    }
    dirs
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
        let filter: PathFilter = Arc::new(|relative: &str| {
            (!is_ignored_path(Path::new(relative))).then(|| relative.to_string())
        });
        Self::start_with_debounce(root, on_batch, DEFAULT_DEBOUNCE, filter)
    }

    /// 启动 git 元数据监听：只放行 `normalize_git_meta` 白名单，路径合成
    /// `.git/<rel>` 进入同一批次契约（调用方负责把 batch 打上工作区根 tag）。
    pub fn start_git_meta(
        git_root: &Path,
        on_batch: Arc<dyn Fn(FilesChangedBatch) + Send + Sync>,
    ) -> Result<Self, AppError> {
        let filter: PathFilter = Arc::new(normalize_git_meta);
        Self::start_with_debounce(git_root, on_batch, DEFAULT_DEBOUNCE, filter)
    }

    /// 测试专用：允许指定去抖窗口（`#[cfg(test)]` 之外不可见，避免生产误用）。
    #[cfg(test)]
    pub(crate) fn start_for_test(
        root: &Path,
        on_batch: Arc<dyn Fn(FilesChangedBatch) + Send + Sync>,
        debounce: Duration,
    ) -> Result<Self, AppError> {
        let filter: PathFilter = Arc::new(|relative: &str| {
            (!is_ignored_path(Path::new(relative))).then(|| relative.to_string())
        });
        Self::start_with_debounce(root, on_batch, debounce, filter)
    }

    /// 测试专用：git 元数据监听 + 自定义去抖窗口。
    #[cfg(test)]
    pub(crate) fn start_git_meta_for_test(
        git_root: &Path,
        on_batch: Arc<dyn Fn(FilesChangedBatch) + Send + Sync>,
        debounce: Duration,
    ) -> Result<Self, AppError> {
        let filter: PathFilter = Arc::new(normalize_git_meta);
        Self::start_with_debounce(git_root, on_batch, debounce, filter)
    }

    fn start_with_debounce(
        root: &Path,
        on_batch: Arc<dyn Fn(FilesChangedBatch) + Send + Sync>,
        debounce: Duration,
        filter: PathFilter,
    ) -> Result<Self, AppError> {
        if !root.is_dir() {
            return Err(AppError::NotFound(format!("watch root: {}", root.display())));
        }
        // 有界输入 channel：事件风暴下行满即记溢出，不让原始事件无界堆内存。
        let (raw_tx, raw_rx) = mpsc::sync_channel::<notify::Result<Event>>(RAW_EVENT_CHANNEL_CAP);
        let input_overflow = Arc::new(AtomicBool::new(false));
        let input_overflow_producer = input_overflow.clone();
        let mut watcher = notify::recommended_watcher(move |event| {
            if raw_tx.try_send(event).is_err() {
                input_overflow_producer.store(true, Ordering::Relaxed);
            }
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
                            let Some(mapped) = filter(&relative) else {
                                continue;
                            };
                            if is_remove && !path.exists() {
                                removed.insert(mapped.clone());
                                changed.remove(&mapped);
                            } else {
                                removed.remove(&mapped);
                                changed.insert(mapped);
                            }
                        }
                    },
                    Ok(Err(err)) => {
                        tracing::warn!(error = %err, "workspace watcher reported an error");
                    },
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        if changed.is_empty() && removed.is_empty() {
                            // 输入溢出但集合为空（事件在入队前被丢弃）：仍需上报，
                            // 否则消费端永远收不到 overflow 而静默丢更新。
                            if input_overflow.swap(false, Ordering::Relaxed) {
                                emit_batch(
                                    &on_batch,
                                    FilesChangedBatch { overflow: true, ..Default::default() },
                                );
                            }
                            continue;
                        }
                        // 总量超预算即 overflow：载荷置空，前端整轮重搜覆盖，
                        // 不传递截断后的残缺增量（避免双算与 IPC 浪费）。
                        let overflow = changed.len() + removed.len() > MAX_BATCH_PATHS
                            || input_overflow.swap(false, Ordering::Relaxed);
                        let batch = if overflow {
                            changed.clear();
                            removed.clear();
                            FilesChangedBatch { overflow: true, ..Default::default() }
                        } else {
                            FilesChangedBatch {
                                changed: std::mem::take(&mut changed).into_iter().collect(),
                                removed: std::mem::take(&mut removed).into_iter().collect(),
                                overflow: false,
                            }
                        };
                        emit_batch(&on_batch, batch);
                    },
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        Ok(Self { _watcher: watcher, worker: Some(worker) })
    }

    /// 停止监听（drop watcher 会关闭 notify 通道，工作线程随 `Disconnected` 退出）。
    ///
    /// 约束：`worker.join()` 会阻塞当前线程，禁止在 tokio async 上下文中直接调用，
    /// 应在 `spawn_blocking` 或后台线程中 stop。
    pub fn stop(mut self) {
        drop(self._watcher);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

/// 在 worker 线程调用批次回调：回调 panic 不得杀死监听线程，
/// 记 error 后继续下一批（回调必须永不 panic 是契约，兜底防静默失效）。
fn emit_batch(on_batch: &Arc<dyn Fn(FilesChangedBatch) + Send + Sync>, batch: FilesChangedBatch) {
    if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| on_batch(batch))).is_err() {
        tracing::error!("workspace watcher batch callback panicked; watcher continues");
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
    fn watcher_reports_bursty_writes() {
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

    #[test]
    fn watcher_survives_panicking_callback() {
        let tmp = unique_tmp_dir();
        let batches: Arc<Mutex<Vec<FilesChangedBatch>>> = Arc::new(Mutex::new(vec![]));
        let sink = batches.clone();
        let calls = Arc::new(AtomicU64::new(0));
        let calls_producer = calls.clone();
        let watcher = WorkspaceWatcher::start_for_test(
            &tmp,
            Arc::new(move |batch: FilesChangedBatch| {
                // 首批直接 panic：监听线程不得死亡，后续批次仍须送达。
                if calls_producer.fetch_add(1, Ordering::SeqCst) == 0 {
                    panic!("boom");
                }
                sink.lock().unwrap().push(batch);
            }),
            Duration::from_millis(150),
        )
        .unwrap();

        std::fs::write(tmp.join("first.txt"), b"1").unwrap();
        assert!(
            wait_until(|| calls.load(Ordering::SeqCst) >= 1, Duration::from_secs(5)),
            "first batch must be attempted"
        );
        std::fs::write(tmp.join("second.txt"), b"2").unwrap();
        assert!(
            wait_until(
                || batches
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|b| b.changed.contains(&"second.txt".to_string())),
                Duration::from_secs(5)
            ),
            "watcher must survive the panic, got {:?}",
            batches.lock().unwrap()
        );
        watcher.stop();
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn normalize_git_meta_accepts_whitelisted_paths() {
        assert_eq!(normalize_git_meta("index").as_deref(), Some(".git/index"));
        assert_eq!(normalize_git_meta("HEAD").as_deref(), Some(".git/HEAD"));
        assert_eq!(normalize_git_meta("packed-refs").as_deref(), Some(".git/packed-refs"));
        assert_eq!(normalize_git_meta("refs/heads/main").as_deref(), Some(".git/refs/heads/main"));
        assert_eq!(normalize_git_meta("logs/HEAD").as_deref(), Some(".git/logs/HEAD"));
        assert_eq!(normalize_git_meta("rebase-merge/0").as_deref(), Some(".git/rebase-merge/0"));
        assert_eq!(
            normalize_git_meta("refs/remotes/origin/main").as_deref(),
            Some(".git/refs/remotes/origin/main")
        );
    }

    #[test]
    fn normalize_git_meta_rejects_noise_and_directories() {
        assert_eq!(normalize_git_meta("objects/pack/pack-1.idx"), None);
        assert_eq!(normalize_git_meta("hooks/pre-commit.sample"), None);
        assert_eq!(normalize_git_meta("info/refs"), None);
        assert_eq!(normalize_git_meta("worktrees/other/HEAD"), None);
        assert_eq!(normalize_git_meta("refs"), None);
        assert_eq!(normalize_git_meta("logs"), None);
        assert_eq!(normalize_git_meta("refs2/main"), None);
        assert_eq!(normalize_git_meta("commondir"), None);
        assert_eq!(normalize_git_meta(""), None);
    }

    #[test]
    fn resolve_git_dirs_plain_repo_returns_single_dir() {
        let tmp = unique_tmp_dir();
        std::fs::create_dir_all(tmp.join(".git/refs")).unwrap();
        let dirs = resolve_git_dirs(&tmp);
        assert_eq!(dirs, vec![tmp.join(".git")]);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn resolve_git_dirs_linked_worktree_resolves_gitdir_and_commondir() {
        let tmp = unique_tmp_dir();
        let root = tmp.join("worktree");
        let main = tmp.join("main");
        let gitdir = main.join(".git").join("worktrees").join("slot-x");
        std::fs::create_dir_all(&gitdir).unwrap();
        std::fs::create_dir_all(main.join(".git").join("refs")).unwrap();
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(gitdir.join("commondir"), "../..").unwrap();
        std::fs::write(root.join(".git"), format!("gitdir: {}\n", gitdir.display())).unwrap();

        let dirs = resolve_git_dirs(&root);
        assert_eq!(dirs.len(), 2, "expected gitdir + commondir, got {dirs:?}");
        assert_eq!(dirs[0], gitdir);
        let common = &dirs[1];
        assert!(common.ends_with(".git"), "commondir should end with .git: {common:?}");
        assert!(common.is_dir());
        assert_ne!(&dirs[0], common, "gitdir and commondir must stay distinct");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn resolve_git_dirs_non_repo_returns_empty() {
        let tmp = unique_tmp_dir();
        std::fs::create_dir_all(&tmp).unwrap();
        assert!(resolve_git_dirs(&tmp).is_empty());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn watcher_git_meta_reports_synthetic_prefix_and_ignores_objects() {
        let tmp = unique_tmp_dir();
        let git_dir = tmp.join(".git");
        std::fs::create_dir_all(git_dir.join("refs/heads")).unwrap();
        std::fs::create_dir_all(git_dir.join("objects/pack")).unwrap();
        let batches: Arc<Mutex<Vec<FilesChangedBatch>>> = Arc::new(Mutex::new(vec![]));
        let sink = batches.clone();
        let watcher = WorkspaceWatcher::start_git_meta_for_test(
            &git_dir,
            Arc::new(move |batch| sink.lock().unwrap().push(batch)),
            Duration::from_millis(150),
        )
        .unwrap();

        std::fs::write(git_dir.join("refs/heads").join("main"), b"sha").unwrap();
        std::fs::write(git_dir.join("index"), b"idx").unwrap();
        std::fs::write(git_dir.join("objects/pack").join("pack-1.idx"), b"pack").unwrap();

        assert!(
            wait_until(
                || batches
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|b| b.changed.contains(&".git/refs/heads/main".to_string())),
                Duration::from_secs(5)
            ),
            "expected a batch containing .git/refs/heads/main, got {:?}",
            batches.lock().unwrap()
        );
        std::thread::sleep(Duration::from_millis(400));
        let all: Vec<String> =
            batches.lock().unwrap().iter().flat_map(|b| b.changed.clone()).collect();
        assert!(all.contains(&".git/index".to_string()), "expected .git/index in {all:?}");
        assert!(
            !all.iter().any(|p| p.contains("objects")),
            "objects/** must be filtered out, got {all:?}"
        );
        watcher.stop();
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn watcher_ignores_adl_cache_writes() {
        let tmp = unique_tmp_dir();
        std::fs::create_dir_all(tmp.join(".adl-cache")).unwrap();
        let batches: Arc<Mutex<Vec<FilesChangedBatch>>> = Arc::new(Mutex::new(vec![]));
        let sink = batches.clone();
        let watcher = WorkspaceWatcher::start_for_test(
            &tmp,
            Arc::new(move |batch| sink.lock().unwrap().push(batch)),
            Duration::from_millis(150),
        )
        .unwrap();

        std::fs::write(tmp.join(".adl-cache").join("site-meta.json"), b"{}").unwrap();
        std::fs::write(tmp.join("real.txt"), b"real").unwrap();

        assert!(
            wait_until(
                || batches
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|b| b.changed.contains(&"real.txt".to_string())),
                Duration::from_secs(5)
            ),
            "expected real.txt reported"
        );
        // 给去抖窗口留足时间，确认 .adl-cache 写入永不出现。
        std::thread::sleep(Duration::from_millis(400));
        let all = batches.lock().unwrap();
        for batch in all.iter() {
            assert!(
                !batch.changed.iter().any(|p| p.contains(".adl-cache")),
                ".adl-cache writes must be ignored, got {:?}",
                batch.changed
            );
        }
        drop(all);
        watcher.stop();
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
