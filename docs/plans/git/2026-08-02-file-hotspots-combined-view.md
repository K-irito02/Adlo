# 文件热点组合视图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将「文件旭日图」改造为「旭日图 + 排行榜」组合视图，数据源从 `git ls-files` 改为 `git log --numstat`，按变更次数/行变化量定位热点文件与高活跃模块。

**Architecture:** 方案 D 组合视图 + 方案 2 后端构建完整树。Rust 端新增 `hotspots.rs` 聚合 numstat 输出 `tree` + `files`；前端新增 `FileHotspotsView` 容器协调 `FileSunburstChart`（仅目录节点）与 `FileHotspotsRanking`（扁平文件列表），通过 `drillPath` 联动。

**Tech Stack:** Rust + Tauri 2.x + React 19 + TypeScript + motion/react + Vitest

## Global Constraints

- 所有 UI 文本必须使用 i18n key（`useTCopy()` + `TCopyProvider`），禁止硬编码中英文
- `@` 路径别名导入（禁止深层相对路径）：`@/components/...`、`@/app/...`、`@i18n/...`
- 测试文件就近放置在 `__tests__/` 子目录
- TypeScript 禁止 `any`，使用精确类型；禁止 `else`，使用提前返回
- Rust 禁止 `unwrap()`，使用 `?` 或模式匹配；错误类型用 `AppError`
- Rust 类型必须加 `#[derive(Debug, Clone, Serialize, Deserialize, TS)]` + `#[serde(rename_all = "camelCase")]`
- 空状态文字结尾不得有句号，居中显示，使用 `EmptyRow` 组件
- CSS 颜色用 CSS 变量（`var(--text-primary)` 等），间距用 `var(--space-{n})`，禁止硬编码
- Rust 命令执行前必须设置 PATH：`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- 参考设计文档：`docs/superpowers/specs/2026-08-02-file-hotspots-combined-view-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `ai-digital-life/crates/types/src/types/git_visualization.rs` | 修改 | 新增 3 个 Rust 类型（`GitVisFileHotspotNode` / `GitVisFileHotspotFile` / `GitVisFileHotspots`） |
| `ai-digital-life/crates/workspace/src/git/git_vis/hotspots.rs` | 新建 | numstat 聚合 + 目录树构建 |
| `ai-digital-life/crates/workspace/src/git/git_vis/mod.rs` | 修改 | 导出 `hotspots` 模块 |
| `ai-digital-life/crates/workspace/src/lib.rs` | 修改 | 导出 `capture_file_hotspots` |
| `ai-digital-life/src-tauri/src/commands/git_vis_cache.rs` | 修改 | 新增 `CHART_TYPE_FILE_HOTSPOTS` 常量 |
| `ai-digital-life/src-tauri/src/commands/workspace_git_vis.rs` | 修改 | 新增 `workspace_git_vis_file_hotspots` 命令 |
| `ai-digital-life/src-tauri/src/lib.rs` | 修改 | 注册新命令到 invoke_handler |
| `ai-digital-life/frontend/src/shared/ipc/workspace.ts` | 修改 | 新增 `gitVisFileHotspots` 接口方法 |
| `ai-digital-life/frontend/src/tauri-bridge/tauri-workspace.ts` | 修改 | 新增 tauri 实现 |
| `ai-digital-life/frontend/src/preview-bridge/preview-git.ts` | 修改 | 新增 preview 实现 |
| `ai-digital-life/frontend/dev/previewWorkspaceService/gitVisualization.ts` | 修改 | 新增 `handleFileHotspots` Node 端聚合 |
| `ai-digital-life/frontend/dev/previewServer.ts` | 修改 | 注册新路由 |
| `ai-digital-life/frontend/src/mock/mock-workspace.ts` | 修改 | 新增 mock |
| `ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts` | 修改 | 新增 `fileHotspotsMockData` |
| `ai-digital-life/frontend/src/app/features/git-visualization/chartIds.ts` | 修改 | 新增 `FILE_HOTSPOTS` |
| `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useChartData.ts` | 修改 | `TIME_RANGE_CHARTS` 新增 `FILE_HOTSPOTS` |
| `ai-digital-life/frontend/src/app/stores/slices/gitVisSlice.ts` | 修改 | `fetchChartData` 路由新增 `FILE_HOTSPOTS` 分支 |
| `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts` | 修改 | 新增 `adaptHotspotsTree` + `filterFilesByPath` + `computeArcFill` |
| `ai-digital-life/frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts` | 修改 | 新增适配器测试 |
| `ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx` | 修改 | 新增 `tooltipText` prop |
| `ai-digital-life/frontend/src/components/charts/__tests__/sunburst-segment.test.tsx` | 修改 | tooltipText 断言 |
| `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useFileHotspotsState.ts` | 新建 | 下钻路径 + 颜色模式 + 排序状态 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx` | 修改 | 改造为 `FileSunburstChart`，接入新数据源 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx` | 修改 | 改造测试 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsRanking.tsx` | 新建 | 排行榜组件 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsRanking.test.tsx` | 新建 | 排行榜测试 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx` | 新建 | 组合容器 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx` | 新建 | 容器测试 |
| `ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx` | 修改 | `FileSunburst` → `FileHotspotsView` |
| `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts` | 修改 | 新增 i18n key |
| `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts` | 修改 | 新增 i18n key |
| `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css` | 修改 | 新增样式 |

---

## Task 1: Rust 后端 - 类型 + 聚合 + IPC 命令

**Files:**
- Modify: `ai-digital-life/crates/types/src/types/git_visualization.rs`
- Create: `ai-digital-life/crates/workspace/src/git/git_vis/hotspots.rs`
- Modify: `ai-digital-life/crates/workspace/src/git/git_vis/mod.rs`
- Modify: `ai-digital-life/crates/workspace/src/lib.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/git_vis_cache.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/workspace_git_vis.rs`
- Modify: `ai-digital-life/src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `GitVisFileHotspotNode` / `GitVisFileHotspotFile` / `GitVisFileHotspots` (Rust 类型 + TS 导出)；`capture_file_hotspots(root, since, until) -> GitVisFileHotspots`；`workspace_git_vis_file_hotspots` Tauri 命令

- [ ] **Step 1: 新增 Rust 类型**

Edit `ai-digital-life/crates/types/src/types/git_visualization.rs`，在文件末尾（`GitVisFileSunburst` 之后）添加：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisFileHotspotNode {
    pub name: String,
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<GitVisFileHotspotNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisFileHotspotFile {
    pub path: String,
    pub change_count: i32,
    pub additions: i32,
    pub deletions: i32,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisFileHotspots {
    pub tree: GitVisFileHotspotNode,
    pub files: Vec<GitVisFileHotspotFile>,
}
```

- [ ] **Step 2: 新增 hotspots.rs 模块**

Create `ai-digital-life/crates/workspace/src/git/git_vis/hotspots.rs`:

