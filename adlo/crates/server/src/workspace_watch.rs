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
use adl_workspace::{FilesChangedBatch, WorkspaceWatcher, resolve_git_dirs};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
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
    /// 仅用于 debug 日志（watcher 停止时打印）：根条目是工作区根路径，
    /// git 元数据条目是 gitdir/commondir 的绝对路径。事件回传的 root tag 由
    /// 回调闭包独立捕获，并不读取本字段。
    root: String,
    watcher: WorkspaceWatcher,
    /// git 条目的目录创建时间指纹（std::fs::metadata().created()）；None = 文件系统
    /// 不支持 btime，回退到同路径字符串比对（不主动替换）。
    identity: Option<std::time::SystemTime>,
}

/// 目录创建时间指纹；文件系统不支持 btime 时返回 None（此时不做创建时间比对）。
fn dir_created_fingerprint(p: &Path) -> Option<std::time::SystemTime> {
    std::fs::metadata(p).and_then(|m| m.created()).ok()
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
        let stale: Vec<String> = self
            .entries
            .keys()
            .filter(|key| {
                if desired_keys.contains(*key) {
                    return false;
                }
                // git 元数据 watcher 的键形如 "{根key}\0git{N}"（NUL 作键域分隔，
                // 路径不可能含 NUL，故根键与子键互不匹配、含 '#' 的目录不会互吞）：
                // 父根仍在 desired 集合里、且余下段恰为 \0git + 数字时保留；
                // 父根停用或余下段不匹配都随父根淘汰。
                !desired_keys.iter().any(|root| {
                    key.len() > root.len()
                        && key.as_str().starts_with(root.as_str())
                        && key[root.len()..].strip_prefix("\u{0}git").is_some_and(|digits| {
                            !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit())
                        })
                })
            })
            .cloned()
            .collect();
        for key in stale {
            if let Some(entry) = self.entries.remove(&key) {
                tracing::debug!(root = %entry.root, "workspace watcher stopped");
                removed.push(entry.watcher);
            }
        }

        for (key, root) in desired {
            if !self.entries.contains_key(&key) {
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
                        self.entries.insert(
                            key.clone(),
                            WatchedRoot { root: root.clone(), watcher, identity: None },
                        );
                    },
                    Err(err) => {
                        // 降级：该工作区退回"靠焦点补刷"，不影响其它根。
                        tracing::warn!(error = %err, root = %root, "workspace watcher disabled");
                    },
                }
            }
            // git 元数据监听（gitdir + commondir，去重）：HEAD/index/refs/logs 变动时
            // 合成 `.git/<rel>` 路径、以工作区根打 tag 发出，前端按此静默刷新 git 快照
            // （commit/push/merge 等操作只动 `.git` 时根 watcher 收不到；
            // 切换分支若同时改写工作树，仍由根 watcher 上报）。
            // 与根 watcher 独立推进：根 watcher 已在册时也必须补齐 git watcher。
            let fresh_git: Vec<PathBuf> = resolve_git_dirs(Path::new(&root))
                .into_iter()
                .filter(|git_dir| git_dir.is_dir())
                .collect();
            // 布局漂移对账：`.git` 被删除重建、或目录 ↔ gitfile 布局互换后，旧登记的
            // git watcher 与磁盘实际布局不再一致（旧句柄盯着已消失的目录，事件静默丢失）。
            // 先淘汰不一致项（推入 removed，由调用方在锁外 stop()），再按新解析登记。
            // 同路径删除重建（.git 被 rm+init）：路径字符串不变；在支持 btime 的
            // 文件系统上目录创建时间会变化，比对 identity 指纹识别；
            // fingerprint 缺失（文件系统不支持 btime）时退回仅字符串比对。
            for (git_index, git_dir) in fresh_git.iter().enumerate() {
                let git_key = format!("{key}\u{0}git{git_index}");
                let fresh_root = git_dir.to_string_lossy().into_owned();
                let fresh_identity = dir_created_fingerprint(git_dir);
                let drifted = match self.entries.get(&git_key) {
                    Some(existing) => {
                        existing.root != fresh_root
                            || (existing.identity.is_some()
                                && fresh_identity.is_some()
                                && existing.identity != fresh_identity)
                    },
                    None => false,
                };
                if drifted {
                    if let Some(stale) = self.entries.remove(&git_key) {
                        tracing::debug!(root = %stale.root, "workspace git metadata watcher replaced (layout drift)");
                        removed.push(stale.watcher);
                    }
                }
            }
            // 新解析不再覆盖的 git 槽位：整体淘汰（如 linked worktree → plain repo，
            // 旧 `#git1` commondir 不再存在于新解析结果中）。
            let mut slot = fresh_git.len();
            while let Some(stale) = self.entries.remove(&format!("{key}\u{0}git{slot}")) {
                tracing::debug!(root = %stale.root, "workspace git metadata watcher dropped (layout drift)");
                removed.push(stale.watcher);
                slot += 1;
            }
            for (git_index, git_dir) in fresh_git.into_iter().enumerate() {
                let git_root = git_dir.to_string_lossy().into_owned();
                let git_key = format!("{key}\u{0}git{git_index}");
                if self.entries.contains_key(&git_key) {
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
                let git_identity = dir_created_fingerprint(Path::new(&git_root));
                match WorkspaceWatcher::start_git_meta(Path::new(&git_root), callback) {
                    Ok(watcher) => {
                        tracing::debug!(root = %git_root, "workspace git metadata watcher started");
                        self.entries.insert(
                            git_key,
                            WatchedRoot { root: git_root, watcher, identity: git_identity },
                        );
                    },
                    Err(err) => {
                        tracing::warn!(error = %err, root = %git_root, "workspace git metadata watcher disabled");
                    },
                }
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

    /// 仓库 fixture：`.git` 目录 + HEAD/index + refs/heads；返回（已存在）根目录。
    fn make_repo_fixture(tag: &str) -> std::path::PathBuf {
        let root = unique_dir(tag);
        let gitdir = root.join(".git");
        std::fs::create_dir_all(gitdir.join("refs/heads")).unwrap();
        std::fs::create_dir_all(gitdir.join("logs")).unwrap();
        std::fs::write(gitdir.join("HEAD"), b"ref: refs/heads/main").unwrap();
        std::fs::write(gitdir.join("index"), b"idx").unwrap();
        root
    }

    /// linked worktree fixture：主仓 + 关联工作树；返回（worktree 根, 主仓根）。
    fn make_linked_worktree_fixture(tag: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        let main = unique_dir(&format!("{tag}-main"));
        let main_git = main.join(".git");
        let gitdir = main_git.join("worktrees").join("wt");
        std::fs::create_dir_all(gitdir.join("logs")).unwrap();
        std::fs::create_dir_all(main_git.join("refs/heads")).unwrap();
        std::fs::write(gitdir.join("commondir"), b"../..").unwrap();
        let worktree = unique_dir(&format!("{tag}-wt"));
        std::fs::write(worktree.join(".git"), format!("gitdir: {}\n", gitdir.display())).unwrap();
        (worktree, main)
    }

    fn entry_keys(registry: &WorkspaceWatchers) -> Vec<String> {
        registry.entries.keys().cloned().collect()
    }

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

    #[test]
    fn sync_registers_git_meta_watcher_for_repo_root() {
        let repo = make_repo_fixture("gitsync");
        let repo_key = root_key(&repo.to_string_lossy());
        let bus = EventBus::default();
        let mut registry = WorkspaceWatchers::new();

        registry.sync(vec![repo.to_string_lossy().into_owned()], &bus);
        assert_eq!(registry.entries.len(), 2, "root watcher + git0 watcher");
        assert!(
            registry.entries.contains_key(&format!("{repo_key}\u{0}git0")),
            "repo root must register a git0 git-meta watcher, got {:?}",
            entry_keys(&registry)
        );

        // 幂等：同集合再 sync 不重复注册。
        registry.sync(vec![repo.to_string_lossy().into_owned()], &bus);
        assert_eq!(registry.entries.len(), 2);

        registry.stop_all();
        let _ = std::fs::remove_dir_all(&repo);
    }

    #[test]
    fn sync_drops_git_meta_watcher_with_its_parent_root() {
        let repo = make_repo_fixture("gitdrop");
        let repo_key = root_key(&repo.to_string_lossy());
        let bus = EventBus::default();
        let mut registry = WorkspaceWatchers::new();

        registry.sync(vec![repo.to_string_lossy().into_owned()], &bus);
        assert!(registry.entries.contains_key(&format!("{repo_key}\u{0}git0")));

        let removed = registry.sync(vec![], &bus);
        assert_eq!(removed.len(), 2, "root + git0 watcher both returned, got {}", removed.len());
        for watcher in removed {
            watcher.stop();
        }
        assert!(registry.entries.is_empty());

        let _ = std::fs::remove_dir_all(&repo);
    }

    #[test]
    fn sync_linked_worktree_registers_gitdir_and_commondir_then_drops_both() {
        let (worktree, main) = make_linked_worktree_fixture("linked");
        let wt_key = root_key(&worktree.to_string_lossy());
        let bus = EventBus::default();
        let mut registry = WorkspaceWatchers::new();

        registry.sync(vec![worktree.to_string_lossy().into_owned()], &bus);
        assert_eq!(registry.entries.len(), 3, "root + git0 (gitdir) + git1 (commondir)");
        assert!(
            registry.entries.contains_key(&format!("{wt_key}\u{0}git0")),
            "gitdir watcher missing: {:?}",
            entry_keys(&registry)
        );
        assert!(
            registry.entries.contains_key(&format!("{wt_key}\u{0}git1")),
            "commondir watcher missing: {:?}",
            entry_keys(&registry)
        );

        let removed = registry.sync(vec![], &bus);
        assert_eq!(removed.len(), 3);
        for watcher in removed {
            watcher.stop();
        }
        assert!(registry.entries.is_empty());

        let _ = std::fs::remove_dir_all(&worktree);
        let _ = std::fs::remove_dir_all(&main);
    }

    #[test]
    fn sync_replaces_git_watchers_when_layout_drifts() {
        // 回归（R2-F1）：`.git` 被删除重建（plain → linked worktree）后，旧 git
        // watcher 不得永久短路跳过；布局漂回 plain 时 git1 槽位必须被淘汰。
        let repo = make_repo_fixture("drift");
        let repo_str = repo.to_string_lossy().into_owned();
        let repo_key = root_key(&repo_str);
        let bus = EventBus::default();
        let mut registry = WorkspaceWatchers::new();

        registry.sync(vec![repo_str.clone()], &bus);
        assert!(registry.entries.contains_key(&format!("{repo_key}\u{0}git0")));
        assert_eq!(registry.entries.len(), 2);

        // plain → linked worktree：删 .git 目录，换成指针文件 + 主仓 layout
        std::fs::remove_dir_all(repo.join(".git")).unwrap();
        let main = unique_dir("drift-main");
        let gitdir = main.join(".git").join("worktrees").join("driftwt");
        std::fs::create_dir_all(gitdir.join("logs")).unwrap();
        std::fs::create_dir_all(main.join(".git").join("refs")).unwrap();
        std::fs::write(gitdir.join("commondir"), b"../..").unwrap();
        std::fs::write(repo.join(".git"), format!("gitdir: {}\n", gitdir.display())).unwrap();

        let removed = registry.sync(vec![repo_str.clone()], &bus);
        assert_eq!(removed.len(), 1, "stale #git0 watcher must be returned, got {}", removed.len());
        for watcher in removed {
            watcher.stop();
        }
        assert_eq!(registry.entries.len(), 3, "root + git0 (gitdir) + git1 (commondir)");
        assert!(registry.entries.contains_key(&format!("{repo_key}\u{0}git0")));
        assert!(registry.entries.contains_key(&format!("{repo_key}\u{0}git1")));

        // linked worktree → plain：git0 再次替换，git1 槽位淘汰
        std::fs::remove_file(repo.join(".git")).unwrap();
        std::fs::create_dir_all(repo.join(".git").join("refs")).unwrap();

        let removed = registry.sync(vec![repo_str.clone()], &bus);
        assert_eq!(removed.len(), 2, "git0 replacement + git1 drop, got {}", removed.len());
        for watcher in removed {
            watcher.stop();
        }
        assert_eq!(registry.entries.len(), 2, "root + git0 (plain) only");
        assert!(registry.entries.contains_key(&format!("{repo_key}\u{0}git0")));

        registry.stop_all();
        let _ = std::fs::remove_dir_all(&repo);
        let _ = std::fs::remove_dir_all(&main);
    }

    #[test]
    fn sync_replaces_git_watcher_when_git_dir_recreated_in_place() {
        // 回归（R2-F1）：`.git` 被 rm+init 重建，路径字符串不变；在支持 btime 的
        // 文件系统上目录创建时间会变化；identity 比对必须换掉旧 watcher。
        // btime 不可得时退级跳过。
        let repo = make_repo_fixture("recreate");
        let repo_str = repo.to_string_lossy().into_owned();
        let repo_key = root_key(&repo_str);
        let bus = EventBus::default();
        let mut registry = WorkspaceWatchers::new();
        registry.sync(vec![repo_str.clone()], &bus);
        if dir_created_fingerprint(&repo.join(".git")).is_none() {
            eprintln!("filesystem reports no btime; skipping in-place recreate assertion");
            registry.stop_all();
            let _ = std::fs::remove_dir_all(&repo);
            return;
        }
        assert!(registry.entries.contains_key(&format!("{repo_key}\u{0}git0")));

        std::thread::sleep(Duration::from_millis(20));
        std::fs::remove_dir_all(repo.join(".git")).unwrap();
        std::fs::create_dir_all(repo.join(".git").join("refs")).unwrap();

        let removed = registry.sync(vec![repo_str.clone()], &bus);
        assert_eq!(removed.len(), 1, "recreated git dir must be detected by identity drift");
        for watcher in removed {
            watcher.stop();
        }
        assert_eq!(registry.entries.len(), 2);

        registry.stop_all();
        let _ = std::fs::remove_dir_all(&repo);
    }

    #[test]
    fn sync_hash_parent_git_subwatcher_is_dropped_with_its_parent() {
        // 回归（R1-F2）：路径含 '#' 的前任工作区被移除后，其 git 子键
        // "{父key}\0git0" 不能被更短的 desired 前缀（如去掉 '#child'）误保留。
        let base = unique_dir("hashparent");
        let with_hash = base.join("wt#child");
        std::fs::create_dir_all(with_hash.join(".git")).unwrap();
        let prefix_root = base.join("wt");
        std::fs::create_dir_all(&prefix_root).unwrap();
        let bus = EventBus::default();
        let mut registry = WorkspaceWatchers::new();

        registry.sync(vec![with_hash.to_string_lossy().into_owned()], &bus);
        let with_hash_key = root_key(&with_hash.to_string_lossy());
        assert!(registry.entries.contains_key(&format!("{with_hash_key}\u{0}git0")));

        let removed = registry.sync(vec![prefix_root.to_string_lossy().into_owned()], &bus);
        assert!(
            !registry.entries.contains_key(&format!("{with_hash_key}\u{0}git0")),
            "git watcher of the removed '#'-parent must be dropped with it, got {:?}",
            entry_keys(&registry)
        );
        assert_eq!(registry.entries.len(), 1, "only the prefix root's watcher may remain");

        for watcher in removed {
            watcher.stop();
        }
        registry.stop_all();
        let _ = std::fs::remove_dir_all(&base);
    }
}
