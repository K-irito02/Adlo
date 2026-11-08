//! 多工作区文件监听注册表。
//!
//! 语义：当前活动工作区 + 侧栏里所有"已添加"的工作区各有一个递归 watcher（上限
//! [`MAX_WATCHED_ROOTS`]，超出按调用方给出的顺序截断）。每个 watcher 的批次带
//! 自己的根路径回传，前端据此只刷新受影响的工作区，而不是把所有批次都算到
//! 当前活动工作区头上。
//!
//! 生命周期：`sync` 是变更入口（打开工作区 / 从侧栏移除 / 清空当前工作区 / 进程启动）。
//! 被移除的 watcher 由调用方在**锁外** `stop()`（持锁 join 有死锁风险；调用方本身
//! 在 `spawn_blocking` 中执行，join 不占用 tokio worker）。

use adl_kernel::events::{AppEvent, EventBus};
use adl_workspace::{FilesChangedBatch, WorkspaceWatcher};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

/// 同时监听的根数量上限：每个根一个 OS watcher + 一个去抖线程。
/// 侧栏工作区通常个位数；上限只用于挡住异常数据造成的句柄膨胀（超出时告警）。
pub(crate) const MAX_WATCHED_ROOTS: usize = 32;

/// 根路径归一化：仅用于**比较/去重**，不作为回传值使用
/// （Windows 反斜杠与大小写差异会让前端匹配失败）。
/// 带盘符的 Windows 路径按 Windows 语义整体忽略大小写；POSIX 路径保持原样
/// （与前端 `workspacePathMatch.ts` 同口径）。
fn root_key(root: &str) -> String {
    let trimmed = root.trim().trim_end_matches(['\\', '/']);
    let without_verbatim = trimmed.strip_prefix(r"\\?\").unwrap_or(trimmed);
    let normalized = without_verbatim.replace('\\', "/");
    let has_drive = normalized.len() >= 2
        && normalized.as_bytes()[1] == b':'
        && normalized.as_bytes()[0].is_ascii_alphabetic();
    if has_drive { normalized.to_lowercase() } else { normalized }
}

struct WatchedRoot {
    /// 调用方传入的原始字符串：事件回传与前端 `recentWorkspaces[].path` 同源。
    root: String,
    watcher: WorkspaceWatcher,
}

/// 根路径 → watcher 的注册表（Drop 时 watcher 自行停止：通道关闭，工作线程退出）。
#[derive(Default)]
pub(crate) struct WorkspaceWatchers {
    entries: HashMap<String, WatchedRoot>,
}

impl WorkspaceWatchers {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// 同步监听根集合：停止不在集合内的，启动新增的。
    ///
    /// 返回被移除的 watcher —— 调用方必须在释放锁之后逐个 `stop()`。
    /// 不存在的目录直接跳过（侧栏可能保留了已删除/暂时离线的路径）。
    pub(crate) fn sync(&mut self, roots: Vec<String>, bus: &EventBus) -> Vec<WorkspaceWatcher> {
        let mut desired: Vec<(String, String)> = Vec::new();
        let mut seen = std::collections::HashSet::new();
        let mut truncated = 0usize;
        for root in roots {
            let trimmed = root.trim();
            if trimmed.is_empty() {
                continue;
            }
            if !Path::new(trimmed).is_dir() {
                tracing::debug!(root = trimmed, "workspace watcher skipped: not a directory");
                continue;
            }
            let key = root_key(trimmed);
            if !seen.insert(key.clone()) {
                continue;
            }
            if desired.len() >= MAX_WATCHED_ROOTS {
                truncated += 1;
                continue;
            }
            desired.push((key, trimmed.to_string()));
        }
        if truncated > 0 {
            tracing::warn!(
                skipped = truncated,
                limit = MAX_WATCHED_ROOTS,
                "workspace watcher limit reached; extra workspaces fall back to focus refresh"
            );
        }

        let desired_keys: std::collections::HashSet<&String> =
            desired.iter().map(|(key, _)| key).collect();
        let mut removed = Vec::new();
        let stale: Vec<String> =
            self.entries.keys().filter(|key| !desired_keys.contains(*key)).cloned().collect();
        for key in stale {
            if let Some(entry) = self.entries.remove(&key) {
                tracing::debug!(root = %entry.root, "workspace watcher stopped");
                removed.push(entry.watcher);
            }
        }

        for (key, root) in desired {
            if self.entries.contains_key(&key) {
                continue;
            }
            let tag = root.clone();
            let bus = bus.clone();
            let callback = Arc::new(move |batch: FilesChangedBatch| {
                bus.emit(AppEvent::FilesChanged {
                    root_path: tag.clone(),
                    changed: batch.changed,
                    removed: batch.removed,
                    overflow: batch.overflow,
                });
            });
            match WorkspaceWatcher::start(Path::new(&root), callback) {
                Ok(watcher) => {
                    tracing::debug!(root = %root, "workspace watcher started");
                    self.entries.insert(key, WatchedRoot { root, watcher });
                },
                Err(err) => {
                    // 降级：该工作区退回"靠焦点补刷"，不影响其它根。
                    tracing::warn!(error = %err, root = %root, "workspace watcher disabled");
                },
            }
        }
        removed
    }

    /// 停止全部监听（仅测试清理；生产随进程退出释放）。
    #[cfg(test)]
    pub(crate) fn stop_all(&mut self) {
        let entries: Vec<WatchedRoot> = self.entries.drain().map(|(_, v)| v).collect();
        for entry in entries {
            entry.watcher.stop();
        }
    }

    /// 测试断言用：当前监听的根数量。
    #[cfg(test)]
    pub(crate) fn watcher_count(&self) -> usize {
        self.entries.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, Instant};

    static SEQ: AtomicU64 = AtomicU64::new(0);

    /// 目录名带进程号：并行测试进程（如 check:changed 与单测同时跑）不会互相
    /// 删掉对方的监听根，否则 watcher 会盯着已删除目录导致事件永不到达。
    fn unique_dir(tag: &str) -> std::path::PathBuf {
        let id = SEQ.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir()
            .join(format!("adl-workspace-watchers-{}-{tag}-{id}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 有界等待：`blocking_recv` 没有超时，事件缺失时会永久挂起测试；
    /// 用 `try_recv` + 短睡眠轮询，保证最坏情况在 `deadline` 内返回。
    ///
    /// 注意：匹配用「收集集合」而不是「逐根等待」——逐根等待会把先到的另一根
    /// 批次当作噪音丢弃，导致后一根等不到（事件到达顺序无保证）。
    fn collect_batch_roots(
        rx: &mut tokio::sync::broadcast::Receiver<AppEvent>,
        expected: &[&str],
        deadline: Duration,
    ) -> Vec<String> {
        let expected_keys: Vec<String> = expected.iter().map(|root| root_key(root)).collect();
        let mut seen: Vec<String> = Vec::new();
        let started = Instant::now();
        while started.elapsed() < deadline && seen.len() < expected_keys.len() {
            loop {
                match rx.try_recv() {
                    Ok(AppEvent::FilesChanged { root_path, .. }) => {
                        let key = root_key(&root_path);
                        if expected_keys.contains(&key) && !seen.contains(&key) {
                            seen.push(key);
                        }
                    },
                    Ok(_) => continue,
                    Err(tokio::sync::broadcast::error::TryRecvError::Empty) => break,
                    Err(_) => return seen,
                }
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        seen
    }

    #[test]
    fn sync_watches_every_root_and_tags_batches() {
        let a = unique_dir("a");
        let b = unique_dir("b");
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        let mut registry = WorkspaceWatchers::new();

        let removed = registry
            .sync(vec![a.to_string_lossy().to_string(), b.to_string_lossy().to_string()], &bus);
        assert!(removed.is_empty());
        assert_eq!(registry.entries.len(), 2);

        // 给 Windows watcher 一点挂载时间，避免写入发生在 ReadDirectoryChangesW
        // 正式生效之前（测试环境的确定性，不是生产路径）。
        std::thread::sleep(Duration::from_millis(100));
        std::fs::write(a.join("only-a.txt"), "a").unwrap();
        std::fs::write(b.join("only-b.txt"), "b").unwrap();

        let seen = collect_batch_roots(
            &mut rx,
            &[&a.to_string_lossy(), &b.to_string_lossy()],
            Duration::from_secs(10),
        );
        assert_eq!(seen.len(), 2, "both roots must emit their own tagged batch (got {seen:?})");

        registry.stop_all();
        let _ = std::fs::remove_dir_all(&a);
        let _ = std::fs::remove_dir_all(&b);
    }

    #[test]
    fn sync_drops_removed_roots_and_is_idempotent() {
        let a = unique_dir("keep");
        let b = unique_dir("drop");
        let bus = EventBus::default();
        let mut registry = WorkspaceWatchers::new();

        registry.sync(vec![a.to_string_lossy().to_string(), b.to_string_lossy().to_string()], &bus);
        assert_eq!(registry.entries.len(), 2);

        let removed = registry.sync(vec![a.to_string_lossy().to_string()], &bus);
        assert_eq!(removed.len(), 1, "only the dropped root's watcher is returned");
        for watcher in removed {
            watcher.stop();
        }
        assert_eq!(registry.entries.len(), 1);

        // 同一集合再次 sync 不产生新 watcher / 不移除任何 watcher。
        assert!(registry.sync(vec![a.to_string_lossy().to_string()], &bus).is_empty());
        assert_eq!(registry.entries.len(), 1);

        registry.stop_all();
        let _ = std::fs::remove_dir_all(&a);
        let _ = std::fs::remove_dir_all(&b);
    }

    #[test]
    fn root_key_collapses_separators_and_drive_case() {
        // 同一目录的不同写法必须归一到同一个 key（否则会开两个 watcher）。
        assert_eq!(root_key("C:\\Repo\\"), root_key("c:/repo"));
        assert_eq!(root_key(r"\\?\C:\Repo"), root_key("c:/repo"));
        assert_eq!(root_key("E:/a//"), "e:/a");
        // POSIX 路径保持大小写（大小写敏感文件系统上是两个不同根）。
        assert_ne!(root_key("/w/Repo"), root_key("/w/repo"));
    }

    #[test]
    fn sync_truncates_at_the_limit() {
        let dirs: Vec<std::path::PathBuf> =
            (0..=MAX_WATCHED_ROOTS).map(|i| unique_dir(&format!("cap-{i}"))).collect();
        let bus = EventBus::default();
        let mut registry = WorkspaceWatchers::new();

        registry.sync(dirs.iter().map(|d| d.to_string_lossy().to_string()).collect(), &bus);

        assert_eq!(registry.entries.len(), MAX_WATCHED_ROOTS);
        registry.stop_all();
        for dir in dirs {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn missing_roots_are_skipped_and_duplicates_collapse() {
        let a = unique_dir("dup");
        let bus = EventBus::default();
        let mut registry = WorkspaceWatchers::new();
        let missing = a.join("does-not-exist");

        registry.sync(
            vec![
                a.to_string_lossy().to_string(),
                a.to_string_lossy().replace('/', "\\"),
                missing.to_string_lossy().to_string(),
            ],
            &bus,
        );

        assert_eq!(registry.entries.len(), 1, "missing root skipped, duplicate collapsed");
        registry.stop_all();
        let _ = std::fs::remove_dir_all(&a);
    }
}
