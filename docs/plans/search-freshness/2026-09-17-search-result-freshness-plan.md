# 检索结果新鲜度根治 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"检索文件"面板的命中始终与磁盘一致（文件变更后自动重算受影响文件），且点击任意命中永不落空——能定位就精确（含重定位），内容已不存在则明确标记「已失效」。

**Architecture:** 方案甲 —— adl-server 内新增工作区文件 watcher（`notify` 递归 + 忽略剪枝 + 400ms 去抖），只做"忠实事件源"；经新增 WebSocket 端点 `/ws/workspace`（沿用 `/pty` 先例）推送 `{changed[], removed[]}` 批次；前端持检索会话快照，收到批次后用**新增的批量接口** `POST /workspace/search-in-files` 只重算变更文件的命中，并在点击时用 live 内容校验/重定位。文件面板与变更面板共用同一套跳转/校验能力（`features/preview/revealSourceLine.ts`）。

**Tech Stack:** Rust（notify 7 / tokio / axum / serde）、React 19 + TypeScript + Zustand、vitest、`pnpm`、CodeMirror 6、markdown-it。

**Spec:** `docs/specs/search-freshness/2026-09-17-search-result-freshness-design-zh-cn.md`

## Global Constraints

- 新 IPC / 事件必须在四端同步实现：`tauri-bridge`（继承 httpBridge）、`httpBridge`、`preview-bridge`、`mock-bridge`，并在 `frontend/src/shared/ipc/workspace.ts` 登记 `@command` / `@see` 注释。
- 所有 UI 文案走 i18n（`frontend/src/app/i18n/{zh-CN,en-US}/file.ts` 成对新增），禁止硬编码文本。
- 忽略目录复用 `crates/workspace/src/tree.rs` 的 `ignored_dirs()`（单一真源），watcher 额外忽略 `.adl-logs`、`logs`、`test-artifacts` 与 `debug-logs*.txt`、`*.tmp`、`.DS_Store`。
- 不新增数据兼容/迁移代码；不做 `docx/pdf/binary` 的行跳转（其预览为无行号占位页）。
- Rust 质量门槛：`cargo clippy --workspace --all-targets -- -D warnings` 与 `cargo fmt --check` 必须零告警。
- 前端质量门槛：`pnpm --dir frontend run lint` 与 `npx tsc --noEmit` 零错误。
- 测试分级执行：只跑受影响 crate / 测试文件，不跑全量。
- 行揭示永不抛 `RangeError`（越界一律钳制或标记失效）。
- 提交信息用 Conventional Commit（`feat(scope): …` / `test(scope): …` / `refactor(scope): …`）。

---

### Task 1: Rust — `search_in_files` 按文件批量搜索

**Files:**
- Modify: `ai-digital-life/crates/workspace/src/search.rs`（新增函数 + 测试）
- Modify: `ai-digital-life/crates/workspace/src/lib.rs:24`（re-export）

**Interfaces:**
- Consumes: `crate::tree::relative_path(root, file)`（既有）、`search_text_in_files(files, root, query, is_cancelled)`（本模块私有，既有）
- Produces: `pub fn search_in_files(root: &Path, relative_paths: &[String], query: &str) -> Result<Vec<WorkspaceSearchHit>, AppError>`，供 Task 4 的 handler 调用

- [ ] **Step 1: 写失败测试**

在 `crates/workspace/src/search.rs` 末尾追加：

```rust
#[cfg(test)]
mod search_in_files_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SIF_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir() -> std::path::PathBuf {
        let id = SIF_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("search-in-files-test-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    #[test]
    fn search_in_files_only_scans_given_paths() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("hit.txt"), b"alpha needle\nbeta").unwrap();
        std::fs::write(tmp.join("miss.txt"), b"needle in other file").unwrap();

        let hits = search_in_files(&tmp, &["hit.txt".to_string()], "needle").unwrap();

        assert_eq!(hits.len(), 1, "only the requested file must be scanned");
        assert_eq!(hits[0].path, "hit.txt");
        assert_eq!(hits[0].line, 1);
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_missing_path_is_skipped() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("a.txt"), b"needle").unwrap();

        let hits = search_in_files(&tmp, &["nope.txt".to_string(), "a.txt".to_string()], "needle")
            .unwrap();

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "a.txt");
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_matches_search_text_semantics() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("b.txt"), b"NEEDLE\nNeedle\nnone").unwrap();

        let batched = search_in_files(&tmp, &["b.txt".to_string()], "needle").unwrap();
        let whole = search_text(&tmp, "needle").unwrap();

        assert_eq!(batched.len(), 2, "case-insensitive contains (same as search_text)");
        assert_eq!(batched, whole, "batch and whole-workspace search must agree");
        cleanup(&tmp);
    }

    #[test]
    fn search_in_files_empty_query_returns_empty() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("c.txt"), b"anything").unwrap();
        assert!(search_in_files(&tmp, &["c.txt".to_string()], "   ").unwrap().is_empty());
        cleanup(&tmp);
    }

    fn cleanup(path: &std::path::Path) {
        let _ = std::fs::remove_dir_all(path);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-workspace search_in_files -- --nocapture`
Expected: 编译失败 `cannot find function search_in_files`

- [ ] **Step 3: 实现**

在 `crates/workspace/src/search.rs` 的 `search_text` 之后插入：

```rust
/// 仅对给定工作区相对路径集合执行检索：语义（大小写不敏感 contains、行长截断、
/// 每文件上限）与 [`search_text`] 完全一致——两条路径必须复用同一实现，避免漂移。
/// 不存在的路径直接跳过（文件可能在检索后被删除/重命名）。
pub fn search_in_files(
    root: &Path,
    relative_paths: &[String],
    query: &str,
) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    if query.trim().is_empty() || relative_paths.is_empty() {
        return Ok(vec![]);
    }
    let files: Vec<PathBuf> = relative_paths
        .iter()
        .map(|relative| root.join(relative))
        .filter(|absolute| absolute.is_file())
        .collect();
    search_text_in_files(&files, root, query, &|| false)
}
```

在 `crates/workspace/src/lib.rs:24` 改为：