```rust
use adl_errors::AppError;
use adl_types::{GitVisFileHotspotFile, GitVisFileHotspotNode, GitVisFileHotspots};
use std::collections::BTreeMap;
use std::path::Path;
use tracing::debug;

/// Per-file aggregation state during numstat parsing.
#[derive(Default, Clone)]
struct FileAgg {
    change_count: i32,
    additions: i32,
    deletions: i32,
    last_modified: String,
}

pub async fn capture_file_hotspots(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisFileHotspots, AppError> {
    let t0 = std::time::Instant::now();
    debug!(
        "[ADL-GIT-VIS] [file_hotspots] running: git log --numstat (since={:?}, until={:?})",
        since, until
    );

    let mut args: Vec<String> = vec![
        "log".to_string(),
        "--pretty=format:%H|%aI".to_string(),
        "--numstat".to_string(),
    ];
    if let Some(s) = since {
        args.push(format!("--since={}", s));
    }
    if let Some(u) = until {
        args.push(format!("--until={}", u));
    }

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let raw = super::super::git_helpers::run_git_with_timeout(root, &args_ref)
        .await
        .ok_or_else(|| AppError::Workspace("git log --numstat failed for file_hotspots".into()))?;

    let file_map = aggregate_numstat_by_path(&raw);
    let files = build_flat_files(&file_map);
    let tree = build_hotspot_tree(&files);

    debug!(
        "[ADL-GIT-VIS] [file_hotspots] [{}] done in {:?} — {} files",
        root.display(),
        t0.elapsed(),
        files.len()
    );

    Ok(GitVisFileHotspots { tree, files })
}

/// Parse `git log --pretty=format:%H|%aI --numstat` output, aggregating per-file.
fn aggregate_numstat_by_path(raw: &str) -> BTreeMap<String, FileAgg> {
    let mut map: BTreeMap<String, FileAgg> = BTreeMap::new();
    let mut current_date: Option<String> = None;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Try parsing as numstat row first (tab-separated, 3 fields)
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 3 {
            let adds_raw = parts[0];
            let dels_raw = parts[1];
            let path = parts[2].to_string();
            if path.is_empty() {
                continue;
            }

            let entry = map.entry(path).or_default();
            entry.change_count += 1;

            // Binary files show "-" for additions/deletions
            let adds: i32 = adds_raw.parse().unwrap_or(0);
            let dels: i32 = dels_raw.parse().unwrap_or(0);
            entry.additions += adds;
            entry.deletions += dels;

            if let Some(ref date) = current_date {
                if date > &entry.last_modified || entry.last_modified.is_empty() {
                    entry.last_modified = date.clone();
                }
            }
            continue;
        }

        // Otherwise try parsing as commit header (%H|%aI)
        if let Some(date) = header_date(line) {
            current_date = Some(date);
        } else {
            tracing::warn!("[ADL-GIT-VIS] [file_hotspots] skipping unparseable line: {}", line);
        }
    }

    map
}

/// Extract leading YYYY-MM-DD from a `%H|%aI` header line.
fn header_date(line: &str) -> Option<String> {
    let pipe_pos = line.find('|')?;
    let date_part = &line[pipe_pos + 1..];
    if date_part.len() < 10 {
        return None;
    }
    let head = &date_part[..10];
    let bytes = head.as_bytes();
    if bytes.len() != 10 || !bytes[0..4].iter().all(|b| b.is_ascii_digit()) || bytes[4] != b'-' {
        return None;
    }
    Some(head.to_string())
}

/// Convert aggregated map to flat file list, sorted by change_count descending.
fn build_flat_files(map: &BTreeMap<String, FileAgg>) -> Vec<GitVisFileHotspotFile> {
    let mut files: Vec<GitVisFileHotspotFile> = map
        .iter()
        .map(|(path, agg)| GitVisFileHotspotFile {
            path: path.clone(),
            change_count: agg.change_count,
            additions: agg.additions,
            deletions: agg.deletions,
            last_modified: agg.last_modified.clone(),
        })
        .collect();
    files.sort_by(|a, b| b.change_count.cmp(&a.change_count).then_with(|| a.path.cmp(&b.path)));
    files
}

/// Build a directory tree from flat file list, aggregating counts at each directory.
fn build_hotspot_tree(files: &[GitVisFileHotspotFile]) -> GitVisFileHotspotNode {
    let mut root = GitVisFileHotspotNode {
        name: "root".to_string(),
        node_type: "directory".to_string(),
        change_count: None,
        additions: None,
        deletions: None,
        last_modified: None,
        children: Some(Vec::new()),
    };

    for file in files {
        let parts: Vec<&str> = file.path.split('/').collect();
        add_to_hotspot_tree(&mut root, &parts, 0, file);
    }

    // Aggregate directory stats from children (post-order)
    aggregate_directory_stats(&mut root);

    root
}

fn add_to_hotspot_tree(
    node: &mut GitVisFileHotspotNode,
    parts: &[&str],
    idx: usize,
    file: &GitVisFileHotspotFile,
) {
    if idx >= parts.len() {
        return;
    }
    let name = parts[idx].to_string();
    let is_file = idx == parts.len() - 1;
    let node_type = if is_file { "file" } else { "directory" };

    let children = node.children.get_or_insert_with(Vec::new);
    if let Some(existing) = children.iter_mut().find(|c| c.name == name && c.node_type == node_type)
    {
        if is_file {
            existing.change_count = Some(file.change_count);
            existing.additions = Some(file.additions);
            existing.deletions = Some(file.deletions);
            existing.last_modified = Some(file.last_modified.clone());
        } else {
            add_to_hotspot_tree(existing, parts, idx + 1, file);
        }
    } else {
        let mut new_node = GitVisFileHotspotNode {
            name,
            node_type: node_type.to_string(),
            change_count: if is_file { Some(file.change_count) } else { None },
            additions: if is_file { Some(file.additions) } else { None },
            deletions: if is_file { Some(file.deletions) } else { None },
            last_modified: if is_file { Some(file.last_modified.clone()) } else { None },
            children: if is_file { None } else { Some(Vec::new()) },
        };
        if !is_file {
            add_to_hotspot_tree(&mut new_node, parts, idx + 1, file);
        }
        children.push(new_node);
    }
}

/// Post-order aggregation: directory stats = sum of children stats, last_modified = max.
fn aggregate_directory_stats(node: &mut GitVisFileHotspotNode) {
    if node.node_type == "file" {
        return;
    }
    let Some(children) = node.children.as_mut() else {
        return;
    };

    let mut total_change = 0;
    let mut total_add = 0;
    let mut total_del = 0;
    let mut max_date = String::new();

    for child in children.iter_mut() {
        aggregate_directory_stats(child);
        total_change += child.change_count.unwrap_or(0);
        total_add += child.additions.unwrap_or(0);
        total_del += child.deletions.unwrap_or(0);
        if let Some(d) = &child.last_modified {
            if d > &max_date {
                max_date = d.clone();
            }
        }
    }

    node.change_count = Some(total_change);
    node.additions = Some(total_add);
    node.deletions = Some(total_del);
    if !max_date.is_empty() {
        node.last_modified = Some(max_date);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregate_numstat_by_path_parses_and_aggregates() {
        let raw = "abc123|2026-07-31T10:00:00+08:00\n10\t5\tsrc/main.rs\nabc123|2026-07-31T10:00:00+08:00\n3\t1\tsrc/main.rs\ndef456|2026-08-01T12:00:00+08:00\n20\t8\tlib/utils.rs";
        let map = aggregate_numstat_by_path(raw);

        assert_eq!(map.get("src/main.rs").unwrap().change_count, 2);
        assert_eq!(map.get("src/main.rs").unwrap().additions, 13);
        assert_eq!(map.get("src/main.rs").unwrap().deletions, 6);
        assert_eq!(map.get("src/main.rs").unwrap().last_modified, "2026-07-31");
        assert_eq!(map.get("lib/utils.rs").unwrap().change_count, 1);
        assert_eq!(map.get("lib/utils.rs").unwrap().last_modified, "2026-08-01");
    }

    #[test]
    fn aggregate_numstat_handles_binary_files() {
        let raw = "abc|2026-07-31T10:00:00+08:00\n-\t-\tassets/logo.png";
        let map = aggregate_numstat_by_path(raw);
        let entry = map.get("assets/logo.png").unwrap();
        assert_eq!(entry.change_count, 1);
        assert_eq!(entry.additions, 0);
        assert_eq!(entry.deletions, 0);
    }

    #[test]
    fn aggregate_numstat_skips_unparseable_lines() {
        let raw = "garbage line\nabc|2026-07-31\n5\t2\tsrc/main.rs";
        let map = aggregate_numstat_by_path(raw);
        assert_eq!(map.len(), 1);
        assert!(map.contains_key("src/main.rs"));
    }

    #[test]
    fn build_flat_files_sorts_by_change_count_desc() {
        let mut map = BTreeMap::new();
        map.insert(
            "a.rs".to_string(),
            FileAgg { change_count: 5, additions: 10, deletions: 2, last_modified: "2026-07-01".into() },
        );
        map.insert(
            "b.rs".to_string(),
            FileAgg { change_count: 20, additions: 40, deletions: 10, last_modified: "2026-08-01".into() },
        );
        map.insert(
            "c.rs".to_string(),
            FileAgg { change_count: 5, additions: 1, deletions: 1, last_modified: "2026-07-15".into() },
        );
        let files = build_flat_files(&map);
        assert_eq!(files[0].path, "b.rs");
        assert_eq!(files[0].change_count, 20);
        // Tie-break by path ascending
        assert_eq!(files[1].path, "a.rs");
        assert_eq!(files[2].path, "c.rs");
    }

    #[test]
    fn build_hotspot_tree_aggregates_directory_stats() {
        let files = vec![
            GitVisFileHotspotFile {
                path: "src/main.rs".into(),
                change_count: 10,
                additions: 20,
                deletions: 5,
                last_modified: "2026-07-31".into(),
            },
            GitVisFileHotspotFile {
                path: "src/lib.rs".into(),
                change_count: 5,
                additions: 8,
                deletions: 3,
                last_modified: "2026-08-01".into(),
            },
        ];
        let tree = build_hotspot_tree(&files);

        assert_eq!(tree.name, "root");
        assert_eq!(tree.node_type, "directory");
        assert_eq!(tree.change_count, Some(15));
        assert_eq!(tree.additions, Some(28));
        assert_eq!(tree.deletions, Some(8));
        assert_eq!(tree.last_modified.as_deref(), Some("2026-08-01"));

        let src = tree.children.as_ref().unwrap().iter().find(|c| c.name == "src").unwrap();
        assert_eq!(src.change_count, Some(15));
        assert_eq!(src.last_modified.as_deref(), Some("2026-08-01"));
    }

    #[test]
    fn build_hotspot_tree_handles_empty_files() {
        let tree = build_hotspot_tree(&[]);
        assert_eq!(tree.name, "root");
        assert_eq!(tree.change_count, Some(0));
        assert!(tree.children.as_ref().unwrap().is_empty());
    }

    #[test]
    fn header_date_extracts_date_from_hash_pipe_iso() {
        assert_eq!(
            header_date("abc123def|2026-07-31T10:00:00+08:00"),
            Some("2026-07-31".to_string())
        );
        assert_eq!(header_date("not a header"), None);
        assert_eq!(header_date("abc|short"), None);
    }
}
```

- [ ] **Step 3: 注册 hotspots 模块**

Edit `ai-digital-life/crates/workspace/src/git/git_vis/mod.rs`，添加：

```rust
pub mod hotspots;
```

Edit `ai-digital-life/crates/workspace/src/lib.rs`，在现有 `pub use git_vis::...` 区域添加：

```rust
pub use git_vis::hotspots::capture_file_hotspots;
```

- [ ] **Step 4: 新增缓存常量**

Edit `ai-digital-life/src-tauri/src/commands/git_vis_cache.rs`，在现有 `CHART_TYPE_*` 常量旁添加：

```rust
pub const CHART_TYPE_FILE_HOTSPOTS: &str = "file_hotspots";
```

- [ ] **Step 5: 新增 IPC 命令**

Edit `ai-digital-life/src-tauri/src/commands/workspace_git_vis.rs`。

首先在 imports 区域添加 `GitVisFileHotspots` 到 `adl_types` 导入：

```rust
use adl_types::{
    GitVisBranchGraph, GitVisCodeEvolution, GitVisCommitStats, GitVisContributorModules,
    GitVisFileHotspots, GitVisFileSunburst, IpcResult,
};
```

然后在文件末尾（`workspace_git_vis_file_sunburst` 之后）添加新命令：

```rust
#[tauri::command]
pub async fn workspace_git_vis_file_hotspots(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisFileHotspots>, AppError> {
    let db = app.state::<adl_storage::Database>();
    let data = git_vis_cache::with_cached(
        db,
        &root_path,
        since.as_deref(),
        until.as_deref(),
        git_vis_cache::CHART_TYPE_FILE_HOTSPOTS,
        || async {
            let root = Path::new(&root_path);
            adl_workspace::capture_file_hotspots(root, since.as_deref(), until.as_deref()).await
        },
    )
    .await?;
    Ok(ipc(Ok(data)))
}
```

- [ ] **Step 6: 注册命令到 invoke_handler**

Edit `ai-digital-life/src-tauri/src/lib.rs`，找到 `invoke_handler!` 宏的 `generate_handler!` 列表，添加：

```rust
commands::workspace_git_vis::workspace_git_vis_file_hotspots,
```

- [ ] **Step 7: 生成 TS 类型并验证编译**