```rust
pub use search::{search_in_files, search_text, search_text_async};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-workspace search_in_files`
Expected: PASS（4 个测试）

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/workspace/src/search.rs ai-digital-life/crates/workspace/src/lib.rs
git commit -m "feat(workspace): add search_in_files for per-file hit recomputation"
```

---

### Task 2: Rust — 工作区文件 watcher（notify + 去抖 + 忽略剪枝）

**Files:**
- Modify: `ai-digital-life/crates/workspace/Cargo.toml`（新增 `notify.workspace = true`）
- Modify: `ai-digital-life/crates/workspace/src/tree.rs:137,551`（把 `ignored_dirs()` / `should_ignore()` 提升为 `pub(crate)`）
- Create: `ai-digital-life/crates/workspace/src/watch.rs`
- Modify: `ai-digital-life/crates/workspace/src/lib.rs`（`mod watch;` + `pub use watch::{FilesChangedBatch, WorkspaceWatcher};`）

**Interfaces:**
- Consumes: `crate::tree::ignored_dirs()`（Task 2 提升可见性）
- Produces:
  - `pub struct FilesChangedBatch { pub changed: Vec<String>, pub removed: Vec<String>, pub overflow: bool }`
  - `pub struct WorkspaceWatcher`，方法 `pub fn start(root: &Path, on_batch: Arc<dyn Fn(FilesChangedBatch) + Send + Sync>) -> Result<Self, AppError>`、`pub fn with_debounce(self, window: Duration) -> Self`、`pub fn stop(self)`（供 Task 4 engine 调用）

- [ ] **Step 1: 加依赖与可见性**

在 `crates/workspace/Cargo.toml` 的 `[dependencies]` 加一行（与 kernel 同版本源）：

```toml
notify.workspace = true
```

在 `crates/workspace/src/tree.rs`：把 `fn ignored_dirs()` 改为 `pub(crate) fn ignored_dirs()`，把 `fn should_ignore(name: &str)` 改为 `pub(crate) fn should_ignore(name: &str)`。

- [ ] **Step 2: 写失败测试**

创建 `crates/workspace/src/watch.rs`，内容先只放测试（实现留 Step 4）：

```rust
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
                || batches.lock().unwrap().iter().any(|b| b.removed.contains(&"gone.txt".to_string())),
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
                || batches.lock().unwrap().iter().any(|b| b.changed.contains(&"keep.txt".to_string())),
                Duration::from_secs(5)
            ),
            "expected keep.txt reported"
        );
        let all = batches.lock().unwrap();
        for batch in all.iter() {
            assert!(
                !batch.changed.iter().any(|p| p.contains(".adl-logs") || p.starts_with("target/") || p.ends_with("debug-logs.txt")),
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
```

测试通过 `start_for_test(root, sink, debounce)` 使用短去抖窗口（生产用 400ms 默认值）。

- [ ] **Step 3: 运行测试确认失败**

Run: `cargo test -p adl-workspace watch::`
Expected: 编译失败 `cannot find type WorkspaceWatcher`

- [ ] **Step 4: 实现**

在 `crates/workspace/src/watch.rs` 测试模块**之前**插入：

```rust
use adl_errors::AppError;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

/// 单批上限：超出即置 `overflow`，由前端退化为整轮重搜。
const MAX_BATCH_PATHS: usize = 500;
/// 默认去抖窗口（决策：后端去抖，避免事件风暴穿透 IPC）。
const DEFAULT_DEBOUNCE: Duration = Duration::from_millis(400);

/// watcher 额外忽略的**应用自身写入**目录（在 `tree::ignored_dirs()` 之上）：
/// 不排除会形成"应用写日志 → 事件 → 重算 → 再写日志"的自触发循环。
const EXTRA_IGNORED_DIRS: &[&str] = &[".adl-logs", "logs", "test-artifacts"];
/// 额外忽略的文件名后缀（含全名匹配项）。
const EXTRA_IGNORED_SUFFIXES: &[&str] = &["debug-logs.txt", "debug-logs-browser.txt", ".tmp", ".DS_Store"];

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
    let file_name = relative.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
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
                            EventKind::Remove(_) | EventKind::Modify(notify::event::ModifyKind::Name(_))
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
                        let mut changed_list: Vec<String> = changed.drain().collect();
                        let mut removed_list: Vec<String> = removed.drain().collect();
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
```

在 `crates/workspace/src/lib.rs` 加入：

```rust
mod watch;
pub use watch::{FilesChangedBatch, WorkspaceWatcher};
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test -p adl-workspace watch::`（若 notify 在 CI 上对临时目录较慢，允许重跑一次）
Expected: PASS（5 个测试）

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/crates/workspace/Cargo.toml ai-digital-life/crates/workspace/src/watch.rs ai-digital-life/crates/workspace/src/tree.rs ai-digital-life/crates/workspace/src/lib.rs
git commit -m "feat(workspace): add debounced workspace file watcher with ignore pruning"
```

---

### Task 3: Rust — `AppEvent::FilesChanged`

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/events.rs:30-106`
- Modify: `ai-digital-life/crates/kernel/src/events.rs`（tests 模块）

**Interfaces:**
- Produces: `AppEvent::FilesChanged { changed: Vec<String>, removed: Vec<String>, overflow: bool }`，`kind()` = `"workspace.files-changed"`，供 Task 4 的 WS 端点序列化

- [ ] **Step 1: 写失败测试**

在 `crates/kernel/src/events.rs` 的 `mod tests` 内追加：

```rust
    #[test]
    fn files_changed_event_kind_and_payload() {
        let event = AppEvent::FilesChanged {
            changed: vec!["a.txt".to_string()],
            removed: vec![],
            overflow: false,
        };
        assert_eq!(event.kind(), "workspace.files-changed");
        let json = event.to_json();
        assert_eq!(json["type"], "workspace.files-changed");
        assert_eq!(json["changed"][0], "a.txt");
        assert_eq!(json["removed"].as_array().unwrap().len(), 0);
        assert_eq!(json["overflow"], false);
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-kernel files_changed_event_kind_and_payload`
Expected: 编译失败 `no variant named FilesChanged`

- [ ] **Step 3: 实现**

在 `crates/kernel/src/events.rs` 的 `AppEvent` 枚举内、`ClipboardChanged(String)` 之前插入：

```rust
    /// 活动工作区内的文件批量变更（由 `adl-workspace` 的 watcher 产出，经 WS 推送）。
    FilesChanged {
        changed: Vec<String>,
        removed: Vec<String>,
        overflow: bool,
    },
```

在 `kind()` 的 match 内加入：

```rust
            Self::FilesChanged { .. } => "workspace.files-changed",
```

- [ ] **Step 4: 检查 `to_json` 覆盖**

阅读 `crates/kernel/src/events.rs:10-28` 的 `to_json`——其实现对 `kind()` 之外还需按变体补字段。若 `to_json` 采用按变体分支，加入：

```rust
            Self::FilesChanged { changed, removed, overflow } => {
                obj.insert("changed".into(), serde_json::json!(changed));
                obj.insert("removed".into(), serde_json::json!(removed));
                obj.insert("overflow".into(), serde_json::json!(overflow));
            },
```

（若 `to_json` 已用 `serde_json::to_value(self)` 泛化适配，则本步无需改动；以实际实现为准。）

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test -p adl-kernel events`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/crates/kernel/src/events.rs
git commit -m "feat(kernel): add FilesChanged app event"
```

---

### Task 4: Rust — 服务端 WS 推送端点 + `search-in-files` handler + watcher 生命周期
**Files:**
- Create: `ai-digital-life/crates/server/src/ws_workspace.rs`
- Modify: `ai-digital-life/crates/server/src/lib.rs`（`pub mod ws_workspace;`）
- Modify: `ai-digital-life/crates/server/src/router.rs:46,144`（两条路由）
- Modify: `ai-digital-life/crates/server/src/handlers/workspace.rs`（`search_in_files` handler + body 结构）
- Modify: `ai-digital-life/crates/server/src/state.rs`（新增 `workspace_watcher` 字段）
- Modify: `ai-digital-life/crates/server/src/engine.rs`（启动恢复 + 打开工作区时重建 watcher）

**Interfaces:**
- Consumes: `adl_workspace::{search_in_files, WorkspaceWatcher, FilesChangedBatch}`（Task 1/2）、`AppEvent::FilesChanged`（Task 3）
- Produces: `POST /workspace/search-in-files`；`GET /ws/workspace`（WS 文本帧 `{ kind: "files-changed", changed, removed, overflow }`）

- [ ] **Step 1: 写 handler 测试（TDD）**

在 `crates/server/tests/workspace_all.rs` 末尾追加（复用该文件既有的 `common::*` 测试基建）：

```rust
/// `/workspace/search-in-files` 只扫描请求中列出的文件（watcher 驱动的局部重算）。
#[tokio::test]
async fn search_in_files_scans_only_requested_paths() {
    let state = common::state("ws-sif").await;
    let ws = common::make_workspace("ws-sif-src"); // 内含 notes.txt: "hello adl-server\nsecond line"
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true, "open body: {body}");

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search-in-files",
        Some(serde_json::json!({ "paths": ["notes.txt"], "query": "hello" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "search-in-files body: {body}");
    let hits = body["data"].as_array().expect("hits");
    assert_eq!(hits.len(), 1, "hits: {hits:?}");
    assert_eq!(hits[0]["path"], "notes.txt");
    assert_eq!(hits[0]["line"], 1);

    // 未列出的文件不得出现在结果中
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search-in-files",
        Some(serde_json::json!({ "paths": ["package.json"], "query": "hello" })),
    )
    .await;
    assert_eq!(body["data"].as_array().unwrap().len(), 0);

    let _ = std::fs::remove_dir_all(ws);
}

/// 缺失 `query` 字段 → INVALID_INPUT（而不是 500）。
#[tokio::test]
async fn search_in_files_requires_query_string() {
    let state = common::state("ws-sif-bad").await;
    let ws = common::make_workspace("ws-sif-bad-src");
    let (_, _) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search-in-files",
        Some(serde_json::json!({ "paths": ["notes.txt"] })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT");

    let _ = std::fs::remove_dir_all(ws);
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-server search_in_files`
Expected: 404 / `ok:false`（路由尚未注册）

- [ ] **Step 3: 实现 handler**

在 `crates/server/src/handlers/workspace.rs` 的 `search` handler 之后插入：

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchFilesBody {
    paths: Vec<String>,
    query: serde_json::Value,
}

/// POST `/workspace/search-in-files` — 仅对给定相对路径集合重算命中（watcher 驱动的局部刷新）。
pub async fn search_in_files(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SearchFilesBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let query = match input.query.as_str() {
        Some(q) => q.to_string(),
        None => return ipc::to_response(Err(AppError::InvalidInput("query must be a string".into()))),
    };
    let root_path = match current_workspace(&state) {
        Ok(ws) => ws.root_path,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let paths = input.paths;
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let hits: Vec<WorkspaceSearchHit> =
            adl_workspace::search_in_files(PathBuf::from(root_path).as_path(), &paths, &query)?;
        Ok(serde_json::to_value(hits)?)
    })
    .await;
    ipc::to_response(result)
}
```

在 `crates/server/src/router.rs:46` 之后加：

```rust
        .route("/workspace/search-in-files", post(handlers::workspace::search_in_files))
```

- [ ] **Step 4: 实现 WS 端点**

创建 `crates/server/src/ws_workspace.rs`：

```rust
use crate::state::ServerState;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::mpsc;

/// GET `/ws/workspace` — 把 `AppEvent::FilesChanged` 作为 WS 文本帧推给订阅者。
/// 与 `/pty` 同构：单向推送、断线由客户端重连；`Lagged` 时以 `overflow: true` 通知
/// 前端退化为整轮重搜，而不是静默丢事件。
pub async fn ws_handler(
    State(state): State<ServerState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

async fn handle_socket(state: ServerState, socket: WebSocket) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let mut events = state.event_bus.subscribe();

    let forwarder = tokio::spawn(async move {
        loop {
            match events.recv().await {
                Ok(adl_kernel::events::AppEvent::FilesChanged { changed, removed, overflow }) => {
                    let frame = serde_json::json!({
                        "kind": "files-changed",
                        "changed": changed,
                        "removed": removed,
                        "overflow": overflow,
                    });
                    if tx.send(Message::Text(frame.to_string())).is_err() {
                        break;
                    }
                },
                Ok(_) => continue,
                Err(RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "workspace ws: event bus lagged; signaling overflow");
                    let frame = serde_json::json!({
                        "kind": "files-changed",
                        "changed": [],
                        "removed": [],
                        "overflow": true,
                    });
                    if tx.send(Message::Text(frame.to_string())).is_err() {
                        break;
                    }
                },
                Err(RecvError::Closed) => break,
            }
        }
    });

    let sender = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if sink.send(message).await.is_err() {
                break;
            }
        }
    });

    // 读取分支：客户端仅可能发送 close/ping；任何读取结束即整体收尾。
    while let Some(Ok(message)) = stream.next().await {
        if matches!(message, Message::Close(_)) {
            break;
        }
    }
    forwarder.abort();
    sender.abort();
}
```

在 `crates/server/src/lib.rs` 加 `pub mod ws_workspace;`，并在 `router.rs:144` 附近加路由：

```rust
        // Workspace event stream (file watcher push)
        .route("/ws/workspace", get(crate::ws_workspace::ws_handler))
```

- [ ] **Step 5: 接 watcher 生命周期**

在 `crates/server/src/state.rs` 的 `ServerState` 加字段：

```rust
    /// 活动工作区文件监听器（warn+降级：启动失败时保持 `None`，功能退化为无自动刷新）
    pub workspace_watcher: Arc<StdMutex<Option<adl_workspace::WorkspaceWatcher>>>,
```

并在其构造处（`state.rs` 与 `test_util.rs`）初始化为 `Arc::new(StdMutex::new(None))`。

在 `crates/server/src/engine.rs` 加辅助函数并调用：

```rust
/// 启动/重建活动工作区 watcher：把批次转成 `AppEvent::FilesChanged` 广播给 WS 订阅者。
/// 失败仅告警（降级为无自动刷新），不影响应用启动。
fn restart_workspace_watcher(state: &ServerState, root: &std::path::Path) {
    let mut slot = state.workspace_watcher.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(previous) = slot.take() {
        previous.stop();
    }
    let bus = state.event_bus.clone();
    let callback = std::sync::Arc::new(move |batch: adl_workspace::FilesChangedBatch| {
        bus.emit(adl_kernel::events::AppEvent::FilesChanged {
            changed: batch.changed,
            removed: batch.removed,
            overflow: batch.overflow,
        });
    });
    match adl_workspace::WorkspaceWatcher::start(root, callback) {
        Ok(watcher) => *slot = Some(watcher),
        Err(err) => tracing::warn!(error = %err, root = %root.display(), "workspace watcher disabled"),
    }
}
```

调用点：
- 启动恢复活动工作区之后（`engine.rs` 中 `restore_current_workspace` 成功的分支）：`if let Some(ws) = restored_current_workspace.as_ref() { restart_workspace_watcher(&state, Path::new(&ws.root_path)); }`
- `handlers/workspace.rs::open` 成功写入 `current_workspace` 之后：`restart_workspace_watcher(&state, Path::new(&meta.root_path));`
- `handlers/workspace.rs::clear_current`：取走并 `stop()`。

- [ ] **Step 6: 运行测试确认通过**

Run: `cargo test -p adl-server search_in_files && cargo clippy -p adl-server -p adl-workspace -p adl-kernel --all-targets -- -D warnings`
Expected: PASS 且 clippy 零告警

- [ ] **Step 7: 提交**

```bash
git add ai-digital-life/crates/server
git commit -m "feat(server): push workspace file-change batches over WS and add search-in-files handler"
```

---

### Task 5: 前端 — kernel 类型 + 四端桥 + WS 客户端

**Files:**
- Modify: `frontend/src/kernel/types-workspace-files.ts`（新增 `WorkspaceFilesChangedBatch`）
- Modify: `frontend/src/shared/ipc/workspace.ts`（声明 `searchInFiles` / `onFilesChanged`）
- Create: `frontend/src/shared/ipc/workspace-events-ws.ts`
- Modify: `frontend/src/httpBridge.ts`（实现两方法 + 注入 WS 客户端）
- Modify: `frontend/src/mock/mock-workspace.ts`
- Modify: `frontend/src/preview-bridge/preview-search.ts` 与 `frontend/src/preview-bridge/preview-events.ts`
- Test: `frontend/src/shared/ipc/__tests__/workspace-freshness-parity.test.ts`（新建）

**Interfaces:**
- Produces: `window.digitalLife.workspace.searchInFiles(paths, query)`、`workspace.onFilesChanged(listener) => () => void`
- Consumes: Task 4 的 HTTP 路由与 WS 端点

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/shared/ipc/__tests__/workspace-freshness-parity.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTauriBridge } from '../../../tauri-bridge/index';
import { createMockDigitalLifeBridge } from '../../../mock-bridge';
import { createPreviewBridge } from '../../../preview-bridge/index';

describe('workspace freshness IPC parity', () => {
  it('every bridge exposes searchInFiles and onFilesChanged', () => {
    const bridges = [
      createTauriBridge(vi.fn() as never),
      createMockDigitalLifeBridge(),
      createPreviewBridge({} as never),
    ];
    for (const bridge of bridges) {
      expect(typeof bridge.workspace.searchInFiles).toBe('function');
      expect(typeof bridge.workspace.onFilesChanged).toBe('function');
    }
  });

  it('onFilesChanged returns a synchronous unsubscribe', () => {
    const bridge = createMockDigitalLifeBridge();
    const unsubscribe = bridge.workspace.onFilesChanged(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- --run src/shared/ipc/__tests__/workspace-freshness-parity.test.ts`
Expected: FAIL（`searchInFiles is not a function`）

- [ ] **Step 3: 类型与接口声明**

`frontend/src/kernel/types-workspace-files.ts` 追加：

```ts
export interface WorkspaceFilesChangedBatch {
  /** 变更（新增/修改）文件的工作区相对路径 */
  changed: string[];
  /** 删除文件的工作区相对路径 */
  removed: string[];
  /** 单批超限：消费端应退化为整轮重搜 */
  overflow?: boolean;
}
```

`frontend/src/shared/ipc/workspace.ts` 在 `search` 之后加（含项目要求的注释登记）：

```ts
  /**
   * 仅对给定相对路径集合重算命中（文件 watcher 驱动的局部刷新）
   * @param paths 工作区相对路径数组
   * @param query 检索关键词
   * @returns 这些文件中的命中列表
   * @command workspace_search_in_files
   * @see tauri-bridge/index.ts（...http 继承）→ workspace.searchInFiles
   * @see mock-bridge.ts → workspace.searchInFiles
   * @see preview-bridge/index.ts → workspace.searchInFiles
   */
  searchInFiles: (paths: string[], query: string) => Promise<IpcResult<WorkspaceSearchHit[]>>;
  /**
   * 订阅活动工作区的文件批量变更（后端 watcher → WS / 预览模式轮询）
   * @param listener 接收批次（changed/removed/overflow）的回调
   * @returns 同步取消订阅函数
   * @see tauri-bridge/index.ts（...http 继承）→ workspace.onFilesChanged
   * @see mock-bridge.ts → workspace.onFilesChanged
   * @see preview-bridge/index.ts → workspace.onFilesChanged
   */
  onFilesChanged: (listener: (batch: WorkspaceFilesChangedBatch) => void) => () => void;
```

- [ ] **Step 4: WS 客户端**

创建 `frontend/src/shared/ipc/workspace-events-ws.ts`：

```ts
import type { WorkspaceFilesChangedBatch } from '@ai-digital-life/kernel';

/** 把 http(s) base URL 转成 `/ws/workspace` 的 WebSocket URL（与 `pty-ws.toWsUrl` 同构）。 */
export function toWorkspaceWsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) {
    return '/ws/workspace';
  }
  return `${base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws/workspace`;
}

export interface WorkspaceEventsClientOptions {
  /** 测试注入点：替换默认 WebSocket 构造。 */
  wsFactory?: (url: string) => WebSocket;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export interface WorkspaceEventsClient {
  onFilesChanged(listener: (batch: WorkspaceFilesChangedBatch) => void): () => void;
  dispose(): void;
}

const WS_CONNECTING = 0;
const WS_OPEN = 1;

/** 单例式 WS 客户端：只在存在订阅者时连接，断线指数退避重连。 */
export function createWorkspaceEventsClient(
  baseUrl = '',
  options: WorkspaceEventsClientOptions = {},
): WorkspaceEventsClient {
  const { wsFactory, reconnectDelayMs = 1000, maxReconnectDelayMs = 30_000 } = options;
  const listeners = new Set<(batch: WorkspaceFilesChangedBatch) => void>();
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = reconnectDelayMs;
  let disposed = false;

  const handleFrame = (raw: string) => {
    let frame: { kind?: string; changed?: string[]; removed?: string[]; overflow?: boolean };
    try {
      frame = JSON.parse(raw) as typeof frame;
    } catch {
      return;
    }
    if (frame.kind !== 'files-changed') {
      return;
    }
    const batch: WorkspaceFilesChangedBatch = {
      changed: frame.changed ?? [],
      removed: frame.removed ?? [],
      overflow: frame.overflow === true,
    };
    listeners.forEach((fn) => fn(batch));
  };

  const connect = () => {
    if (disposed || socket !== null || listeners.size === 0) {
      return;
    }
    const ws = (wsFactory ?? ((url: string) => new WebSocket(url)))(toWorkspaceWsUrl(baseUrl));
    socket = ws;
    ws.onopen = () => {
      reconnectDelay = reconnectDelayMs;
    };
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        handleFrame(event.data);
      }
    };
    ws.onclose = () => {
      if (socket !== ws) {
        return;
      }
      socket = null;
      if (!disposed && listeners.size > 0) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelayMs);
      }
    };
    ws.onerror = (event) => {
      console.warn('[workspace-events-ws] socket error', event);
    };
  };

  return {
    onFilesChanged(listener) {
      listeners.add(listener);
      connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && socket !== null && socket.readyState !== WS_CONNECTING && socket.readyState !== WS_OPEN) {
          socket.close();
        }
      };
    },
    dispose() {
      disposed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket !== null) {
        const ws = socket;
        socket = null;
        ws.onclose = null;
        ws.close();
      }
      listeners.clear();
    },
  };
}
```

- [ ] **Step 5: 四端实现**

`frontend/src/httpBridge.ts`：
- 在 `search:` 附近加 `searchInFiles: (paths: string[], query: string) => call<WorkspaceSearchHit[]>(baseUrl, '/workspace/search-in-files', POST({ paths, query })),`
- 在 options 上加 `workspaceEventsWsFactory?: (url: string) => WebSocket;`，并在工厂内部惰性创建 `const workspaceEvents = createWorkspaceEventsClient(baseUrl, { wsFactory: options.workspaceEventsWsFactory });`
- 替换 `onFileChanged` 下方的占位注释块，新增：
  ```ts
        onFilesChanged: (listener) => workspaceEvents.onFilesChanged(listener),
  ```

`frontend/src/mock/mock-workspace.ts`（沿用该文件既有的 `documents` / 匹配写法）：

```ts
  searchInFiles: async (paths: string[], query: string) => {
    const needle = query.toLowerCase();
    const hits: WorkspaceSearchHit[] = [];
    for (const filePath of paths) {
      const content = documents.get(filePath);
      if (content === undefined) {
        continue;
      }
      content.split(/\r?\n/).forEach((lineText, index) => {
        if (lineText.toLowerCase().includes(needle)) {
          hits.push({ path: filePath, line: index + 1, preview: lineText.trim() });
        }
      });
    }
    return { ok: true as const, data: hits };
  },
  onFilesChanged: () => () => {},
```

`frontend/src/preview-bridge/preview-search.ts`：加

```ts
    searchInFiles: async (paths: string[], query: string) => {
      if (!ctx.currentWorkspace) {
        return { ok: true as const, data: [] as WorkspaceSearchHit[] };
      }
      const params = new URLSearchParams({ rootPath: ctx.currentWorkspace.rootPath });
      return requestPreviewApi<WorkspaceSearchHit[]>(`/workspace/search-in-files?${params.toString()}`, {
        body: { paths, query },
      });
    },
```

`frontend/src/preview-bridge/preview-events.ts`：把 `onFilesChanged` 实现为轮询（2s，游标式），

```ts
    onFilesChanged: (listener: (batch: WorkspaceFilesChangedBatch) => void) => {
      let cursor = 0;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const poll = async () => {
        if (stopped) {
          return;
        }
        try {
          const params = new URLSearchParams({ since: String(cursor) });
          const result = await requestPreviewApi<{
            cursor: number;
            changed: string[];
            removed: string[];
            overflow?: boolean;
          }>(`/workspace/files-changed?${params.toString()}`);
          if (result.ok && !stopped) {
            cursor = result.data.cursor;
            if (result.data.changed.length > 0 || result.data.removed.length > 0 || result.data.overflow) {
              listener({
                changed: result.data.changed,
                removed: result.data.removed,
                overflow: result.data.overflow,
              });
            }
          }
        } catch (err) {
          console.warn('[preview-events] files-changed poll failed', err);
        }
        if (!stopped) {
          timer = setTimeout(poll, 2000);
        }
      };
      timer = setTimeout(poll, 2000);
      return () => {
        stopped = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      };
    },
```

- [ ] **Step 6: 运行 parity 测试**

Run: `pnpm --dir frontend run test -- --run src/shared/ipc/__tests__/workspace-freshness-parity.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/kernel frontend/src/shared/ipc frontend/src/httpBridge.ts frontend/src/mock frontend/src/preview-bridge
git commit -m "feat(ipc): add workspace.searchInFiles and onFilesChanged across four bridges"
```

---

### Task 6: 浏览器预览服务端 — `search-in-files` 与 `files-changed` 轮询端点

**Files:**
- Modify: `frontend/dev/previewWorkspaceService/index.ts`（注册两条路由）
- Create: `frontend/dev/previewWorkspaceService/workspaceWatcher.ts`（`fs.watch` + 去抖 + 游标环形缓冲）

**Interfaces:**
- Consumes: 既有 `search.searchText(rootPath, query)`、`files.*` 模块
- Produces: `GET /workspace/files-changed?since=<cursor>` → `{ cursor, changed[], removed[], overflow? }`；`POST /workspace/search-in-files?rootPath=` → `WorkspaceSearchHit[]`

- [ ] **Step 1: 写 watcher 模块与单测**

创建 `frontend/dev/previewWorkspaceService/workspaceWatcher.ts`：

```ts
import { watch, type FSWatcher } from 'node:fs';
import { relative, sep } from 'node:path';

export interface FilesChangedBatch {
  cursor: number;
  changed: string[];
  removed: string[];
  overflow?: boolean;
}

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
  '.next',
  '.cache',
  '__pycache__',
  '.venv',
  'vendor',
  'coverage',
  '.adl-logs',
  'logs',
  'test-artifacts',
]);
const IGNORED_SUFFIXES = ['debug-logs.txt', 'debug-logs-browser.txt', '.tmp', '.DS_Store'];
const DEBOUNCE_MS = 400;
const MAX_BATCH = 500;

function isIgnored(relativePath: string): boolean {
  const parts = relativePath.split('/');
  if (parts.some((part) => IGNORED_DIRS.has(part))) {
    return true;
  }
  const fileName = parts[parts.length - 1] ?? '';
  return IGNORED_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

/**
 * 预览模式（dev-only）的文件变更聚合器：`fs.watch` 递归 + 400ms 去抖，
 * 维护自增游标与批次列表，供前端轮询（Tauri 侧对应 Rust watcher + WS 推送）。
 */
export class WorkspaceWatcher {
  #watcher: FSWatcher | null = null;
  #cursor = 0;
  #batches: FilesChangedBatch[] = [];
  #pendingChanged = new Set<string>();
  #pendingRemoved = new Set<string>();
  #timer: NodeJS.Timeout | null = null;
  #root = '';

  start(root: string): void {
    this.stop();
    this.#root = root;
    this.#watcher = watch(root, { recursive: true }, (_eventType, fileName) => {
      if (!fileName) {
        return;
      }
      const relativePath = String(fileName).split(sep).join('/');
      if (isIgnored(relativePath)) {
        return;
      }
      this.#pendingChanged.add(relativePath);
      this.#schedule();
    });
    this.#watcher.on('error', (err) => {
      console.warn('[preview-watcher] disabled:', err);
      this.stop();
    });
  }

  stop(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#watcher?.close();
    this.#watcher = null;
    this.#pendingChanged.clear();
    this.#pendingRemoved.clear();
  }

  /** 拉取自 `since` 之后的批次；无新批次时返回空批与当前游标。 */
  since(since: number): FilesChangedBatch {
    const fresh = this.#batches.filter((batch) => batch.cursor > since);
    if (fresh.length === 0) {
      return { cursor: this.#cursor, changed: [], removed: [] };
    }
    const changed = new Set<string>();
    const removed = new Set<string>();
    let overflow = false;
    for (const batch of fresh) {
      batch.changed.forEach((p) => changed.add(p));
      batch.removed.forEach((p) => removed.add(p));
      overflow = overflow || batch.overflow === true;
    }
    return { cursor: this.#cursor, changed: [...changed], removed: [...removed], overflow };
  }

  removePath(relativePath: string): void {
    if (isIgnored(relativePath)) {
      return;
    }
    this.#pendingRemoved.add(relativePath);
    this.#pendingChanged.delete(relativePath);
    this.#schedule();
  }

  #schedule(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
    }
    this.#timer = setTimeout(() => {
      this.#timer = null;
      const changed = [...this.#pendingChanged];
      const removed = [...this.#pendingRemoved];
      this.#pendingChanged.clear();
      this.#pendingRemoved.clear();
      if (changed.length === 0 && removed.length === 0) {
        return;
      }
      this.#cursor += 1;
      this.#batches.push({
        cursor: this.#cursor,
        changed: changed.slice(0, MAX_BATCH),
        removed: removed.slice(0, MAX_BATCH),
        overflow: changed.length + removed.length > MAX_BATCH,
      });
      if (this.#batches.length > 200) {
        this.#batches = this.#batches.slice(-200);
      }
    }, DEBOUNCE_MS);
  }
}
```

在 `frontend/dev/previewWorkspaceService/workspaceWatcher.test.ts` 新建（node 环境）：

```ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceWatcher } from './workspaceWatcher';