Run (设置 PATH 后):

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd ai-digital-life
cargo check --workspace
```

Expected: 编译通过，无错误

- [ ] **Step 8: 运行 Rust 单元测试**

Run:

```powershell
cargo test --workspace -p adl-workspace git::git_vis::hotspots
```

Expected: 7 个测试全部 PASS

- [ ] **Step 9: 运行 clippy**

Run:

```powershell
cargo clippy --workspace --all-targets -- -D warnings
```

Expected: 无 warnings

- [ ] **Step 10: Commit**

```bash
git add ai-digital-life/crates/types/src/types/git_visualization.rs ai-digital-life/crates/workspace/src/git/git_vis/hotspots.rs ai-digital-life/crates/workspace/src/git/git_vis/mod.rs ai-digital-life/crates/workspace/src/lib.rs ai-digital-life/src-tauri/src/commands/git_vis_cache.rs ai-digital-life/src-tauri/src/commands/workspace_git_vis.rs ai-digital-life/src-tauri/src/lib.rs
git commit -m "feat(rust): add file hotspots backend (types + aggregation + IPC)"
```

---

## Task 2: 前端 IPC 桥接层四端同步

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/workspace.ts`
- Modify: `ai-digital-life/frontend/src/tauri-bridge/tauri-workspace.ts`
- Modify: `ai-digital-life/frontend/src/preview-bridge/preview-git.ts`
- Modify: `ai-digital-life/frontend/dev/previewWorkspaceService/gitVisualization.ts`
- Modify: `ai-digital-life/frontend/dev/previewServer.ts`
- Modify: `ai-digital-life/frontend/src/mock/mock-workspace.ts`
- Modify: `ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts`

**Interfaces:**
- Consumes: `GitVisFileHotspots` Rust 类型（由 Task 1 的 `#[derive(TS)]` 生成）
- Produces: `WorkspaceBridge.gitVisFileHotspots(rootPath, since?, until?)` 方法；`fileHotspotsMockData` fixture

- [ ] **Step 1: 新增 test fixture**

Edit `ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts`，在文件末尾添加：

```typescript
/** 文件热点 mock 数据（tree + files 双结构） */
export const fileHotspotsMockData = {
  tree: {
    name: 'root',
    nodeType: 'directory',
    changeCount: 47,
    additions: 420,
    deletions: 180,
    lastModified: '2026-08-01',
    children: [
      {
        name: 'src',
        nodeType: 'directory',
        changeCount: 35,
        additions: 320,
        deletions: 150,
        lastModified: '2026-08-01',
        children: [
          {
            name: 'core',
            nodeType: 'directory',
            changeCount: 24,
            additions: 209,
            deletions: 75,
            lastModified: '2026-08-01',
            children: [
              {
                name: 'engine.ts',
                nodeType: 'file',
                changeCount: 24,
                additions: 120,
                deletions: 45,
                lastModified: '2026-07-31',
              },
            ],
          },
          {
            name: 'api',
            nodeType: 'directory',
            changeCount: 11,
            additions: 111,
            deletions: 75,
            lastModified: '2026-08-01',
            children: [
              {
                name: 'handler.ts',
                nodeType: 'file',
                changeCount: 18,
                additions: 89,
                deletions: 30,
                lastModified: '2026-07-30',
              },
            ],
          },
        ],
      },
      {
        name: 'tests',
        nodeType: 'directory',
        changeCount: 12,
        additions: 100,
        deletions: 30,
        lastModified: '2026-07-29',
        children: [
          {
            name: 'unit',
            nodeType: 'directory',
            changeCount: 12,
            additions: 100,
            deletions: 30,
            lastModified: '2026-07-29',
            children: [
              {
                name: 'engine.test.ts',
                nodeType: 'file',
                changeCount: 12,
                additions: 100,
                deletions: 30,
                lastModified: '2026-07-29',
              },
            ],
          },
        ],
      },
    ],
  },
  files: [
    {
      path: 'src/api/handler.ts',
      changeCount: 18,
      additions: 89,
      deletions: 30,
      lastModified: '2026-07-30',
    },
    {
      path: 'src/core/engine.ts',
      changeCount: 24,
      additions: 120,
      deletions: 45,
      lastModified: '2026-07-31',
    },
    {
      path: 'tests/unit/engine.test.ts',
      changeCount: 12,
      additions: 100,
      deletions: 30,
      lastModified: '2026-07-29',
    },
  ],
};
```

- [ ] **Step 2: 新增 TS 类型（若 ts-rs 未自动生成）**

检查 `ai-digital-life/frontend/src/shared/ipc/` 目录或 `bindings/` 目录是否已有 `GitVisFileHotspots` 类型。若没有，在 `ai-digital-life/frontend/src/shared/ipc/workspace.ts` 顶部（与其他 GitVis 类型一起）手动添加：

```typescript
export interface GitVisFileHotspotNode {
  name: string;
  nodeType: string;
  changeCount?: number;
  additions?: number;
  deletions?: number;
  lastModified?: string;
  children?: GitVisFileHotspotNode[];
}

export interface GitVisFileHotspotFile {
  path: string;
  changeCount: number;
  additions: number;
  deletions: number;
  lastModified: string;
}

export interface GitVisFileHotspots {
  tree: GitVisFileHotspotNode;
  files: GitVisFileHotspotFile[];
}
```

- [ ] **Step 3: 新增接口方法**

Edit `ai-digital-life/frontend/src/shared/ipc/workspace.ts`，在 `gitVisFileSunburst` 之后添加：

```typescript
  /** Get file hotspots (tree + flat files) based on git log --numstat */
  gitVisFileHotspots: (
    rootPath: string,
    since?: string,
    until?: string,
  ) => Promise<IpcResult<GitVisFileHotspots>>;
```

- [ ] **Step 4: 新增 tauri 实现**

Edit `ai-digital-life/frontend/src/tauri-bridge/tauri-workspace.ts`，在 `gitVisFileSunburst` 之后添加：

```typescript
    gitVisFileHotspots: (rootPath, since, until) =>
      invokeIpc<GitVisFileHotspots>('workspace_git_vis_file_hotspots', { rootPath, since, until }),
```

确保 `GitVisFileHotspots` 已在 imports 中导入。

- [ ] **Step 5: 新增 preview 实现**

Edit `ai-digital-life/frontend/src/preview-bridge/preview-git.ts`，在 `gitVisFileSunburst` 之后添加：

```typescript
    gitVisFileHotspots: async (rootPath: string, since?: string, until?: string) => {
      const params = new URLSearchParams({ rootPath });
      if (since) {
        params.set('since', since);
      }
      if (until) {
        params.set('until', until);
      }
      return requestPreviewApi<GitVisFileHotspots>(
        `/workspace/git-vis-file-hotspots?${params.toString()}`,
      );
    },
```

- [ ] **Step 6: 新增 preview 服务端 handler**

Edit `ai-digital-life/frontend/dev/previewWorkspaceService/gitVisualization.ts`，在文件末尾添加：

```typescript
export async function handleFileHotspots(
  rootPath: string,
  since?: string,
  until?: string,
): Promise<{ tree: unknown; files: unknown[] }> {
  const args = ['log', '--pretty=format:%H|%aI', '--numstat'];
  if (since) args.push(`--since=${since}`);
  if (until) args.push(`--until=${until}`);
  const raw = (await runGit(rootPath, args)) ?? '';

  interface FileAgg {
    changeCount: number;
    additions: number;
    deletions: number;
    lastModified: string;
  }
  const map = new Map<string, FileAgg>();
  let currentDate: string | null = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('\t');
    if (parts.length === 3) {
      const [addsRaw, delsRaw, path] = parts;
      if (!path) continue;
      const entry = map.get(path) ?? {
        changeCount: 0,
        additions: 0,
        deletions: 0,
        lastModified: '',
      };
      entry.changeCount += 1;
      entry.additions += addsRaw === '-' ? 0 : parseInt(addsRaw, 10) || 0;
      entry.deletions += delsRaw === '-' ? 0 : parseInt(delsRaw, 10) || 0;
      if (currentDate && (currentDate > entry.lastModified || !entry.lastModified)) {
        entry.lastModified = currentDate;
      }
      map.set(path, entry);
      continue;
    }

    const pipePos = trimmed.indexOf('|');
    if (pipePos >= 0) {
      const datePart = trimmed.slice(pipePos + 1);
      if (datePart.length >= 10) {
        const head = datePart.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
          currentDate = head;
        }
      }
    }
  }

  const files = Array.from(map.entries())
    .map(([path, agg]) => ({ path, ...agg }))
    .sort((a, b) => b.changeCount - a.changeCount || a.path.localeCompare(b.path));

  // Build tree (mirror Rust logic)
  interface TreeNode {
    name: string;
    nodeType: string;
    changeCount?: number;
    additions?: number;
    deletions?: number;
    lastModified?: string;
    children?: TreeNode[];
  }
  const root: TreeNode = {
    name: 'root',
    nodeType: 'directory',
    children: [],
  };

  const addToTree = (
    node: TreeNode,
    parts: string[],
    idx: number,
    file: (typeof files)[number],
  ) => {
    if (idx >= parts.length) return;
    const name = parts[idx];
    const isFile = idx === parts.length - 1;
    const nodeType = isFile ? 'file' : 'directory';
    node.children = node.children ?? [];
    const existing = node.children.find((c) => c.name === name && c.nodeType === nodeType);
    if (existing) {
      if (isFile) {
        existing.changeCount = file.changeCount;
        existing.additions = file.additions;
        existing.deletions = file.deletions;
        existing.lastModified = file.lastModified;
      } else {
        addToTree(existing, parts, idx + 1, file);
      }
    } else {
      const newNode: TreeNode = {
        name,
        nodeType,
        changeCount: isFile ? file.changeCount : undefined,
        additions: isFile ? file.additions : undefined,
        deletions: isFile ? file.deletions : undefined,
        lastModified: isFile ? file.lastModified : undefined,
        children: isFile ? undefined : [],
      };
      if (!isFile) addToTree(newNode, parts, idx + 1, file);
      node.children.push(newNode);
    }
  };

  for (const file of files) {
    addToTree(root, file.path.split('/'), 0, file);
  }

  // Aggregate directory stats post-order
  const aggregate = (node: TreeNode): void => {
    if (node.nodeType === 'file' || !node.children) return;
    let totalChange = 0;
    let totalAdd = 0;
    let totalDel = 0;
    let maxDate = '';
    for (const child of node.children) {
      aggregate(child);
      totalChange += child.changeCount ?? 0;
      totalAdd += child.additions ?? 0;
      totalDel += child.deletions ?? 0;
      if (child.lastModified && child.lastModified > maxDate) {
        maxDate = child.lastModified;
      }
    }
    node.changeCount = totalChange;
    node.additions = totalAdd;
    node.deletions = totalDel;
    if (maxDate) node.lastModified = maxDate;
  };
  aggregate(root);

  return { tree: root, files };
}
```