describe('WorkspaceWatcher', () => {
  it('aggregates writes and ignores log noise', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-watch-'));
    const watcher = new WorkspaceWatcher();
    watcher.start(root);
    writeFileSync(join(root, 'debug-logs.txt'), 'noise');
    writeFileSync(join(root, 'kept.md'), 'content');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const batch = watcher.since(0);
    expect(batch.changed).toContain('kept.md');
    expect(batch.changed.some((p) => p.includes('debug-logs'))).toBe(false);
    watcher.stop();
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 运行确认通过（模块自测）**

Run: `pnpm --dir frontend run test -- --run dev/previewWorkspaceService/workspaceWatcher.test.ts`
Expected: PASS

- [ ] **Step 3: 注册两条路由**

在 `frontend/dev/previewWorkspaceService/index.ts` 的路由表加入（紧跟 `/workspace/search` 之后）：

```ts
  {
    method: 'POST', pathname: makePath('/workspace/search-in-files'),
    handler: async (_req, body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const input = body as { paths?: string[]; query?: string } | undefined;
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      if (!input || !Array.isArray(input.paths) || typeof input.query !== 'string') {
        return fail('paths and query are required', 'INVALID_INPUT');
      }
      return ok(await search.searchInFiles(rootPath, input.paths, input.query));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/files-changed'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const since = Number(searchParams.get('since') ?? '0');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      if (!Number.isFinite(since) || since < 0) return fail('since must be a non-negative number', 'INVALID_INPUT');
      return ok(workspaceWatchers.ensure(rootPath).since(since));
    },
  },
```

`frontend/dev/previewWorkspaceService/` 内新增一个按 rootPath 复用 watcher 的小注册表 `workspaceWatchers`（`ensure(rootPath)`：第一次调用时 `new WorkspaceWatcher().start(rootPath)` 并缓存；工作区未变化时复用），放在同文件或 `workspaceWatcher.ts` 末尾导出。

在 `frontend/dev/previewWorkspaceService/search.ts`（该模块已导出 `searchText`）追加：

```ts
export async function searchInFiles(
  rootPath: string,
  paths: string[],
  query: string,
): Promise<WorkspaceSearchHit[]> {
  const needle = query.toLowerCase();
  if (!needle.trim()) {
    return [];
  }
  const hits: WorkspaceSearchHit[] = [];
  for (const relativePath of paths) {
    const absolute = join(rootPath, relativePath);
    if (!existsSync(absolute)) {
      continue;
    }
    const content = await fs.readFile(absolute, 'utf8');
    content.split(/\r?\n/).forEach((lineText, index) => {
      if (lineText.toLowerCase().includes(needle)) {
        hits.push({ path: relativePath, line: index + 1, preview: lineText.trim().slice(0, 240) });
      }
    });
  }
  return hits;
}
```
（`join`/`existsSync` 从 `node:path`、`node:fs` 引入；`fs` 为既有 `node:fs/promises` 别名。`index.ts` 已 `import * as search from './search'` 且 `export * from './search'`，故 `search.searchInFiles(...)` 直接可用。）

在 `workspaceWatcher.ts` 末尾追加按 rootPath 复用的注册表：

```ts
const registry = new Map<string, WorkspaceWatcher>();

/** 每个工作区根一个 watcher（预览模式可能在多工作区间切换）。 */
export const workspaceWatchers = {
  ensure(rootPath: string): WorkspaceWatcher {
    const existing = registry.get(rootPath);
    if (existing) {
      return existing;
    }
    const watcher = new WorkspaceWatcher();
    watcher.start(rootPath);
    registry.set(rootPath, watcher);
    return watcher;
  },
  disposeAll(): void {
    registry.forEach((watcher) => watcher.stop());
    registry.clear();
  },
};
```

- [ ] **Step 4: 提交**

```bash
git add frontend/dev/previewWorkspaceService
git commit -m "feat(preview): add search-in-files and files-changed polling endpoints"
```

---

### Task 7: 前端 — store 会话模型 + 纯函数 reducer + 重算调度

**Files:**
- Modify: `frontend/src/app/stores/slices/searchSlice.ts`
- Modify: `frontend/src/app/stores/actions/searchActions.ts`
- Modify: `frontend/src/app/stores/actions/generalActions.ts:278-280`（重置字段）
- Test: `frontend/src/app/stores/slices/__tests__/searchSession.test.ts`（新建）

**Interfaces:**
- Produces（供 Task 8/9/10 消费）：
  - `SearchHitEntry { workspaceId, path, line, preview, stale? }`
  - `replaceFileHits(entries, path, hits) => SearchHitEntry[]`
  - `dropFileHits(entries, path) => SearchHitEntry[]`
  - `markHitsStale(entries, path, line?) => SearchHitEntry[]`
  - store 字段：`searchEntries: SearchHitEntry[]`、`searchSessionId: number`、`searchPartial: boolean`、`searchWorkspaceId: string | undefined`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/stores/slices/__tests__/searchSession.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { dropFileHits, markHitsStale, replaceFileHits, type SearchHitEntry } from '../searchSlice';

const hit = (path: string, line: number, stale = false): SearchHitEntry => ({
  workspaceId: 'ws-1',
  path,
  line,
  preview: `p${line}`,
  stale,
});

describe('search session reducers', () => {
  it('replaceFileHits swaps only the target file, keeping order', () => {
    const before = [hit('a.md', 1), hit('a.md', 9), hit('b.md', 3)];
    const after = replaceFileHits(before, 'a.md', [hit('a.md', 2)]);
    expect(after.map((h) => `${h.path}:${h.line}`)).toEqual(['b.md:3', 'a.md:2']);
  });

  it('replaceFileHits drops the file when recomputation yields no hits', () => {
    const after = replaceFileHits([hit('a.md', 1), hit('b.md', 3)], 'a.md', []);
    expect(after.map((h) => h.path)).toEqual(['b.md']);
  });

  it('dropFileHits removes every hit of a deleted file', () => {
    const after = dropFileHits([hit('a.md', 1), hit('b.md', 3)], 'a.md');
    expect(after.map((h) => h.path)).toEqual(['b.md']);
  });

  it('markHitsStale flags the whole file when no line given, and one line otherwise', () => {
    const all = markHitsStale([hit('a.md', 1), hit('a.md', 2)], 'a.md');
    expect(all.every((h) => h.stale)).toBe(true);
    const one = markHitsStale([hit('a.md', 1), hit('a.md', 2)], 'a.md', 2);
    expect(one.map((h) => h.stale)).toEqual([false, true]);
  });

  it('replaceFileHits clears stale flags for recomputed hits', () => {
    const after = replaceFileHits([hit('a.md', 1, true)], 'a.md', [hit('a.md', 5)]);
    expect(after[0].stale).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- --run src/app/stores/slices/__tests__/searchSession.test.ts`
Expected: FAIL（`replaceFileHits is not a function`）

- [ ] **Step 3: 实现 slice**

`frontend/src/app/stores/slices/searchSlice.ts` 重写为（保留 `searchQuery`/`searching`，`searchResults` 字段移除）：

```ts
import type { WorkspaceSearchHit } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface SearchHitEntry {
  /** 产生该命中的工作区（跨工作区同相对路径不会错配） */
  workspaceId: string;
  path: string;
  line: number;
  preview: string;
  /** 点击校验发现内容已不存在 */
  stale?: boolean;
}

export interface SearchSlice {
  searchQuery: string;
  searching: boolean;
  searchEntries: SearchHitEntry[];
  /** 会话标识：丢弃过期响应（新检索递增） */
  searchSessionId: number;
  /** 命中达到上限：面板提示"仅显示部分结果" */
  searchPartial: boolean;
  /** 本次检索发生时的活动工作区 */
  searchWorkspaceId: string | undefined;
  /** 检索选项（上提到 store：点击校验/重定位必须与检索时选项一致） */
  searchMatchCase: boolean;
  searchMatchWholeWord: boolean;
  searchUseRegex: boolean;

  setSearchQuery: (query: string) => void;
  setSearching: (searching: boolean) => void;
  setSearchEntries: (entries: SearchHitEntry[]) => void;
  setSearchPartial: (partial: boolean) => void;
  setSearchMatchCase: (value: boolean) => void;
  setSearchMatchWholeWord: (value: boolean) => void;
  setSearchUseRegex: (value: boolean) => void;
  beginSearchSession: (workspaceId: string | undefined) => number;
  clearSearch: () => void;
}

/** 用重算结果替换某文件的全部命中（0 条即删除该文件）。顺序：先删旧条目，再追加新条目。 */
export function replaceFileHits(
  entries: SearchHitEntry[],
  path: string,
  hits: SearchHitEntry[],
): SearchHitEntry[] {
  const kept = entries.filter((entry) => entry.path !== path);
  return [...kept, ...hits.map((hit) => ({ ...hit, stale: false }))];
}

export function dropFileHits(entries: SearchHitEntry[], path: string): SearchHitEntry[] {
  return entries.filter((entry) => entry.path !== path);
}

export function markHitsStale(
  entries: SearchHitEntry[],
  path: string,
  line?: number,
): SearchHitEntry[] {
  return entries.map((entry) =>
    entry.path === path && (line === undefined || entry.line === line)
      ? { ...entry, stale: true }
      : entry,
  );
}

export function toHitEntries(
  hits: WorkspaceSearchHit[],
  workspaceId: string,
): SearchHitEntry[] {
  return hits.map((hit) => ({ ...hit, workspaceId }));
}

export const createSearchSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): SearchSlice => ({
  searchQuery: '',
  searching: false,
  searchEntries: [],
  searchSessionId: 0,
  searchPartial: false,
  searchWorkspaceId: undefined,
  searchMatchCase: false,
  searchMatchWholeWord: false,
  searchUseRegex: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearching: (searching) => set({ searching }),
  setSearchEntries: (entries) => set({ searchEntries: entries }),
  setSearchPartial: (partial) => set({ searchPartial: partial }),
  setSearchMatchCase: (value) => set({ searchMatchCase: value }),
  setSearchMatchWholeWord: (value) => set({ searchMatchWholeWord: value }),
  setSearchUseRegex: (value) => set({ searchUseRegex: value }),
  beginSearchSession: (workspaceId) => {
    const nextId = _get().searchSessionId + 1;
    set({
      searchSessionId: nextId,
      searchWorkspaceId: workspaceId,
      searchEntries: [],
      searchPartial: false,
    });
    return nextId;
  },
  clearSearch: () =>
    set({ searchQuery: '', searchEntries: [], searching: false, searchPartial: false }),
});
```

- [ ] **Step 4: 实现 action（会话 + 打标 + 重算调度 + watcher 接线）**

`frontend/src/app/stores/actions/searchActions.ts` 改为：

```ts
import type { StoreState } from '../StoreState';
import { createDebouncedSearch } from '../shared';
import { captureError } from '../cacheHelpers';
import { markHitsStale, replaceFileHits, toHitEntries } from '../slices/searchSlice';
import type { WorkspaceFilesChangedBatch } from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
const SCOPE = 'search';

const debouncedSearch = createDebouncedSearch(300);
/** 前端合并窗口：后端 400ms 去抖之后再合并一层，吸收多路批次 */
const RECOMPUTE_DEBOUNCE_MS = 200;
const MAX_HITS = 200;

export function createSearchActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  let recomputeTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingChanged = new Set<string>();
  let pendingRemoved = new Set<string>();
  let pendingOverflow = false;

  const flushRecompute = async () => {
    const state = get();
    const query = state.searchQuery;
    if (!query.trim()) {
      return;
    }
    const activeWorkspaceId = state.searchWorkspaceId;
    const changed = [...pendingChanged].filter((path) =>
      state.searchEntries.some((entry) => entry.path === path && entry.workspaceId === activeWorkspaceId),
    );
    const removed = [...pendingRemoved];
    pendingChanged = new Set();
    pendingRemoved = new Set();
    pendingOverflow = false;

    if (removed.length > 0) {
      let next = state.searchEntries;
      for (const path of removed) {
        next = next.filter((entry) => !(entry.path === path && entry.workspaceId === activeWorkspaceId));
      }
      set({ searchEntries: next });
    }
    if (changed.length === 0) {
      return;
    }
    const result = await window.digitalLife.workspace.searchInFiles(changed, query);
    if (!result.ok) {
      captureError(get, result.error, SCOPE);
      return;
    }
    if (get().searchQuery !== query || get().searchSessionId !== state.searchSessionId) {
      return;
    }
    const grouped = new Map<string, typeof result.data>();
    for (const hit of result.data) {
      const list = grouped.get(hit.path);
      if (list) {
        list.push(hit);
      } else {
        grouped.set(hit.path, [hit]);
      }
    }
    let next = get().searchEntries;
    for (const path of changed) {
      next = replaceFileHits(next, path, toHitEntries(grouped.get(path) ?? [], activeWorkspaceId ?? ''));
    }
    set({ searchEntries: next });
    // 决策 6：文件变更后顺手刷新变更树与文件树（与命中重算同处一个节流窗口，只触发一次）
    void get().fetchGitStatus();
    void get().refreshAllWorkspaceTrees();
  };

  const scheduleRecompute = (batch: WorkspaceFilesChangedBatch) => {
    batch.changed.forEach((path) => pendingChanged.add(path));
    batch.removed.forEach((path) => pendingRemoved.add(path));
    pendingOverflow = pendingOverflow || batch.overflow === true;
    if (recomputeTimer !== undefined) {
      clearTimeout(recomputeTimer);
    }
    recomputeTimer = setTimeout(() => {
      recomputeTimer = undefined;
      if (pendingOverflow) {
        pendingChanged = new Set();
        pendingRemoved = new Set();
        pendingOverflow = false;
        void get().searchFiles(get().searchQuery);
        return;
      }
      void flushRecompute();
    }, RECOMPUTE_DEBOUNCE_MS);
  };

  return {
    /**
     * [searchFiles - 在工作区搜索文件/内容]
     * @writes searchSlice.searchQuery, searchEntries, searching, searchSessionId, searchWorkspaceId
     * @see shared/ipc/workspace.ts → workspace.search
     */
    searchFiles: async (query: string) => {
      const state = get();
      set({ searchQuery: query });
      if (!query.trim()) {
        set({ searchEntries: [], searching: false, searchPartial: false });
        return;
      }
      if (state.filesSearchScope === 'file') {
        // 文件范围为纯前端过滤：仅提交检索词，不发后端内容请求、不置加载态
        set({ searching: false });
        return;
      }
      const workspaceId = state.appInfo?.currentWorkspace?.id;
      const sessionId = get().beginSearchSession(workspaceId);
      set({ searching: true });
      debouncedSearch(query, async () => {
        if (get().searchQuery !== query || get().searchSessionId !== sessionId) {
          return;
        }
        try {
          const result = await window.digitalLife.workspace.search(query);
          if (get().searchQuery !== query || get().searchSessionId !== sessionId) {
            return;
          }
          if (!result.ok) {
            captureError(get, result.error, SCOPE);
            return;
          }
          set({
            searchEntries: toHitEntries(result.data, workspaceId ?? ''),
            searchPartial: result.data.length >= MAX_HITS,
          });
        } finally {
          if (get().searchQuery === query && get().searchSessionId === sessionId) {
            set({ searching: false });
          }
        }
      });
    },

    /** [markSearchHitStale - 点击校验失败时标记该命中失效] */
    markSearchHitStale: (path: string, line?: number) => {
      set({ searchEntries: markHitsStale(get().searchEntries, path, line) });
    },

    /** [subscribeWorkspaceFilesChanged - 订阅后端 watcher 批次并调度局部重算] */
    subscribeWorkspaceFilesChanged: () =>
      window.digitalLife.workspace.onFilesChanged(scheduleRecompute),
  };
}
```

在 `StoreState.ts` 的 SearchActions 接口补三个方法声明（`markSearchHitStale`、`subscribeWorkspaceFilesChanged`、`searchFiles` 已有），并把 `searchResults: WorkspaceSearchHit[]` 相关声明替换为上面 slice 的字段（`searchEntries` / `searchSessionId` / `searchPartial` / `searchWorkspaceId`）。

在 `generalActions.ts` 的 reset 块（约 278-280 行）把

```ts
        searchQuery: '',
        searchResults: [],
        searching: false,
```
改为
```ts
        searchQuery: '',
        searchEntries: [],
        searchSessionId: 0,
        searchPartial: false,
        searchWorkspaceId: undefined,
        searching: false,
```
- [ ] **Step 5: 全量替换旧字段引用**

Run: `pnpm --dir frontend exec rg -n "searchResults" src`
把每个引用按下表改为新字段（这是 Task 9 的前置：改完必须 `tsc --noEmit` 通过）：

| 位置 | 旧 | 新 |
|------|----|----|
| `useFilesPanelProps.ts` | `const searchResults = useAppStore(useShallow((s) => s.searchResults));` | `const searchEntries = useAppStore(useShallow((s) => s.searchEntries));` 并把它作为 prop `searchEntries` 透传 |
| `FileNavigatorShell.tsx` | prop `searchResults: SearchHit[]` | prop `searchEntries: SearchEntry[]`（`SearchEntry` 即 `SearchHitEntry`，含 `stale`/`workspaceId`） |
| `App.tsx`（若有透传） | 同名 prop | 同步改名 |
| `empty-state`/计数等派生值 | `searchResults.length` | `searchEntries.length` |

同一步把 `SearchEntry` 的片段数据补上 `stale`：`contentSections` 里 `snippets: hits.map((hit) => ({ line: hit.line, preview: hit.preview, stale: hit.stale, onOpen: … }))`。

- [ ] **Step 6: 运行测试**

Run: `pnpm --dir frontend run test -- --run src/app/stores/slices/__tests__/searchSession.test.ts && npx tsc --noEmit`
Expected: PASS（5 个测试）且类型检查零错误

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/stores
git commit -m "refactor(stores): replace search result snapshot with session-tagged hit entries"
```

---

### Task 8: 前端 — 共享跳转/重定位能力

**Files:**
- Create: `frontend/src/app/features/preview/revealSourceLine.ts`
- Test: `frontend/src/app/features/preview/revealSourceLine.test.ts`

**Interfaces:**
- Produces（Task 9/10 消费）：
  - `resolveSourceLineElement(container: HTMLElement, line: number): HTMLElement | null`
  - `revealSourceLine(container: HTMLElement, line: number, options?: { flash?: boolean }): boolean`
  - `findLineForQuery(content: string, query: string, options: { matchCase: boolean; wholeWord: boolean; useRegex: boolean }, preferredLine: number): number | null`
  - `revealEditorLineSafely(editor: EditorRef, line: number, context: { path?: string; scope: string }): 'revealed' | 'clamped' | 'invalid'`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/features/preview/revealSourceLine.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findLineForQuery, resolveSourceLineElement, revealSourceLine } from './revealSourceLine';

function container(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('resolveSourceLineElement', () => {
  it('picks the innermost block containing the line (inclusive end)', () => {
    const root = container(
      '<ul data-source-line-start="6" data-source-line-end="8"><li data-source-line-start="7" data-source-line-end="8">x</li></ul>',
    );
    expect(resolveSourceLineElement(root, 7)?.tagName).toBe('LI');
  });

  it('matches single-line blocks where start equals end', () => {
    const root = container('<h1 data-source-line-start="1" data-source-line-end="1">t</h1>');
    expect(resolveSourceLineElement(root, 1)?.tagName).toBe('H1');
  });

  it('falls back to the nearest preceding block when nothing contains the line', () => {
    const root = container(
      '<p data-source-line-start="3" data-source-line-end="4">a</p><p data-source-line-start="10" data-source-line-end="11">b</p>',
    );
    expect(resolveSourceLineElement(root, 7)?.textContent).toBe('a');
  });

  it('returns null when the container has no mapped blocks', () => {
    expect(resolveSourceLineElement(container('<p>plain</p>'), 5)).toBeNull();
  });
});

describe('revealSourceLine', () => {
  it('scrolls to the resolved element and adds the flash class', () => {
    const root = container('<p data-source-line-start="1" data-source-line-end="1">a</p>');
    const target = root.querySelector('p') as HTMLElement;
    let scrolled = false;
    target.scrollIntoView = () => {
      scrolled = true;
    };
    expect(revealSourceLine(root, 1, { flash: true })).toBe(true);
    expect(scrolled).toBe(true);
    expect(target.classList.contains('adl-md-flash')).toBe(true);
  });

  it('returns false without throwing when nothing matches', () => {
    expect(revealSourceLine(container('<p>plain</p>'), 5)).toBe(false);
  });
});

describe('findLineForQuery', () => {
  const content = ['alpha', 'needle here', 'beta', 'needle again'].join('\n');

  it('returns the preferred line when it still matches', () => {
    expect(findLineForQuery(content, 'needle', { matchCase: false, wholeWord: false, useRegex: false }, 2)).toBe(2);
  });

  it('relocates to the nearest matching line when the preferred one no longer matches', () => {
    expect(findLineForQuery(content, 'needle', { matchCase: false, wholeWord: false, useRegex: false }, 3)).toBe(4);
  });

  it('returns null when the content no longer contains the query', () => {
    expect(findLineForQuery(content, 'absent', { matchCase: false, wholeWord: false, useRegex: false }, 1)).toBeNull();
  });

  it('honors case sensitivity, whole word and regex options', () => {
    expect(findLineForQuery(content, 'NEEDLE', { matchCase: true, wholeWord: false, useRegex: false }, 1)).toBeNull();
    expect(findLineForQuery(content, 'needl', { matchCase: false, wholeWord: true, useRegex: false }, 1)).toBeNull();
    expect(findLineForQuery(content, '^needle \\w+', { matchCase: false, wholeWord: false, useRegex: true }, 1)).toBe(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- --run src/app/features/preview/revealSourceLine.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `frontend/src/app/features/preview/revealSourceLine.ts`：

```ts
import { buildSearchPattern } from '@utils/searchPattern';
import type { EditorRef } from '@stores/types';

/** 块级源行映射：`end` 为闭区间末行号（单行块 `start === end`）。 */
interface MappedBlock {
  element: HTMLElement;
  start: number;
  end: number;
}

function collectBlocks(container: HTMLElement): MappedBlock[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-source-line-start]'));
  return nodes.map((element) => ({
    element,
    start: Number(element.dataset.sourceLineStart),
    end: Number(element.dataset.sourceLineEnd),
  }));
}

/**
 * 取包含该行的最内层块（文档顺序中最后一个命中者）；无包含者时回退到
 * **最近的前置块**（业界做法，见 VS Code markdown preview 的 scroll-sync）。
 */
export function resolveSourceLineElement(container: HTMLElement, line: number): HTMLElement | null {
  let containing: HTMLElement | null = null;
  let preceding: HTMLElement | null = null;
  for (const block of collectBlocks(container)) {
    if (Number.isFinite(block.start) && Number.isFinite(block.end) && block.start <= line && line <= block.end) {
      containing = block.element;
    } else if (block.end < line) {
      preceding = block.element;
    }
  }
  return containing ?? preceding ?? null;
}

/** 滚动到目标行对应的块并（可选）落点闪烁；返回是否找到了目标块。 */
export function revealSourceLine(
  container: HTMLElement,
  line: number,
  options: { flash?: boolean } = {},
): boolean {
  const target = resolveSourceLineElement(container, line);
  if (!target) {
    return false;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (options.flash) {
    target.classList.remove('adl-md-flash');
    // 强制重排以便连续跳转时动画可重放
    void target.offsetWidth;
    target.classList.add('adl-md-flash');
    window.setTimeout(() => target.classList.remove('adl-md-flash'), 1400);
  }
  return true;
}

/**
 * 在 live 内容中定位检索词所在行：优先返回 `preferredLine`（若仍匹配），
 * 否则返回**距其行号最近**的匹配行（同距取靠前者）；内容中已无匹配返回 `null`。
 */
export function findLineForQuery(
  content: string,
  query: string,
  options: { matchCase: boolean; wholeWord: boolean; useRegex: boolean },
  preferredLine: number,
): number | null {
  const pattern = buildSearchPattern(query, {
    matchCase: options.matchCase,
    wholeWord: options.wholeWord,
    useRegex: options.useRegex,
  });
  if (!pattern) {
    return null;
  }
  const matcher = new RegExp(pattern);
  const lines = content.split(/\r?\n/);
  const matches: number[] = [];
  lines.forEach((text, index) => {
    matcher.lastIndex = 0;
    if (matcher.test(text)) {
      matches.push(index + 1);
    }
  });
  if (matches.length === 0) {
    return null;
  }
  if (matches.includes(preferredLine)) {
    return preferredLine;
  }
  return matches.reduce((best, candidate) =>
    Math.abs(candidate - preferredLine) < Math.abs(best - preferredLine) ? candidate : best,
  );
}

/**
 * 编辑器行揭示：越界行钳制到最近有效行（越界会抛 RangeError，且上层无错误边界）。
 */
export function revealEditorLineSafely(
  editor: EditorRef,
  line: number,
  context: { path?: string; scope: string },
): 'revealed' | 'clamped' | 'invalid' {
  const lineCount = editor.getModel?.()?.getLineCount() ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(line) || line < 1) {
    return 'invalid';
  }
  const finiteCount = Number.isFinite(lineCount) ? lineCount : null;
  const target = finiteCount === null ? line : Math.min(line, finiteCount);
  if (target !== line) {
    console.warn(
      `[revealEditorLineSafely] clamped in ${context.scope}: requested=${line}, applied=${target}, lineCount=${finiteCount ?? 'unknown'}, path=${context.path ?? 'unknown'}`,
    );
  }
  editor.revealLineInCenter?.(target);
  editor.setPosition?.({ lineNumber: target, column: 1 });
  editor.focus?.();
  return target === line ? 'revealed' : 'clamped';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- --run src/app/features/preview/revealSourceLine.test.ts`
Expected: PASS（11 个测试）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/preview/revealSourceLine.ts frontend/src/app/features/preview/revealSourceLine.test.ts
git commit -m "feat(preview): add shared source-line reveal and relocation helpers"
```

---

### Task 9: 前端 — 文件面板接入（点击校验/重定位、失效 UI、watcher 接线、自动刷新）

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/file.ts` 与 `frontend/src/app/i18n/en-US/file.ts`
- Modify: `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx`
- Modify: `frontend/src/app/regions/right-panel/SearchResultsTree.tsx`（失效行标记）
- Modify: `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx`（消费 `searchEntries`）
- Modify: `frontend/src/app/regions/right-panel/hooks/useFilesPanelProps.ts`（透传 `searchEntries`）
- Modify: `frontend/src/app/hooks/useAppStartup.ts`（订阅 watcher 批次）
- Test: `frontend/src/app/regions/right-panel/filesSearchMode.test.ts`（追加断言）

**Interfaces:**
- Consumes: Task 7 的 `searchEntries`/`markSearchHitStale`/`subscribeWorkspaceFilesChanged`；Task 8 的共享 helper
- Produces: 行内「已失效」标记与面板汇总计数

- [ ] **Step 1: 加 i18n key**

`file.ts`（中英同步）：

```ts
  // zh-CN
  searchHitStale: '已失效',
  searchStaleSummary: '{count} 处结果已失效',
  searchPartialResults: '仅显示部分结果',
```
```ts
  // en-US
  searchHitStale: 'Outdated',
  searchStaleSummary: '{count} results are outdated',
  searchPartialResults: 'Showing partial results',
```

- [ ] **Step 2: 写失败测试（接线断言）**

在 `filesSearchMode.test.ts` 追加：

```ts
  it('validates and relocates the clicked hit, marking stale when gone (事项 45)', () => {
    expect(filesPanelSource).toContain('findLineForQuery');
    expect(filesPanelSource).toContain('markSearchHitStale');
    expect(filesPanelSource).toContain('revealSourceLine');
    expect(resultsTreeSource).toContain('searchHitStale');
  });

  it('sources the search options from the store so relocation matches the query (事项 45)', () => {
    expect(shellSource).toContain('searchUseRegex');
    expect(searchPanelHookSource).toContain('s.searchMatchCase');
  });

  it('subscribes to workspace file-change batches (事项 45)', () => {
    expect(startupSource).toContain('subscribeWorkspaceFilesChanged');
  });
```

（在测试文件顶部补两个读取源：

```ts
  const searchPanelHookSource = readFileSync(
    new URL('./hooks/useSearchPanel.ts', import.meta.url),
    'utf8',
  );
  const startupSource = readFileSync(
    new URL('../../hooks/useAppStartup.ts', import.meta.url),
    'utf8',
  );
```
）

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --dir frontend run test -- --run src/app/regions/right-panel/filesSearchMode.test.ts`
Expected: FAIL

- [ ] **Step 4: 把检索选项接到 store（Task 7 已加字段）**

`frontend/src/app/regions/right-panel/hooks/useSearchPanel.ts`：把 `matchCase` / `matchWholeWord` / `useRegex` 三个 `useState` 改为读写 store，保持其对外 API 不变：

```ts
  const { matchCase, matchWholeWord, useRegex } = useAppStore(
    useShallow((s) => ({
      matchCase: s.searchMatchCase,
      matchWholeWord: s.searchMatchWholeWord,
      useRegex: s.searchUseRegex,
    })),
  );
  const setMatchCase = useAppStore((s) => s.setSearchMatchCase);
  const setMatchWholeWord = useAppStore((s) => s.setSearchMatchWholeWord);
  const setUseRegex = useAppStore((s) => s.setSearchUseRegex);
  const setMatchCaseToggle = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setMatchCase(typeof value === 'function' ? value(matchCase) : value);
    },
    [matchCase, setMatchCase],
  );
```
（`setMatchWholeWord` / `setUseRegex` 同样包一层 toggle 适配器，替换原来的 `useState` setter 传入返回值对象。）

- [ ] **Step 5: `SearchResultsTree.tsx` 增加失效标记**

`SearchResultSnippet` 增加 `stale?: boolean`；片段按钮内追加（`staleLabel` 作为 prop 从 Shell 传入，避免树内引入 i18n 依赖）：

```tsx
                {snippet.stale ? (
                  <span className="adl-search-snippet__stale">{props.staleLabel}</span>
                ) : null}
```
`SearchResultsTreeProps` 增加 `staleLabel: string;`，`FileNavigatorShell` 传 `staleLabel={t.searchHitStale as string}`。

- [ ] **Step 6: `FilesPanel.tsx` 校验/重定位 + 预览 helper + 汇总**

校验分支（替换现有 `handleOpenSearchResultAtLine`；`searchEntries` 的 `stale` 由 store 提供，无需下标参数）：

```tsx
  const handleOpenSearchResultAtLine = useCallback(
    (relativePath: string, line: number) => {
      const state = useAppStore.getState();
      const liveContent =
        state.selectedFilePath === relativePath && state.fileContent !== undefined
          ? state.fileContent
          : undefined;
      if (liveContent !== undefined) {
        const relocated = findLineForQuery(
          liveContent,
          state.searchQuery,
          {
            matchCase: state.searchMatchCase,
            wholeWord: state.searchMatchWholeWord,
            useRegex: state.searchUseRegex,
          },
          line,
        );
        if (relocated === null) {
          state.markSearchHitStale(relativePath, line);
          return;
        }
        onOpenFileAtLine(relativePath, relocated);
        return;
      }
      onOpenFileAtLine(relativePath, line);
    },
    [onOpenFileAtLine],
  );
```

预览跳转（`revealInPreview` 内部解析改为共享 helper，其余重试逻辑保持）：

```tsx
        const surface = editorSurfaceRef.current;
        if (surface && revealSourceLine(surface, line, { flash: true })) {
          if (previewRevealTimerRef.current !== undefined) {
            window.clearInterval(previewRevealTimerRef.current);
            previewRevealTimerRef.current = undefined;
          }
          return;
        }
        // 未挂载（懒加载）→ 保持 60ms 重试，上限 2.5s 后放弃
```

汇总 UI（结果区上方；`searchEntries` 从 store 取）：

```tsx
          {staleCount > 0 ? (
            <p className="adl-search-stale-summary">
              {formatT(t, 'searchStaleSummary', { count: staleCount })}
            </p>
          ) : null}
          {searchPartial ? (
            <p className="adl-search-partial">{t.searchPartialResults as string}</p>
          ) : null}
```
其中 `const staleCount = searchEntries.filter((entry) => entry.stale).length;`

- [ ] **Step 7: `useAppStartup.ts` 订阅 watcher**

```ts
  useEffect(() => {
    return actions.subscribeWorkspaceFilesChanged();
  }, [actions]);
```
（`subscribeWorkspaceFilesChanged` 内部已含决策 6 的 `fetchGitStatus` / `refreshAllWorkspaceTrees` 调用，见 Task 7。）

- [ ] **Step 8: CSS**

在 `frontend/src/styles/regions/rightpanel/search-panel.css` 追加

```css
.adl-search-snippet__stale,
.adl-search-file__stale {
  flex: 0 0 auto;
  margin-left: var(--space-2);
  color: var(--warning);
  font-size: 10px;
}

.adl-search-stale-summary,
.adl-search-partial {
  margin: 0;
  padding: 2px var(--space-2);
  color: var(--warning);
  font-size: 11px;
}
```

- [ ] **Step 9: 运行测试与静态检查**

Run: `pnpm --dir frontend run test -- --run src/app/regions/right-panel/filesSearchMode.test.ts src/app/features/preview/revealSourceLine.test.ts && npx tsc --noEmit && pnpm --dir frontend run lint`
Expected: PASS 且零错误

- [ ] **Step 10: 提交**

```bash
git add frontend/src/app frontend/src/styles
git commit -m "feat(files-panel): validate and relocate search hits, mark stale results"
```

---

### Task 10: 前端 — 变更面板接入（复用共享能力 + 自动刷新 + diff 揭示守卫）

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelStateUtils.ts:231-272`
- Test: `frontend/src/app/regions/right-panel/changesPanelReveal.test.ts`（新建）

**Interfaces:**
- Consumes: Task 8 的 `revealSourceLine` / `findLineForQuery` / `revealEditorLineSafely`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/regions/right-panel/changesPanelReveal.test.ts`：

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('changes panel reveal wiring', () => {
  const source = readFileSync(
    new URL('./panels/ChangesPanel/useChangesPanelStateUtils.ts', import.meta.url),
    'utf8',
  );

  it('reuses the shared preview reveal helper instead of heading-only anchors', () => {
    expect(source).toContain('revealSourceLine');
    expect(source).not.toContain('container.querySelector(`[data-source-line="${line}"]`)');
  });

  it('guards the diff editor reveal against out-of-range lines', () => {
    expect(source).toContain('revealEditorLineSafely');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- --run src/app/regions/right-panel/changesPanelReveal.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

把 `revealOutlineLine` 的预览分支替换为共享 helper：

```ts
  if (changePreview && categorizeFile(changePreview.path) === 'markdown' && previewEnabled) {
    const container = changesPreviewContainerRef.current;
    if (container) {
      // 预览内容为 live git 内容：先校验命中行，再复用与文件面板一致的块级跳转 + 闪烁
      const relocated = findLineForQuery(
        changePreview.currentContent,
        changePreview.query ?? '',
        { matchCase: false, wholeWord: false, useRegex: false },
        line,
      );
      if (relocated !== null) {
        revealSourceLine(container, relocated, { flash: true });
      }
    }
    return;
  }
```
> 说明：`changePreview` 若未携带 `query`，则在 `useChangesPanelState` 中把当前检索词透传进来（若变更面板不接检索词，保留 `revealSourceLine(container, line, { flash: true })` 不做重定位即可）。

编辑器分支改为：

```ts
    const diffRef = editorRef.current;
    // …既有 uncollapse 逻辑保持不变…
    revealEditorLineSafely(editor, line, { scope: 'changes-panel', path: changePreview?.path });
```
（把原先直接 `editor.revealLineInCenter?.(line)` 的三行替换为上面的调用。）

- [ ] **Step 4: 运行测试与静态检查**

Run: `pnpm --dir frontend run test -- --run src/app/regions/right-panel/changesPanelReveal.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelStateUtils.ts frontend/src/app/regions/right-panel/changesPanelReveal.test.ts
git commit -m "feat(changes-panel): reuse shared reveal helpers and guard diff line reveals"
```

---

### Task 11: 前端 — App 级错误边界

**Files:**
- Create: `frontend/src/app/components/ErrorBoundary.tsx`
- Modify: `frontend/src/app/App.tsx`（包裹根节点）
- Test: `frontend/src/app/components/__tests__/ErrorBoundary.test.tsx`

**Interfaces:**
- Produces: `<ErrorBoundary fallback={…}>`，捕获子树渲染异常并渲染降级 UI（而非整应用空白）

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders the fallback instead of unmounting the whole tree', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fallback')).toBeTruthy();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test -- --run src/app/components/__tests__/ErrorBoundary.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```tsx
import React from 'react';

interface ErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** 顶层错误边界：单点渲染异常不再导致整个应用空白（见 debug-logs 2026-09-17 RangeError 白屏）。 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] render error contained:', error, info.componentStack);
  }

  render(): React.ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
```

在 `App.tsx` 最外层包裹（fallback 使用 i18n 文案 key 新增 `appCrashFallback`，中英成对，提供"重新加载"按钮调用 `window.location.reload()`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- --run src/app/components/__tests__/ErrorBoundary.test.tsx && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/components frontend/src/app/App.tsx frontend/src/app/i18n
git commit -m "feat(app): add top-level error boundary"
```

---

### Task 12: 收尾 — 移除临时调试日志、文档同步、分级验证

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx`（删除 `debugNavigate` 及其全部调用）
- Modify: `docs/root-cause-resolution/2026-09/progress-2026-09-17-122054.md`（回填事项 38–45 结论与验证）
- Modify: `docs/specs/search-freshness/2026-09-17-search-result-freshness-design-zh-cn.md`（状态改为"已实施"）
- Modify: `ai-digital-life/AGENTS.md`（若功能清单需补"检索结果自动新鲜度"条目）

- [ ] **Step 1: 删除临时调试日志**

删除 `FilesPanel.tsx` 中的 `debugNavigate` 函数定义与全部调用点（`enter` / `preview` / `editor` / `pending-wait-new-content` / `pending-fire` / `preview-give-up` / `preview-no-surface`），并用 `pnpm --dir frontend exec rg -n "ADL-DEBUG" src` 确认零残留。

- [ ] **Step 2: 分级验证**

Run:
```
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test -p adl-workspace
cargo test -p adl-kernel
cargo test -p adl-server search_in_files
pnpm --dir frontend run lint
pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend run test -- --run src/app/stores/slices/__tests__/searchSession.test.ts
pnpm --dir frontend run test -- --run src/app/features/preview
pnpm --dir frontend run test -- --run src/app/regions/right-panel
pnpm --dir frontend run test -- --run src/shared/ipc
```
Expected: 全部通过、零告警

- [ ] **Step 3: 双端手测（Tauri + 浏览器预览）**

1. 外部工具改文件 → 面板该文件命中自动更新；删除文件 → 条目消失
2. 应用内保存 → 命中更新；应用补丁 → 变更树自动刷新
3. 点击失效条目 → 行内「已失效」＋ 顶部汇总计数，不跳转、不白屏
4. 内容移位后点击 → 落到新位置
5. 变更面板预览跳转＋落点闪烁；diff 揭示不白屏
6. 切换工作区 → 命中清空、watcher 重建

- [ ] **Step 4: 文档同步与提交**

```bash
git add docs ai-digital-life/AGENTS.md frontend/src/app/regions/right-panel/panels/FilesPanel.tsx
git commit -m "docs: record search freshness feature and clean up debug logging"
```