- [ ] **Step 7: 注册 preview 路由**

Edit `ai-digital-life/frontend/dev/previewServer.ts`，找到 `git-vis-file-sunburst` 路由注册处，添加：

```typescript
  if (url.pathname === '/workspace/git-vis-file-hotspots') {
    const rootPath = searchParams.get('rootPath') ?? '';
    const since = searchParams.get('since') ?? undefined;
    const until = searchParams.get('until') ?? undefined;
    const data = await handleFileHotspots(rootPath, since, until);
    return jsonRes(data);
  }
```

确保 `handleFileHotspots` 已从 `./previewWorkspaceService/gitVisualization` 导入。

- [ ] **Step 8: 新增 mock 实现**

Edit `ai-digital-life/frontend/src/mock/mock-workspace.ts`，在 `gitVisFileSunburst` 之后添加：

```typescript
  gitVisFileHotspots: async () => ({
    ok: true as const,
    data: fileHotspotsMockData,
  }),
```

确保 `fileHotspotsMockData` 已从 `@/test-fixtures/gitVisMockData` 导入。

- [ ] **Step 9: 类型检查**

Run:

```bash
cd ai-digital-life
pnpm --dir frontend run typecheck
```

Expected: 无错误

- [ ] **Step 10: Commit**

```bash
git add ai-digital-life/frontend/src/shared/ipc/workspace.ts ai-digital-life/frontend/src/tauri-bridge/tauri-workspace.ts ai-digital-life/frontend/src/preview-bridge/preview-git.ts ai-digital-life/frontend/dev/previewWorkspaceService/gitVisualization.ts ai-digital-life/frontend/dev/previewServer.ts ai-digital-life/frontend/src/mock/mock-workspace.ts ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts
git commit -m "feat(ipc): sync file hotspots bridge across 4 layers"
```

---

## Task 3: 前端适配器（adaptHotspotsTree + filterFilesByPath + computeArcFill）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`

**Interfaces:**
- Consumes: `GitVisFileHotspotNode` / `GitVisFileHotspotFile`（来自 Task 2 的类型）
- Produces: `adaptHotspotsTree(root, arcMetaMap)`、`filterFilesByPath(files, filterPath)`、`computeArcFill(meta, colorMode, allMetas)`

- [ ] **Step 1: 编写失败测试**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`，在文件末尾添加：

```typescript
import { adaptHotspotsTree, filterFilesByPath, computeArcFill } from '../chartDataAdapters';
import type { GitVisFileHotspotNode, GitVisFileHotspotFile } from '@/shared/ipc/workspace';

describe('adaptHotspotsTree', () => {
  const buildNode = (overrides: Partial<GitVisFileHotspotNode> = {}): GitVisFileHotspotNode => ({
    name: 'root',
    nodeType: 'directory',
    changeCount: 10,
    additions: 20,
    deletions: 5,
    lastModified: '2026-08-01',
    children: [],
    ...overrides,
  });

  it('filters out file leaves and keeps directories', () => {
    const root = buildNode({
      changeCount: 30,
      children: [
        buildNode({
          name: 'src',
          nodeType: 'directory',
          changeCount: 30,
          children: [
            buildNode({
              name: 'engine.ts',
              nodeType: 'file',
              changeCount: 24,
              children: undefined,
            }),
            buildNode({
              name: 'core',
              nodeType: 'directory',
              changeCount: 6,
              children: [
                buildNode({
                  name: 'lib.ts',
                  nodeType: 'file',
                  changeCount: 6,
                  children: undefined,
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const { tree, arcMeta } = adaptHotspotsTree(root, 'heat');

    // root + src + core (3 directories), engine.ts and lib.ts filtered out
    expect(tree.name).toBe('root');
    expect(tree.value).toBe(30);
    expect(tree.children).toHaveLength(1);
    expect(tree.children?.[0].name).toBe('src');
    expect(tree.children?.[0].children).toHaveLength(1);
    expect(tree.children?.[0].children?.[0].name).toBe('core');
    expect(tree.children?.[0].children?.[0].children).toEqual([]);

    // arcMeta should have entries for all directory nodes (root, src, core)
    expect(arcMeta.size).toBeGreaterThanOrEqual(3);
  });

  it('skips directories that become empty after filtering', () => {
    const root = buildNode({
      changeCount: 10,
      children: [
        buildNode({
          name: 'empty-dir',
          nodeType: 'directory',
          changeCount: 5,
          children: [
            buildNode({
              name: 'only-file.ts',
              nodeType: 'file',
              changeCount: 5,
              children: undefined,
            }),
          ],
        }),
      ],
    });

    const { tree } = adaptHotspotsTree(root, 'heat');
    // empty-dir's only child is a file, so after filtering empty-dir has empty children → skipped
    expect(tree.children).toEqual([]);
  });

  it('preserves root node even when all children are filtered', () => {
    const root = buildNode({
      changeCount: 0,
      children: [
        buildNode({ name: 'f.ts', nodeType: 'file', changeCount: 0, children: undefined }),
      ],
    });

    const { tree } = adaptHotspotsTree(root, 'heat');
    expect(tree.name).toBe('root');
    expect(tree.value).toBe(0);
    expect(tree.children).toEqual([]);
  });

  it('populates arcMeta with hotspot metadata', () => {
    const root = buildNode({
      changeCount: 30,
      children: [
        buildNode({
          name: 'src',
          nodeType: 'directory',
          changeCount: 30,
          additions: 100,
          deletions: 40,
          lastModified: '2026-08-01',
          children: [],
        }),
      ],
    });

    const { arcMeta } = adaptHotspotsTree(root, 'heat');
    const metas = Array.from(arcMeta.values());
    expect(metas.length).toBeGreaterThanOrEqual(2);
    const srcMeta = metas.find((m) => m.additions === 100);
    expect(srcMeta).toBeDefined();
    expect(srcMeta?.changeCount).toBe(30);
    expect(srcMeta?.lastModified).toBe('2026-08-01');
  });
});

describe('filterFilesByPath', () => {
  const files: GitVisFileHotspotFile[] = [
    { path: 'src/main.ts', changeCount: 10, additions: 20, deletions: 5, lastModified: '2026-08-01' },
    { path: 'src/core/engine.ts', changeCount: 8, additions: 15, deletions: 3, lastModified: '2026-07-31' },
    { path: 'tests/main.test.ts', changeCount: 5, additions: 10, deletions: 2, lastModified: '2026-07-30' },
  ];

  it('returns all files when filterPath is empty', () => {
    expect(filterFilesByPath(files, [])).toHaveLength(3);
  });

  it('filters by single-segment prefix', () => {
    const result = filterFilesByPath(files, ['src']);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('src/main.ts');
  });

  it('filters by multi-segment prefix', () => {
    const result = filterFilesByPath(files, ['src', 'core']);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/core/engine.ts');
  });

  it('returns empty array when no match', () => {
    expect(filterFilesByPath(files, ['nonexistent'])).toEqual([]);
  });
});

describe('computeArcFill', () => {
  const allMetas = [
    { changeCount: 0, additions: 0, deletions: 0, lastModified: null },
    { changeCount: 50, additions: 100, deletions: 20, lastModified: '2026-08-01' },
    { changeCount: 100, additions: 200, deletions: 50, lastModified: '2026-07-01' },
  ];

  it('returns color based on changeCount in heat mode', () => {
    const low = computeArcFill(allMetas[0], 'heat', allMetas);
    const high = computeArcFill(allMetas[2], 'heat', allMetas);
    expect(low).toBeTruthy();
    expect(high).toBeTruthy();
    // Low and high should differ (different heatmap levels)
    expect(low).not.toBe(high);
  });

  it('returns color based on lastModified in time mode', () => {
    const old = computeArcFill(allMetas[2], 'time', allMetas);
    const recent = computeArcFill(allMetas[1], 'time', allMetas);
    expect(old).toBeTruthy();
    expect(recent).toBeTruthy();
  });

  it('handles single-meta case (no division by zero)', () => {
    const single = [{ changeCount: 5, additions: 10, deletions: 2, lastModified: '2026-08-01' }];
    const color = computeArcFill(single[0], 'heat', single);
    expect(color).toBeTruthy();
  });

  it('handles null lastModified in time mode', () => {
    const meta = { changeCount: 5, additions: 10, deletions: 2, lastModified: null };
    const color = computeArcFill(meta, 'time', allMetas);
    expect(color).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:

```bash
cd ai-digital-life
pnpm --dir frontend exec vitest run src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts
```

Expected: FAIL — `adaptHotspotsTree is not defined` / `filterFilesByPath is not defined` / `computeArcFill is not defined`

- [ ] **Step 3: 实现适配器**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`，在文件末尾添加：

```typescript
// ============ File Hotspots Adapters ============

interface GitVisHotspotNodeInput {
  name: string;
  nodeType: string;
  changeCount?: number;
  additions?: number;
  deletions?: number;
  lastModified?: string;
  children?: GitVisHotspotNodeInput[];
}

interface HotspotArcMeta {
  changeCount: number;
  additions: number;
  deletions: number;
  lastModified: string | null;
}

let hotspotArcCounter = 0;

/**
 * Adapt hotspot tree for sunburst: filter out file leaves, keep only directories.
 * Returns the adapted tree + arcMeta Map (keyed by arc index) for tooltip/color.
 */
export function adaptHotspotsTree(
  root: GitVisHotspotNodeInput,
  _colorMode: 'heat' | 'time',
): { tree: SunburstNode; arcMeta: Map<number, HotspotArcMeta> } {
  const arcMeta = new Map<number, HotspotArcMeta>();
  hotspotArcCounter = 0;

  const mapNode = (n: GitVisHotspotNodeInput): SunburstNode | null => {
    // Skip file nodes
    if (n.nodeType === 'file') return null;

    const children = (n.children ?? [])
      .map(mapNode)
      .filter((c): c is SunburstNode => c !== null);

    // Skip directories that have no children after filtering
    if (children.length === 0 && n.name !== 'root') return null;

    const arcId = hotspotArcCounter++;
    arcMeta.set(arcId, {
      changeCount: n.changeCount ?? 0,
      additions: n.additions ?? 0,
      deletions: n.deletions ?? 0,
      lastModified: n.lastModified ?? null,
    });

    return {
      name: n.name,
      value: n.changeCount ?? 0,
      children: children.length > 0 ? children : undefined,
    };
  };

  const mapped = mapNode(root);
  const tree: SunburstNode = mapped ?? { name: 'root', value: 0, children: [] };
  return { tree, arcMeta };
}

/** Filter flat file list by path prefix (drill-down). */
export function filterFilesByPath(
  files: { path: string }[],
  filterPath: string[],
): { path: string }[] {
  if (filterPath.length === 0) return files;
  const prefix = `${filterPath.join('/')}/`;
  return files.filter((f) => f.path.startsWith(prefix));
}

/**
 * Compute fill color for an arc based on color mode.
 * Heat: changeCount normalized to [0, max] → heatmap color scale.
 * Time: lastModified timestamp normalized to [min, max] → heatmap color scale.
 */
export function computeArcFill(
  meta: HotspotArcMeta,
  colorMode: 'heat' | 'time',
  allMetas: HotspotArcMeta[],
): string {
  if (colorMode === 'heat') {
    const maxCount = allMetas.reduce((max, m) => Math.max(max, m.changeCount), 0);
    if (maxCount === 0) return 'var(--heatmap-level-2, #6b7280)';
    const level = Math.min(4, Math.floor((meta.changeCount / maxCount) * 5));
    return `var(--heatmap-level-${level}, #6b7280)`;
  }

  // time mode
  const timestamps = allMetas
    .map((m) => (m.lastModified ? Date.parse(m.lastModified) : 0))
    .filter((t) => !Number.isNaN(t));
  if (timestamps.length === 0) return 'var(--heatmap-level-2, #6b7280)';

  const minT = Math.min(...timestamps);
  const maxT = Math.max(...timestamps);
  if (maxT === minT) return 'var(--heatmap-level-2, #6b7280)';

  const currentT = meta.lastModified ? Date.parse(meta.lastModified) : 0;
  if (Number.isNaN(currentT)) return 'var(--heatmap-level-0, #1f2937)';

  const level = Math.min(4, Math.floor(((currentT - minT) / (maxT - minT)) * 5));
  return `var(--heatmap-level-${level}, #6b7280)`;
}
```

注意：需要确保 `SunburstNode` 已在文件顶部导入。若未导入，添加：

```typescript
import type { SunburstNode } from '@/components/charts/sunburst-chart';
```

- [ ] **Step 4: 运行测试验证通过**

Run:

```bash
pnpm --dir frontend exec vitest run src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts
```

Expected: 所有测试 PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts ai-digital-life/frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts
git commit -m "feat(adapters): add hotspot tree adapter, file filter, and arc fill"
```

---

## Task 4: SunburstSegment tooltipText + useFileHotspotsState hook

**Files:**
- Modify: `ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx`
- Modify: `ai-digital-life/frontend/src/components/charts/__tests__/sunburst-segment.test.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useFileHotspotsState.ts`

**Interfaces:**
- Produces: `SunburstSegmentProps.tooltipText` 可选 prop；`useFileHotspotsState()` 返回 `{ drillPath, setDrillPath, colorMode, setColorMode, sortKey, sortDir, setSort }`

- [ ] **Step 1: 编写 SunburstSegment tooltipText 失败测试**

Edit `ai-digital-life/frontend/src/components/charts/__tests__/sunburst-segment.test.tsx`，添加测试用例：

```typescript
  it('renders custom tooltipText when provided', () => {
    const tooltipText = 'src/core/\n变更: 24 次\n+120 / -45 行\n最近: 2026-07-31';
    const { container } = render(
      <SunburstChart data={mockData} size={200}>
        <SunburstSegment index={0} tooltipText={tooltipText} />
      </SunburstChart>,
    );
    const title = container.querySelector('title');
    expect(title?.textContent).toBe(tooltipText);
  });

  it('falls back to arc name when tooltipText is not provided', () => {
    const { container } = render(
      <SunburstChart data={mockData} size={200}>
        <SunburstSegment index={0} />
      </SunburstChart>,
    );
    const title = container.querySelector('title');
    expect(title?.textContent).toBe('child1');
  });
```

- [ ] **Step 2: 运行测试验证失败**

Run:

```bash
cd ai-digital-life
pnpm --dir frontend exec vitest run src/components/charts/__tests__/sunburst-segment.test.tsx
```

Expected: FAIL — tooltipText 测试失败（当前 `<title>` 只显示 `arc.name`）

- [ ] **Step 3: 实现 tooltipText prop**

Edit `ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx`。

在 `SunburstSegmentProps` 接口添加：

```typescript
export interface SunburstSegmentProps {
  index: number;
  color?: string;
  fill?: string;
  fillOpacity?: number;
  /** Optional custom tooltip text (overrides arc name). Multi-line via \n. */
  tooltipText?: string;
}
```

在渲染函数中找到 `<title>{arc.name}</title>`，替换为：

```tsx
<title>{tooltipText ?? arc.name}</title>
```

确保 `tooltipText` 从 props 解构。

- [ ] **Step 4: 运行测试验证通过**

Run:

```bash
pnpm --dir frontend exec vitest run src/components/charts/__tests__/sunburst-segment.test.tsx
```

Expected: PASS

- [ ] **Step 5: 创建 useFileHotspotsState hook**

Create `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useFileHotspotsState.ts`:

```typescript
import { useCallback, useState } from 'react';

export type HotspotColorMode = 'heat' | 'time';
export type RankingSortKey = 'changeCount' | 'additions' | 'deletions' | 'net';
export type SortDir = 'asc' | 'desc';

export interface FileHotspotsState {
  drillPath: string[];
  setDrillPath: (path: string[]) => void;
  colorMode: HotspotColorMode;
  setColorMode: (mode: HotspotColorMode) => void;
  sortKey: RankingSortKey;
  sortDir: SortDir;
  setSort: (key: RankingSortKey) => void;
}

export function useFileHotspotsState(): FileHotspotsState {
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [colorMode, setColorMode] = useState<HotspotColorMode>('heat');
  const [sortKey, setSortKey] = useState<RankingSortKey>('changeCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const setSort = useCallback(
    (key: RankingSortKey) => {
      if (key === sortKey) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    },
    [sortKey],
  );

  return {
    drillPath,
    setDrillPath,
    colorMode,
    setColorMode,
    sortKey,
    sortDir,
    setSort,
  };
}
```

- [ ] **Step 6: 类型检查**

Run:

```bash
pnpm --dir frontend run typecheck
```

Expected: 无错误

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx ai-digital-life/frontend/src/components/charts/__tests__/sunburst-segment.test.tsx ai-digital-life/frontend/src/app/features/git-visualization/hooks/useFileHotspotsState.ts
git commit -m "feat(charts): add tooltipText prop + useFileHotspotsState hook"
```

---

## Task 5: FileSunburstChart 改造（接入新数据源 + onDrill + colorMode）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx`

**Interfaces:**
- Consumes: `adaptHotspotsTree` / `computeArcFill`（Task 3）；`useFileHotspotsState`（Task 4）
- Produces: `FileSunburstChart` 组件（props: `data?: GitVisFileHotspots`, `colorMode`, `onDrill`, `zoomToRootRef`）

- [ ] **Step 1: 改造 FileSunburst.tsx**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx`，整体替换为：

```tsx
import React, { useMemo, useRef } from 'react';
import { SunburstChart } from '@/components/charts/sunburst-chart';
import type { ArcDatum, Focus, SunburstNode } from '@/components/charts/sunburst-chart';
import { SunburstSegment } from '@/components/charts/sunburst-segment';
import { SunburstCenter } from '@/components/charts/sunburst-center';
import {
  SunburstBreadcrumb,
  useSunburstBreadcrumbItems,
} from '@/components/charts/sunburst-breadcrumb';
import { SunburstHint } from '@/components/charts/sunburst-hint';
import { ModuleBreadcrumb } from '@/app/features/git-visualization/ModuleBreadcrumb';
import { adaptHotspotsTree, computeArcFill } from '../adapters/chartDataAdapters';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';
import type { HotspotColorMode } from '../hooks/useFileHotspotsState';
import { useTCopy } from '@i18n/useTCopy';

interface HotspotArcMeta {
  changeCount: number;
  additions: number;
  deletions: number;
  lastModified: string | null;
}

function countDescendants(node: SunburstNode): number {
  if (!node.children) return 0;
  let count = node.children.length;
  for (const child of node.children) {
    if (child.children) count += countDescendants(child);
  }
  return count;
}

function FileSunburstBreadcrumbContent() {
  const { items, zoomTo } = useSunburstBreadcrumbItems();
  if (items.length <= 1) return null;
  const pathSegments = items.slice(1).map((it) => it.label);
  const handleNavigate = (level: number) => {
    const targetIndex = level === -1 ? 0 : level + 1;
    const target = items[targetIndex];
    if (target) zoomTo(target.id);
  };
  return <ModuleBreadcrumb pathSegments={pathSegments} onNavigate={handleNavigate} />;
}

interface FileSunburstHintTextProps {
  hoveredArc: ArcDatum | null;
  focus: Focus;
  arcMeta: Map<number, HotspotArcMeta>;
}

function FileSunburstHintText({ hoveredArc, focus, arcMeta }: FileSunburstHintTextProps) {
  const { t } = useTCopy();
  const text = (() => {
    if (hoveredArc) {
      const meta = arcMeta.get(hoveredArc.index);
      if (meta) {
        const trail = hoveredArc.trail.join('  ›  ');
        return `${trail}  ·  ${meta.changeCount} ${t.gitVisHotspotsTooltipChanges?.replace('{count}', '') ?? ''}`;
      }
      return hoveredArc.trail.join('  ›  ');
    }
    if (focus.depth > 0) return t.gitVisSunburstHintZoomOut;
    return t.gitVisSunburstHintZoomIn;
  })();
  return (
    <div className="adl-file-sunburst-hint" style={{ minHeight: 20 }}>
      {text}
    </div>
  );
}

export interface FileSunburstChartProps {
  data?: GitVisFileHotspots;
  colorMode: HotspotColorMode;
  onDrill?: (path: string[]) => void;
  zoomToRootRef?: React.MutableRefObject<(() => void) | null>;
}

export const FileSunburstChart = React.memo(function FileSunburstChart({
  data,
  colorMode,
  onDrill,
  zoomToRootRef,
}: FileSunburstChartProps) {
  const { tree: treeData, arcMeta } = useMemo(() => {
    if (!data?.tree) return { tree: null, arcMeta: new Map<number, HotspotArcMeta>() };
    return adaptHotspotsTree(data.tree, colorMode);
  }, [data, colorMode]);

  const allMetas = useMemo(() => Array.from(arcMeta.values()), [arcMeta]);

  const { items, zoomTo } = useSunburstBreadcrumbItems();

  // Wire zoomToRootRef for parent to call
  React.useEffect(() => {
    if (zoomToRootRef) {
      zoomToRootRef.current = () => {
        if (items.length > 0) zoomTo(items[0].id);
      };
    }
  }, [zoomToRootRef, zoomTo, items]);

  // Notify parent when drill path changes
  React.useEffect(() => {
    if (!onDrill) return;
    const path = items.slice(1).map((it) => it.label);
    onDrill(path);
  }, [items, onDrill]);

  const segments = useMemo(() => {
    if (!treeData) return [];
    const n = countDescendants(treeData);
    return Array.from({ length: n }, (_, i) => {
      const meta = arcMeta.get(i);
      const fill = meta ? computeArcFill(meta, colorMode, allMetas) : undefined;
      const tooltipText = meta
        ? `${treeData.name}\n${meta.changeCount} changes\n+${meta.additions} / -${meta.deletions}\n${meta.lastModified ?? ''}`
        : undefined;
      return <SunburstSegment key={i} index={i} fill={fill} tooltipText={tooltipText} />;
    });
  }, [treeData, arcMeta, allMetas, colorMode]);

  if (!treeData) {
    return (
      <div
        className="adl-git-vis__chart"
        style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: 16 }}
      />
    );
  }

  return (
    <div
      className="adl-git-vis__chart adl-file-sunburst--hotspots"
      style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
    >
      <SunburstChart data={treeData} size={320}>
        <SunburstBreadcrumb className="adl-file-sunburst-breadcrumb">
          <FileSunburstBreadcrumbContent />
        </SunburstBreadcrumb>
        <SunburstCenter />
        {segments}
        <SunburstHint>
          {({ hoveredArc, focus }) => (
            <FileSunburstHintText
              hoveredArc={hoveredArc}
              focus={focus}
              arcMeta={arcMeta}
            />
          )}
        </SunburstHint>
      </SunburstChart>
    </div>
  );
});
```

- [ ] **Step 2: 更新 FileSunburst.test.tsx**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx`，更新测试以匹配新组件名和 props。把数据源从 `adaptSunburstData` 的输入改为 `GitVisFileHotspots` 结构：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FileSunburstChart } from './FileSunburst';
import { fileHotspotsMockData } from '@/test-fixtures/gitVisMockData';

// Mock motion to avoid animation issues in tests
vi.mock('motion/react', () => ({
  motion: {
    g: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <g {...(props as React.SVGProps<SVGGElement>)}>{children}</g>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe('FileSunburstChart', () => {
  it('renders without crashing with hotspot data', () => {
    const { container } = render(
      <FileSunburstChart data={fileHotspotsMockData} colorMode="heat" />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders empty state when data is undefined', () => {
    const { container } = render(<FileSunburstChart colorMode="heat" />);
    expect(container.querySelector('svg')).toBeFalsy();
  });

  it('calls onDrill with path when focus changes', () => {
    const onDrill = vi.fn();
    render(
      <FileSunburstChart
        data={fileHotspotsMockData}
        colorMode="heat"
        onDrill={onDrill}
      />,
    );
    // Initial mount calls onDrill with empty path (root)
    expect(onDrill).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 3: 运行测试**

Run:

```bash
cd ai-digital-life
pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/FileSunburst.test.tsx
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx
git commit -m "feat(charts): refactor FileSunburst to FileSunburstChart with hotspot data"
```

---

## Task 6: FileHotspotsRanking 排行榜组件

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsRanking.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsRanking.test.tsx`

**Interfaces:**
- Consumes: `GitVisFileHotspotFile`；`RankingSortKey` / `SortDir`（来自 Task 4 的 hook 类型）；`filterFilesByPath`（Task 3）
- Produces: `FileHotspotsRanking` 组件

- [ ] **Step 1: 编写失败测试**

Create `ai-digital-life/frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsRanking.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileHotspotsRanking } from '../FileHotspotsRanking';
import type { GitVisFileHotspotFile } from '@/shared/ipc/workspace';
import type { RankingSortKey, SortDir } from '../../hooks/useFileHotspotsState';

// Mock i18n
vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisHotspotsRankingFile: 'File',
      gitVisHotspotsRankingChangeCount: 'Changes',
      gitVisHotspotsRankingAdditions: 'Added',
      gitVisHotspotsRankingDeletions: 'Deleted',
      gitVisHotspotsRankingNet: 'Net',
      gitVisHotspotsRankingEmpty: 'No changed files in this directory',
      gitVisHotspotsFilterClear: 'Clear filter',
    },
  }),
}));

const files: GitVisFileHotspotFile[] = [
  { path: 'src/main.ts', changeCount: 10, additions: 20, deletions: 5, lastModified: '2026-08-01' },
  { path: 'src/core/engine.ts', changeCount: 8, additions: 15, deletions: 3, lastModified: '2026-07-31' },
  { path: 'tests/main.test.ts', changeCount: 5, additions: 10, deletions: 2, lastModified: '2026-07-30' },
];

const sortState = (overrides: Partial<{ sortKey: RankingSortKey; sortDir: SortDir }> = {}) => ({
  sortKey: overrides.sortKey ?? ('changeCount' as RankingSortKey),
  sortDir: overrides.sortDir ?? ('desc' as SortDir),
  onSort: vi.fn(),
});

describe('FileHotspotsRanking', () => {
  it('renders file rows', () => {
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={[]}
        onClearFilter={vi.fn()}
        sortState={sortState()}
      />,
    );
    expect(screen.getByText('src/main.ts')).toBeTruthy();
    expect(screen.getByText('src/core/engine.ts')).toBeTruthy();
    expect(screen.getByText('tests/main.test.ts')).toBeTruthy();
  });

  it('filters files by filterPath', () => {
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={['src']}
        onClearFilter={vi.fn()}
        sortState={sortState()}
      />,
    );
    expect(screen.getByText('main.ts')).toBeTruthy();
    expect(screen.getByText('core/engine.ts')).toBeTruthy();
    expect(screen.queryByText('tests/main.test.ts')).toBeFalsy();
  });

  it('shows clear filter button when filterPath is non-empty', () => {
    const onClearFilter = vi.fn();
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={['src']}
        onClearFilter={onClearFilter}
        sortState={sortState()}
      />,
    );
    const clearBtn = screen.getByText('Clear filter');
    fireEvent.click(clearBtn);
    expect(onClearFilter).toHaveBeenCalled();
  });

  it('shows empty state when no files match filter', () => {
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={['nonexistent']}
        onClearFilter={vi.fn()}
        sortState={sortState()}
      />,
    );
    expect(screen.getByText('No changed files in this directory')).toBeTruthy();
  });

  it('calls onSort when clicking sortable column header', () => {
    const onSort = vi.fn();
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={[]}
        onClearFilter={vi.fn()}
        sortState={{ sortKey: 'changeCount', sortDir: 'desc', onSort }}
      />,
    );
    fireEvent.click(screen.getByText('Added'));
    expect(onSort).toHaveBeenCalledWith('additions');
  });

  it('sorts by net change when sortKey is net', () => {
    const sortedFiles: GitVisFileHotspotFile[] = [
      { path: 'a.ts', changeCount: 1, additions: 100, deletions: 10, lastModified: '2026-08-01' },
      { path: 'b.ts', changeCount: 1, additions: 5, deletions: 50, lastModified: '2026-08-01' },
    ];
    render(
      <FileHotspotsRanking
        files={sortedFiles}
        filterPath={[]}
        onClearFilter={vi.fn()}
        sortState={sortState({ sortKey: 'net', sortDir: 'desc' })}
      />,
    );
    // a.ts (net=90) should come before b.ts (net=-45)
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('a.ts');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:

```bash
cd ai-digital-life
pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/__tests__/FileHotspotsRanking.test.tsx
```

Expected: FAIL — `FileHotspotsRanking is not defined`

- [ ] **Step 3: 实现 FileHotspotsRanking**

Create `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsRanking.tsx`:

```tsx
import React, { useMemo, useRef, useState } from 'react';
import type { GitVisFileHotspotFile } from '@/shared/ipc/workspace';
import type { RankingSortKey, SortDir } from '../hooks/useFileHotspotsState';
import { filterFilesByPath } from '../adapters/chartDataAdapters';
import { ModuleBreadcrumb } from '../ModuleBreadcrumb';
import { useTCopy } from '@i18n/useTCopy';
import { EmptyRow } from '@/components/LoadingRow';

const ROW_HEIGHT = 32;
const OVERSCAN = 5;
const MAX_HEIGHT = 320;

export interface RankingSortState {
  sortKey: RankingSortKey;
  sortDir: SortDir;
  onSort: (key: RankingSortKey) => void;
}

export interface FileHotspotsRankingProps {
  files: GitVisFileHotspotFile[];
  filterPath: string[];
  onClearFilter: () => void;
  sortState: RankingSortState;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function getRelativePath(path: string, filterPath: string[]): string {
  if (filterPath.length === 0) return path;
  const prefix = `${filterPath.join('/')}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function getSortValue(file: GitVisFileHotspotFile, key: RankingSortKey): number {
  switch (key) {
    case 'changeCount':
      return file.changeCount;
    case 'additions':
      return file.additions;
    case 'deletions':
      return file.deletions;
    case 'net':
      return file.additions - file.deletions;
  }
}

export const FileHotspotsRanking = React.memo(function FileHotspotsRanking({
  files,
  filterPath,
  onClearFilter,
  sortState,
}: FileHotspotsRankingProps) {
  const { t } = useTCopy();
  const { sortKey, sortDir, onSort } = sortState;
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(MAX_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterFilesByPath(files, filterPath), [files, filterPath]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const diff = getSortValue(a, sortKey) - getSortValue(b, sortKey);
      return sortDir === 'desc' ? -diff : diff;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const { startIndex, endIndex } = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    return { startIndex: start, endIndex: Math.min(sorted.length, start + visibleCount) };
  }, [scrollTop, containerHeight, sorted.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
    }
  };

  const handleNavigate = (level: number) => {
    // Breadcrumb navigation handled by parent via onClearFilter for simplicity
    if (level === -1) onClearFilter();
  };

  if (sorted.length === 0) {
    return (
      <div className="adl-file-hotspots-ranking">
        {filterPath.length > 0 && (
          <div className="adl-file-hotspots-ranking__filter-bar">
            <ModuleBreadcrumb pathSegments={filterPath} onNavigate={handleNavigate} />
            <button
              className="adl-file-hotspots-ranking__clear-btn"
              onClick={onClearFilter}
              aria-label={t.gitVisHotspotsFilterClear}
            >
              ×
            </button>
          </div>
        )}
        <EmptyRow>{t.gitVisHotspotsRankingEmpty}</EmptyRow>
      </div>
    );
  }

  const visibleRows = sorted.slice(startIndex, endIndex);
  const totalHeight = sorted.length * ROW_HEIGHT;
  const offsetY = startIndex * ROW_HEIGHT;

  return (
    <div className="adl-file-hotspots-ranking">
      {filterPath.length > 0 && (
        <div className="adl-file-hotspots-ranking__filter-bar">
          <ModuleBreadcrumb pathSegments={filterPath} onNavigate={handleNavigate} />
          <button
            className="adl-file-hotspots-ranking__clear-btn"
            onClick={onClearFilter}
            aria-label={t.gitVisHotspotsFilterClear}
          >
            ×
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="adl-file-hotspots-ranking__scroll"
        style={{ maxHeight: MAX_HEIGHT, overflowY: 'auto' }}
        onScroll={handleScroll}
        role="table"
      >
        <div className="adl-file-hotspots-ranking__header" role="row">
          <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--rank">#</span>
          <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--file">
            {t.gitVisHotspotsRankingFile}
          </span>
          <button
            className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
            onClick={() => onSort('changeCount')}
          >
            {t.gitVisHotspotsRankingChangeCount}
            {sortKey === 'changeCount' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button
            className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
            onClick={() => onSort('additions')}
          >
            {t.gitVisHotspotsRankingAdditions}
            {sortKey === 'additions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button
            className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
            onClick={() => onSort('deletions')}
          >
            {t.gitVisHotspotsRankingDeletions}
            {sortKey === 'deletions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button
            className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
            onClick={() => onSort('net')}
          >
            {t.gitVisHotspotsRankingNet}
            {sortKey === 'net' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
          </button>
        </div>
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleRows.map((file, i) => {
              const rank = startIndex + i + 1;
              const net = file.additions - file.deletions;
              const relativePath = getRelativePath(file.path, filterPath);
              return (
                <div
                  key={file.path}
                  className="adl-file-hotspots-ranking__row"
                  role="row"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--rank">
                    {rank}
                  </span>
                  <span
                    className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--file"
                    title={file.path}
                  >
                    {relativePath}
                  </span>
                  <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num">
                    {formatNumber(file.changeCount)}
                  </span>
                  <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--add">
                    +{formatNumber(file.additions)}
                  </span>
                  <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--del">
                    -{formatNumber(file.deletions)}
                  </span>
                  <span
                    className={`adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num ${
                      net > 0
                        ? 'adl-file-hotspots-ranking__cell--add'
                        : net < 0
                          ? 'adl-file-hotspots-ranking__cell--del'
                          : 'adl-file-hotspots-ranking__cell--zero'
                    }`}
                  >
                    {net > 0 ? '+' : ''}{formatNumber(net)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 4: 运行测试验证通过**

Run:

```bash
pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/__tests__/FileHotspotsRanking.test.tsx
```

Expected: 所有测试 PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsRanking.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsRanking.test.tsx
git commit -m "feat(charts): add FileHotspotsRanking with virtual scroll and sort"
```

---

## Task 7: FileHotspotsView 组合容器 + GitVisualizationView 集成

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/chartIds.ts`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useChartData.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/gitVisSlice.ts`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx`

**Interfaces:**
- Consumes: `FileSunburstChart`（Task 5）；`FileHotspotsRanking`（Task 6）；`useFileHotspotsState`（Task 4）
- Produces: `FileHotspotsView` 组件；`CHART_IDS.FILE_HOTSPOTS`；`fetchChartData` 新分支

- [ ] **Step 1: 新增 CHART_IDS.FILE_HOTSPOTS**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/chartIds.ts`:

```typescript
export const CHART_IDS = {
  BRANCH_GRAPH: 'branch-graph',
  CODE_LINE_EVO: 'code-line-evolution',
  COMMIT_TIMELINE: 'commit-timeline',
  FILE_HOTSPOTS: 'file-hotspots',
  FILE_SUNBURST: 'file-sunburst',
  HEATMAP: 'heatmap',
  CONTRIBUTOR_MODULES: 'contributor-modules',
} as const;
```

- [ ] **Step 2: useChartData 加入 TIME_RANGE_CHARTS**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useChartData.ts`，修改 `TIME_RANGE_CHARTS`:

```typescript
const TIME_RANGE_CHARTS = new Set<string>([
  CHART_IDS.HEATMAP,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
  CHART_IDS.CONTRIBUTOR_MODULES,
  CHART_IDS.FILE_HOTSPOTS,
]);
```

- [ ] **Step 3: fetchChartData 新增 FILE_HOTSPOTS 分支**

Edit `ai-digital-life/frontend/src/app/stores/slices/gitVisSlice.ts`，找到 `fetchChartData` 函数中的路由表（类似 `switch (chartId)` 或 `if` 链），在 `FILE_SUNBURST` 分支旁添加：

```typescript
    if (chartId === CHART_IDS.FILE_HOTSPOTS) {
      const result = await bridge.gitVisFileHotspots(rootPath, since ?? undefined, until ?? undefined);
      if (!result.ok) {
        captureTypedError(get, result.error);
        return;
      }
      set({ gitVisFileHotspots: result.data });
      return;
    }
```

确保 `gitVisFileHotspots` 字段已添加到 `StoreState`（参考 `gitVisFileSunburst` 字段的位置，紧随其后添加）。同时导入 `CHART_IDS` 和 `GitVisFileHotspots` 类型。

- [ ] **Step 4: 创建 FileHotspotsView**

Create `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx`:

```tsx
import React, { useCallback, useRef } from 'react';
import { FileSunburstChart } from './FileSunburst';
import { FileHotspotsRanking } from './FileHotspotsRanking';
import { useFileHotspotsState } from '../hooks/useFileHotspotsState';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';

export interface FileHotspotsViewProps {
  data?: GitVisFileHotspots;
}

export const FileHotspotsView = React.memo(function FileHotspotsView({ data }: FileHotspotsViewProps) {
  const state = useFileHotspotsState();
  const { drillPath, setDrillPath, colorMode, sortKey, sortDir, setSort } = state;
  const zoomToRootRef = useRef<(() => void) | null>(null);

  const handleDrill = useCallback(
    (path: string[]) => {
      setDrillPath(path);
    },
    [setDrillPath],
  );

  const handleClearFilter = useCallback(() => {
    setDrillPath([]);
    zoomToRootRef.current?.();
  }, [setDrillPath]);

  return (
    <div className="adl-file-hotspots-view">
      <FileSunburstChart
        data={data}
        colorMode={colorMode}
        onDrill={handleDrill}
        zoomToRootRef={zoomToRootRef}
      />
      <FileHotspotsRanking
        files={data?.files ?? []}
        filterPath={drillPath}
        onClearFilter={handleClearFilter}
        sortState={{ sortKey, sortDir, onSort: setSort }}
      />
    </div>
  );
});
```

- [ ] **Step 5: 编写 FileHotspotsView 测试**

Create `ai-digital-life/frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileHotspotsView } from '../FileHotspotsView';
import { fileHotspotsMockData } from '@/test-fixtures/gitVisMockData';

vi.mock('motion/react', () => ({
  motion: {
    g: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <g {...(props as React.SVGProps<SVGGElement>)}>{children}</g>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisHotspotsRankingFile: 'File',
      gitVisHotspotsRankingChangeCount: 'Changes',
      gitVisHotspotsRankingAdditions: 'Added',
      gitVisHotspotsRankingDeletions: 'Deleted',
      gitVisHotspotsRankingNet: 'Net',
      gitVisHotspotsRankingEmpty: 'No changed files',
      gitVisHotspotsFilterClear: 'Clear',
      gitVisSunburstHintZoomIn: 'Click to drill',
      gitVisSunburstHintZoomOut: 'Click center to zoom out',
      gitVisHotspotsTooltipChanges: '{count} changes',
    },
  }),
}));

describe('FileHotspotsView', () => {
  it('renders both sunburst and ranking', () => {
    const { container } = render(<FileHotspotsView data={fileHotspotsMockData} />);
    // Sunburst renders an SVG
    expect(container.querySelector('svg')).toBeTruthy();
    // Ranking renders file paths
    expect(screen.getByText('src/api/handler.ts')).toBeTruthy();
  });

  it('renders empty state when data is undefined', () => {
    const { container } = render(<FileHotspotsView />);
    // No SVG when no data
    expect(container.querySelector('svg')).toBeFalsy();
  });
});
```

- [ ] **Step 6: 修改 GitVisualizationView 集成**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx`。

找到 `FileSunburst` 的导入，替换为 `FileHotspotsView`:

```typescript
import { FileHotspotsView } from './charts/FileHotspotsView';
```

找到 `fileSunburstData` 的 `useChartData` 调用，新增 `fileHotspotsData`:

```typescript
  const fileHotspotsData = useChartData(CHART_IDS.FILE_HOTSPOTS);
```

找到 `FileSunburst` 卡片的 `TimeRangeAwareCard` 块，替换为：

```tsx
        <TimeRangeAwareCard
          title={t.gitVisFileHotspotsTitle}
          desc={t.gitVisFileHotspotsDesc}
          onRefresh={handleRefreshFileHotspots}
          refreshLabel={t.gitVisRefreshChart}
          timeRange={fileHotspotsData}
          yearBounds={yearBounds}
        >
          {fileHotspotsData.loading ? null : <FileHotspotsView data={fileHotspotsData.data} />}
        </TimeRangeAwareCard>
```

找到 `handleRefreshFileSunburst` 函数，新增 `handleRefreshFileHotspots`:

```typescript
  const handleRefreshFileHotspots = useCallback(async () => {
    await refreshChart(CHART_IDS.FILE_HOTSPOTS);
  }, [refreshChart]);
```

注意：保留原 `FileSunburst` 卡片和 `handleRefreshFileSunburst`（避免破坏现有测试），在它下方新增 `FileHotspotsView` 卡片。或根据需求决定是否移除旧卡片——本计划保留旧卡片，让用户在 UI 上自行验证后删除。

- [ ] **Step 7: 运行测试**

Run:

```bash
cd ai-digital-life
pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx
```

Expected: PASS

- [ ] **Step 8: 类型检查**

Run:

```bash
pnpm --dir frontend run typecheck
```

Expected: 无错误

- [ ] **Step 9: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/chartIds.ts ai-digital-life/frontend/src/app/features/git-visualization/hooks/useChartData.ts ai-digital-life/frontend/src/app/stores/slices/gitVisSlice.ts ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx
git commit -m "feat(charts): add FileHotspotsView container and integrate into GitVisualizationView"
```

---

## Task 8: i18n + CSS + 最终验收

**Files:**
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts`
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css`

- [ ] **Step 1: 新增 zh-CN i18n key**

Edit `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts`，在 `gitVisSunburstHintZoomOut` 之后添加：

```typescript
  gitVisFileHotspotsTitle: '文件修改热度',
  gitVisFileHotspotsDesc:
    '上方旭日图展示模块分布（面积=变更次数，颜色=热度/时间），下方排行榜列出所有变更文件，点击扇形可筛选对应模块的文件',
  gitVisHotspotsColorModeHeat: '热度色阶',
  gitVisHotspotsColorModeTime: '时间色阶',
  gitVisHotspotsRankingFile: '文件',
  gitVisHotspotsRankingChangeCount: '变更次数',
  gitVisHotspotsRankingAdditions: '新增',
  gitVisHotspotsRankingDeletions: '删除',
  gitVisHotspotsRankingNet: '净变化',
  gitVisHotspotsRankingEmpty: '该目录下无变更文件',
  gitVisHotspotsFilterClear: '清除筛选',
  gitVisHotspotsNoDirectoryChanges: '无目录级变更',
  gitVisHotspotsTooltipChanges: '变更 {count} 次',
  gitVisHotspotsTooltipLines: '+{add} / -{del} 行',
  gitVisHotspotsTooltipLastModified: '最近 {date}',
```

- [ ] **Step 2: 新增 en-US i18n key**

Edit `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts`，添加对应英文：

```typescript
  gitVisFileHotspotsTitle: 'File Modification Hotspots',
  gitVisFileHotspotsDesc:
    'Sunburst above shows module distribution (area = change count, color = heat/time). Ranking below lists all changed files; click an arc to filter by module',
  gitVisHotspotsColorModeHeat: 'Heat color scale',
  gitVisHotspotsColorModeTime: 'Time color scale',
  gitVisHotspotsRankingFile: 'File',
  gitVisHotspotsRankingChangeCount: 'Changes',
  gitVisHotspotsRankingAdditions: 'Added',
  gitVisHotspotsRankingDeletions: 'Deleted',
  gitVisHotspotsRankingNet: 'Net',
  gitVisHotspotsRankingEmpty: 'No changed files in this directory',
  gitVisHotspotsFilterClear: 'Clear filter',
  gitVisHotspotsNoDirectoryChanges: 'No directory-level changes',
  gitVisHotspotsTooltipChanges: '{count} changes',
  gitVisHotspotsTooltipLines: '+{add} / -{del} lines',
  gitVisHotspotsTooltipLastModified: 'Last modified {date}',
```

- [ ] **Step 3: 新增 CSS 样式**

Edit `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css`，在文件末尾添加：

```css
/* ============ File Hotspots Combined View ============ */

.adl-file-hotspots-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.adl-file-hotspots-view .adl-file-sunburst--hotspots {
  padding: var(--space-2);
}

.adl-file-hotspots-ranking {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-default);
  padding-top: var(--space-2);
}

.adl-file-hotspots-ranking__filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  margin-bottom: var(--space-1);
  background: var(--bg-subtle);
  border-radius: var(--radius-sm);
}

.adl-file-hotspots-ranking__clear-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--text-lg);
  line-height: 1;
  padding: 0 var(--space-1);
}

.adl-file-hotspots-ranking__clear-btn:hover {
  color: var(--text-primary);
}

.adl-file-hotspots-ranking__scroll {
  font-size: var(--text-xs);
  color: var(--text-primary);
}

.adl-file-hotspots-ranking__header,
.adl-file-hotspots-ranking__row {
  display: grid;
  grid-template-columns: 40px 1fr 80px 70px 70px 80px;
  align-items: center;
  padding: 0 var(--space-2);
}

.adl-file-hotspots-ranking__header {
  position: sticky;
  top: 0;
  background: var(--bg-default);
  border-bottom: 1px solid var(--border-default);
  font-weight: 600;
  color: var(--text-muted);
  z-index: 1;
}

.adl-file-hotspots-ranking__row {
  border-bottom: 1px solid var(--border-subtle);
  height: 32px;
}

.adl-file-hotspots-ranking__row:hover {
  background: var(--bg-hover);
}

.adl-file-hotspots-ranking__cell {
  padding: 0 var(--space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adl-file-hotspots-ranking__cell--rank {
  text-align: right;
  color: var(--text-muted);
}

.adl-file-hotspots-ranking__cell--file {
  text-align: left;
  direction: rtl;
}

.adl-file-hotspots-ranking__cell--file > * {
  direction: ltr;
  unicode-bidi: plaintext;
}

.adl-file-hotspots-ranking__cell--num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.adl-file-hotspots-ranking__cell--add {
  color: var(--success);
}

.adl-file-hotspots-ranking__cell--del {
  color: var(--danger);
}

.adl-file-hotspots-ranking__cell--zero {
  color: var(--text-muted);
}

.adl-file-hotspots-ranking__sort-btn {
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: right;
  padding: var(--space-1);
}

.adl-file-hotspots-ranking__sort-btn:hover {
  color: var(--text-primary);
}
```

- [ ] **Step 4: ESLint 修复**

Run:

```bash
cd ai-digital-life
pnpm --dir frontend run lint:fix
```

Expected: 自动修复格式问题

- [ ] **Step 5: Prettier 格式化**

Run:

```bash
pnpm --dir frontend run format
```

- [ ] **Step 6: 类型检查**

Run:

```bash
pnpm --dir frontend run typecheck
```

Expected: 无错误

- [ ] **Step 7: 前端全量测试**

Run:

```bash
pnpm --dir frontend run test
```

Expected: 所有测试 PASS（含原有测试无回归）

- [ ] **Step 8: Rust 格式化 + clippy + 测试**

Run (设置 PATH 后):

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace
```

Expected: 全部通过

- [ ] **Step 9: Commit**

```bash
git add ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts ai-digital-life/frontend/src/app/i18n/en-US/changes.ts ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "feat(i18n,css): add hotspots i18n keys and ranking styles"
```

- [ ] **Step 10: 最终验收**

确认所有验收标准达成：

- [ ] 后端 `workspace_git_vis_file_hotspots` 正确返回 `tree` + `files`，时间范围过滤生效
- [ ] 旭日图只渲染目录节点，扇形面积=变更次数，颜色按热度/时间映射
- [ ] 排行榜显示所有变更文件，支持 4 列排序，虚拟滚动正常
- [ ] 点击旭日图扇形 → 排行榜筛选对应模块；点击 [X 清除] → 旭日图回根
- [ ] 颜色模式切换器在热度/时间色阶间切换（注：颜色模式切换 UI 在本计划中未实现按钮，需后续补充或由 Task 7 的 headerExtra 接入）
- [ ] 三端（Tauri / Preview / Mock）IPC 实现对齐
- [ ] i18n 全覆盖（zh-CN + en-US 同步）
- [ ] 所有测试通过
- [ ] ESLint / Prettier / Clippy / rustfmt 通过
- [ ] TypeScript 类型检查通过

---

## Self-Review Checklist

**Spec coverage:**
- [x] 后端数据模型（Section 2）→ Task 1
- [x] IPC 桥接四端同步（Section 6.1）→ Task 2
- [x] 旭日图适配层（Section 4.1-4.3）→ Task 3
- [x] SunburstSegment tooltipText（Section 4.3）→ Task 4
- [x] useFileHotspotsState（Section 3.3）→ Task 4
- [x] FileSunburstChart 改造（Section 4.4-4.5）→ Task 5
- [x] FileHotspotsRanking 排行榜（Section 5）→ Task 6
- [x] FileHotspotsView 组合容器（Section 3.1-3.4）→ Task 7
- [x] chartIds + useChartData + gitVisSlice（Section 6.2）→ Task 7
- [x] i18n（Section 7.1）→ Task 8
- [x] CSS（Section 7.2）→ Task 8
- [x] 测试策略（Section 8）→ 各 Task 内嵌
- [ ] 颜色模式切换器 UI（Section 3.5）→ **未在计划中实现**，需用户确认是否纳入本轮

**Placeholder scan:** 无 TBD/TODO，所有步骤含完整代码

**Type consistency:**
- `GitVisFileHotspots` / `GitVisFileHotspotNode` / `GitVisFileHotspotFile` — 跨 Task 1-7 一致
- `adaptHotspotsTree` / `filterFilesByPath` / `computeArcFill` — Task 3 定义，Task 5 消费
- `useFileHotspotsState` 返回类型 — Task 4 定义，Task 6/7 消费
- `FileSunburstChart` props — Task 5 定义，Task 7 消费
- `FileHotspotsRanking` props — Task 6 定义，Task 7 消费

**已知缺口（需用户决策）:**
1. **颜色模式切换器按钮 UI** 未在计划中实现（设计文档 Section 3.5 提到放 `headerExtra`，但本计划未包含按钮组件实现）。建议作为后续小任务补充，或在本轮 Task 7 中追加。
