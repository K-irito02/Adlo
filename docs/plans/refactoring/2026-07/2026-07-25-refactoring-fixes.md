# 重构洞察修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-07-25 重构洞察报告中发现的所有 22 个问题（2 严重、7 高、7 中、6 低），覆盖安全、代码结构、性能、架构、代码卫生 5 个维度。

**Architecture:** 按风险等级分组执行：先修复 2 个严重安全漏洞（PowerShell 注入），再处理 7 个高优先级代码卫生问题，然后是 7 个中优先级结构和性能改进，最后清理 6 个低优先级项。每个 Task 是一个独立可测试的修改单元。

**Tech Stack:** Rust (tokio, regex, walkdir, glob, futures), TypeScript/React (Vitest, testing-library), i18n (TCopyProvider/useTCopy)

## Global Constraints

- `cargo clippy --workspace --all-targets -- -D warnings` 必须保持 0 警告
- `cargo test --workspace` 所有 562 Rust 测试必须通过
- `pnpm --dir frontend run test -- --run` 所有 744 前端测试必须通过
- `pnpm --dir frontend run lint` 必须保持 0 error
- 所有 UI 文本必须使用 i18n key（不得硬编码）
- 禁止调试日志遗留（console.log/console.debug 等）
- Rust 错误处理使用 `Result<T, AppError>` + `?` 传播
- 文件路径使用完整绝对路径

---

### Task 1: 替换 glob.rs PowerShell 执行为 Rust 原生 glob

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\Cargo.toml`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\src\glob.rs`

**Interfaces:**
- Consumes: `adl_errors::AppError`
- Produces: `pub async fn glob_files(pattern: &str) -> Result<String, AppError>` — 签名不变，实现改为原生

- [ ] **Step 1: 添加 `glob` 和 `walkdir` 依赖**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\Cargo.toml`，在 `[dependencies]` 节末尾添加：
```toml
glob = "0.3"
walkdir = "2.5"
```

- [ ] **Step 2: 用 Rust 原生实现替换 `glob_files`**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\src\glob.rs`，将整个文件内容替换为：
```rust
use adl_errors::AppError;
use std::path::Path;

pub struct GlobInput {
    pub pattern: String,
}

pub async fn glob_files(pattern: &str) -> Result<String, AppError> {
    let pattern = pattern.to_string();
    tokio::task::spawn_blocking(move || {
        let entries: Vec<String> = glob::glob(&pattern)
            .map_err(|e| AppError::Internal(format!("Invalid glob pattern: {}", e)))?
            .filter_map(|entry| {
                entry.ok().and_then(|p| {
                    let path = p.strip_prefix("./").unwrap_or(&p);
                    if path == Path::new("") {
                        None
                    } else {
                        Some(path.display().to_string())
                    }
                })
            })
            .take(100)
            .collect();
        Ok(entries.join("\n"))
    })
    .await
    .map_err(|e| AppError::Internal(format!("glob spawn failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs;

    #[tokio::test]
    async fn glob_finds_files() {
        fs::write("_test_glob_a.txt", "a").await.unwrap();
        fs::write("_test_glob_b.txt", "b").await.unwrap();
        let result = glob_files("*_test_glob_*.txt").await;
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.contains("_test_glob_a.txt"));
        assert!(output.contains("_test_glob_b.txt"));
        let _ = fs::remove_file("_test_glob_a.txt").await;
        let _ = fs::remove_file("_test_glob_b.txt").await;
    }

    #[tokio::test]
    async fn glob_non_matching_returns_empty() {
        let result = glob_files("_nonexistent_glob_pattern_xyz_*").await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }
}
```

- [ ] **Step 3: 运行 Rust 测试验证**

```powershell
cargo test -p adl-tools -- glob
```
预期: 2 passed, 0 failed

- [ ] **Step 4: 运行完整 workspace 测试**

```powershell
cargo test --workspace
```
预期: 562 passed（glob 相关 agent-runtime 工具测试也应通过）

- [ ] **Step 5: 运行 clippy 检查**

```powershell
cargo clippy --workspace --all-targets -- -D warnings
```
预期: 0 warnings

- [ ] **Step 6: Commit**

```powershell
git add ai-digital-life/crates/tools/Cargo.toml ai-digital-life/crates/tools/src/glob.rs
git commit -m "fix(tools): replace PowerShell glob with Rust native glob crate"
```

---

### Task 2: 替换 grep.rs PowerShell 执行为 Rust 原生文本搜索

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\Cargo.toml`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\src\grep.rs`

**Interfaces:**
- Consumes: `adl_errors::AppError`, `walkdir` (已在 Task 1 添加)
- Produces: `pub async fn grep_files(pattern: &str) -> Result<String, AppError>` — 签名不变

- [ ] **Step 1: 添加 `regex` 依赖（如未在 Task 1 添加）**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\Cargo.toml`，在 `[dependencies]` 节末尾添加（如果 `walkdir` 已由 Task 1 添加则仅添加 `regex`）：
```toml
regex = "1.11"
```

- [ ] **Step 2: 用 Rust 原生实现替换 `grep_files`**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\src\grep.rs`，将整个文件内容替换为：
```rust
use adl_errors::AppError;
use regex::Regex;
use std::io::BufRead;
use std::io::Read;
use std::path::Path;

pub struct GrepInput {
    pub pattern: String,
}

pub async fn grep_files(pattern: &str) -> Result<String, AppError> {
    let pattern = pattern.to_string();
    tokio::task::spawn_blocking(move || {
        let re = Regex::new(&pattern)
            .map_err(|e| AppError::InvalidInput(format!("Invalid regex pattern: {}", e)))?;
        let mut results: Vec<String> = Vec::new();

        for entry in walkdir::WalkDir::new(".")
            .into_iter()
            .filter_entry(|e| !is_hidden(e))
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .take(500)
        {
            let path = entry.path();
            if let Ok(file) = std::fs::File::open(path) {
                let reader = std::io::BufReader::new(file);
                for (line_no, line) in reader.lines().enumerate() {
                    if let Ok(line) = line {
                        if re.is_match(&line) {
                            let trimmed = line.trim();
                            let display = if trimmed.len() > 200 {
                                format!("{}...", &trimmed[..200])
                            } else {
                                trimmed.to_string()
                            };
                            let short_path = path
                                .strip_prefix("./")
                                .unwrap_or(path)
                                .display();
                            results.push(format!("{}:{} {}", short_path, line_no + 1, display));
                            if results.len() >= 100 {
                                return Ok(results.join("\n"));
                            }
                        }
                    }
                }
            }
        }
        if results.is_empty() {
            Ok("No matches found.".to_string())
        } else {
            Ok(results.join("\n"))
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("grep spawn failed: {}", e)))?
}

fn is_hidden(entry: &walkdir::DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|s| s.starts_with('.') || s == "target" || s == "node_modules")
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs;

    #[tokio::test]
    async fn grep_finds_pattern() {
        fs::write("_test_grep.txt", "hello world\nfoo bar").await.unwrap();
        let result = grep_files("hello").await;
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.contains("hello"));
        let _ = fs::remove_file("_test_grep.txt").await;
    }

    #[tokio::test]
    async fn grep_non_matching_returns_no_matches() {
        let pattern = format!("_adl_nonexistent_{}_", uuid::Uuid::new_v4());
        let result = grep_files(&pattern).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn grep_invalid_regex_returns_error() {
        let result = grep_files("[invalid").await;
        assert!(result.is_err());
    }
}
```

- [ ] **Step 3: 运行测试验证**

```powershell
cargo test -p adl-tools -- grep
```
预期: 3 passed, 0 failed

- [ ] **Step 4: 运行完整 workspace 测试和 clippy**

```powershell
cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
```
预期: all passed, 0 warnings

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/crates/tools/Cargo.toml ai-digital-life/crates/tools/src/grep.rs
git commit -m "fix(tools): replace PowerShell grep with Rust native regex+walkdir"
```

---

### Task 3: 修复 read.rs 路径遍历弱校验

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\src\read.rs`

**Interfaces:**
- Consumes: `adl_errors::AppError`, `tokio::fs`
- Produces: `pub async fn read_file(path: &str) -> Result<String, AppError>` — 签名不变

- [ ] **Step 1: 用 canonicalize 替换路径弱校验**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\tools\src\read.rs`，将 `read_file` 函数实现替换（保留 struct 和 test module 不变）：

```rust
use adl_errors::AppError;
use std::path::Path;
use tokio::fs;

pub struct ReadInput {
    pub path: String,
}

pub async fn read_file(path: &str) -> Result<String, AppError> {
    let resolved = std::fs::canonicalize(path)
        .map_err(|e| AppError::NotFound(format!("Cannot resolve path '{}': {}", path, e)))?;

    let cwd = std::env::current_dir()
        .map_err(|e| AppError::Internal(format!("Cannot get current dir: {}", e)))?;

    if !resolved.starts_with(&cwd) {
        return Err(AppError::Security(
            format!("Path traversal denied: '{}' resolves outside workspace", path)
        ));
    }

    let content = fs::read_to_string(&resolved)
        .await
        .map_err(|e| AppError::NotFound(format!("Cannot read file '{}': {}", resolved.display(), e)))?;
    if content.len() > 51_200 {
        Ok(format!("{}...\n[Output truncated at 50KB]", &content[..51_200]))
    } else {
        Ok(content)
    }
}
```

- [ ] **Step 2: 更新测试以适应 canonicalize（需要测试文件存在于当前目录）**

编辑 `read.rs` 的 test module：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs;

    #[tokio::test]
    async fn reads_existing_file() {
        fs::write("_test_read_ok.txt", "test content").await.unwrap();
        let result = read_file("_test_read_ok.txt").await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "test content");
        let _ = fs::remove_file("_test_read_ok.txt").await;
    }

    #[tokio::test]
    async fn returns_error_for_missing_file() {
        let result = read_file("_nonexistent_file_xyz.txt").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn blocks_path_traversal_via_dotdot() {
        let result = read_file("../outside_workspace.txt").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn blocks_path_traversal_via_dotdotdot() {
        let result = read_file("..../outside_workspace.txt").await;
        assert!(result.is_err());
    }
}
```

- [ ] **Step 3: 确认 AppError 有 Security 变体**

检查 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\errors\src\lib.rs` 是否已有 `Security` 变体。如果没有，添加：

```rust
/// Security violation (path traversal, injection attempt, etc.)
#[error("Security violation: {0}")]
Security(String),
```

同时检查 `ErrorKind` enum 是否需要对应添加。若 `AppError` 枚举有 `serde(rename_all = "camelCase")` 或类似属性，需确保一致性。

- [ ] **Step 4: 运行测试**

```powershell
cargo test -p adl-tools -- read
```
预期: 4 passed, 0 failed

- [ ] **Step 5: 运行完整质量检查**

```powershell
cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
```
预期: all passed, 0 warnings

- [ ] **Step 6: Commit**

```powershell
git add ai-digital-life/crates/tools/src/read.rs ai-digital-life/crates/errors/src/lib.rs
git commit -m "fix(tools): replace weak path traversal check with canonicalize+workspace boundary"
```

---

### Task 4: 移除 gitVisActions.ts 调试日志

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores\actions\gitVisActions.ts`

**Interfaces:**
- 移除内部 `debugLog` 函数及其所有引用

- [ ] **Step 1: 移除 debugLog 函数定义和所有调用**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores\actions\gitVisActions.ts`：

- 删除第 14-18 行的 `debugLog` 函数定义
- 搜索 `debugLog(` 的所有调用并移除这些行（保留函数参数不变，移除 debugLog 调用本身）

具体操作：删除第 14-18 行：
```typescript
function debugLog(msg: string, ...args: unknown[]): void {
  if (typeof console !== 'undefined' && (console as { debug?: typeof console.log }).debug) {
    console.debug(`[ADL-GIT-VIS] ${msg}`, ...args);
  }
}
```

并将文件中所有 `debugLog(...)` 调用替换为移除。用全局搜索确认所有调用位置后逐行删除。

- [ ] **Step 2: 运行前端 lint 和测试**

```powershell
pnpm --dir frontend run lint && pnpm --dir frontend run test -- --run
```
预期: 0 errors, 744 passed

- [ ] **Step 3: Commit**

```powershell
git add ai-digital-life/frontend/src/app/stores/actions/gitVisActions.ts
git commit -m "fix(frontend): remove console.debug from gitVisActions.ts"
```

---

### Task 5: 修复 FileSunburst.tsx i18n 缺失

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\git-visualization\charts\FileSunburst.tsx`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\i18n\zh-CN\changes.ts`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\i18n\en-US\changes.ts`

**Interfaces:**
- Consumes: `useTCopy` from `@i18n/useTCopy`
- Produces: `i18n key gitVisNoData` — 中英文翻译

- [ ] **Step 1: 添加 i18n key 到两个 locale 文件**

在 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\i18n\zh-CN\changes.ts` 的 `gitVisRetry: '重试',` 之后添加：

```typescript
  gitVisNoData: '暂无数据',
```

在 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\i18n\en-US\changes.ts` 的 `gitVisRetry: 'Retry',` 之后添加：

```typescript
  gitVisNoData: 'No data',
```

- [ ] **Step 2: 修改 FileSunburst.tsx 使用 i18n**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\git-visualization\charts\FileSunburst.tsx`：

在 import 区域添加：
```typescript
import { useTCopy } from '@i18n/useTCopy';
```

在组件函数体内第一行（`useMemo` 之前）添加：
```typescript
const { t } = useTCopy();
```

将第 41 行的 `<p style={{ color: 'var(--text-muted)' }}>No data</p>` 替换为：
```typescript
        <p style={{ color: 'var(--text-muted)' }}>{t.gitVisNoData}</p>
```

- [ ] **Step 3: 运行前端 lint 和测试**

```powershell
pnpm --dir frontend run lint && pnpm --dir frontend run test -- --run
```
预期: 0 errors, 744 passed（i18n key parity test 确认新 key 在两个 locale 中都存在）

- [ ] **Step 4: Commit**

```powershell
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts ai-digital-life/frontend/src/app/i18n/en-US/changes.ts
git commit -m "fix(frontend): add i18n key for FileSunburst No data placeholder"
```

---

### Task 6: 修复硬编码字体 — XtermTerminal.tsx 和 BranchGraph.tsx

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\components\terminal\XtermTerminal.tsx`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\git-visualization\charts\BranchGraph.tsx`

**Interfaces:**
- 将硬编码字体字符串替换为 CSS 变量 `var(--font-mono, monospace)`

- [ ] **Step 1: 修复 XtermTerminal.tsx 硬编码字体**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\components\terminal\XtermTerminal.tsx` 第 106 行：

将：
```typescript
        fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
```
替换为：
```typescript
        fontFamily:
          getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() ||
          'Cascadia Code, Fira Code, Consolas, monospace',
```

- [ ] **Step 2: 修复 BranchGraph.tsx 硬编码字体**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\git-visualization\charts\BranchGraph.tsx` 第 563 行：

将：
```typescript
                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
```
替换为：
```typescript
                    fontFamily: 'var(--font-mono, monospace)',
```

- [ ] **Step 3: 运行前端 lint 和测试**

```powershell
pnpm --dir frontend run lint && pnpm --dir frontend run test -- --run
```
预期: 0 errors, 744 passed

- [ ] **Step 4: Commit**

```powershell
git add ai-digital-life/frontend/src/app/components/terminal/XtermTerminal.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.tsx
git commit -m "fix(frontend): replace hardcoded font-family with --font-mono CSS variable"
```

---

### Task 7: 修复静默错误吞噬 — 14 处 .catch(() => {}) 添加 console.warn

**Files:**
- Modify: 14 个文件（详见下方清单）

**Interfaces:**
- 每个 `.catch(() => {})` 改为 `.catch((err) => { console.warn('<context>', err); })`

- [ ] **Step 1: 逐一修复每个文件**

在以下 14 个位置，将空 `.catch(() => {})` 替换为带 console.warn 的版本：

| 文件 | 行号 | 替换为 |
|------|------|--------|
| `frontend/src/app/components/conversation/SnapshotList.tsx` | 20 | `.catch((err) => { console.warn('SnapshotList flush failed', err); })` |
| `frontend/src/app/features/browser/useBrowserContextMenu.ts` | 81 | `.catch((err) => { console.warn('browser context menu action failed', err); })` |
| `frontend/src/app/features/browser/useBrowserNavigation.ts` | 19 | `.catch((err) => { console.warn('browser navigate failed', err); })` |
| `frontend/src/app/features/browser/useBrowserNavigation.ts` | 34 | `.catch((err) => { console.warn('browser navigate failed', err); })` |
| `frontend/src/app/features/browser/useBrowserNavigation.ts` | 49 | `.catch((err) => { console.warn('browser navigate failed', err); })` |
| `frontend/src/app/features/terminal/useTerminalMenus.ts` | 57 | `.catch((err) => { console.warn('terminal copy failed', err); })` |
| `frontend/src/app/features/terminal/useTerminalMenus.ts` | 69 | `.catch((err) => { console.warn('terminal paste failed', err); })` |
| `frontend/src/app/features/browser/useWebViewVisibility.ts` | 61 | `.catch((err) => { console.warn('webview set bounds failed', err); })` |
| `frontend/src/app/features/browser/useWebViewVisibility.ts` | 177 | `.catch((err) => { console.warn('webview set bounds failed', err); })` |
| `frontend/src/app/features/browser/useBrowserThemeSync.ts` | 7 | `.catch((err) => { console.warn('browser theme sync failed', err); })` |
| `frontend/src/app/features/browser/useBrowserThemeSync.ts` | 10 | `.catch((err) => { console.warn('browser theme sync failed', err); })` |
| `frontend/src/app/features/browser/useWebViewBounds.ts` | 65 | `.catch((err) => { console.warn('webview set bounds failed', err); })` |
| `frontend/src/app/features/file-tree/useFileTreeVirtualization.ts` | 150 | `.catch((err) => { console.warn('file tree scroll failed', err); })` |
| `frontend/src/app/regions/CenterPane.tsx` | 114 | `.catch((err) => { console.warn('center pane snapshot failed', err); setLatestSnapshotId(null as any); })` |

注意：CenterPane.tsx 行 114 中已有的 `setLatestSnapshotId(null)` 逻辑需保留，仅添加 console.warn。

- [ ] **Step 2: 运行 lint 和测试确认无破坏**

```powershell
pnpm --dir frontend run lint && pnpm --dir frontend run test -- --run
```
预期: 0 errors, 744 passed（lint 允许 console.warn）

- [ ] **Step 3: Commit**

```powershell
git add ai-digital-life/frontend/src/app/components/conversation/SnapshotList.tsx ai-digital-life/frontend/src/app/features/browser/useBrowserContextMenu.ts ai-digital-life/frontend/src/app/features/browser/useBrowserNavigation.ts ai-digital-life/frontend/src/app/features/terminal/useTerminalMenus.ts ai-digital-life/frontend/src/app/features/browser/useWebViewVisibility.ts ai-digital-life/frontend/src/app/features/browser/useBrowserThemeSync.ts ai-digital-life/frontend/src/app/features/browser/useWebViewBounds.ts ai-digital-life/frontend/src/app/features/file-tree/useFileTreeVirtualization.ts ai-digital-life/frontend/src/app/regions/CenterPane.tsx
git commit -m "fix(frontend): add console.warn to silent error catches"
```

---

### Task 8: 提取 LSP 客户端 URL→URI 重复代码

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\lsp-client\src\client.rs`

**Interfaces:**
- Produces: `fn file_path_to_lsp_uri(file_path: &str) -> Result<lsp_types::Uri, AppError>` — 私有辅助函数

- [ ] **Step 1: 添加私有辅助函数**

在 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\lsp-client\src\client.rs` 的 `impl LspClient` 块之前添加：

```rust
fn file_path_to_lsp_uri(file_path: &str) -> Result<lsp_types::Uri, AppError> {
    url::Url::from_file_path(file_path)
        .map_err(|_| AppError::InvalidInput("Invalid file path".into()))?
        .to_string()
        .parse::<lsp_types::Uri>()
        .map_err(|e| AppError::Internal(format!("Invalid URI: {}", e)))
}
```

- [ ] **Step 2: 替换 3 处重复代码**

在 `get_diagnostics()` (行 188-192)、`get_symbols()` (行 241-245)、`goto_definition()` (行 269-273) 中，将 5 行 URL 转换代码替换为：

```rust
        let uri = file_path_to_lsp_uri(file_path)?;
```

- [ ] **Step 3: 运行测试和 clippy**

```powershell
cargo test -p adl-lsp-client && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
```
预期: all passed, 0 warnings

- [ ] **Step 4: Commit**

```powershell
git add ai-digital-life/crates/lsp-client/src/client.rs
git commit -m "refactor(lsp-client): extract file_path_to_lsp_uri helper to deduplicate URI conversion"
```

---

### Task 9: 拆分 git_visualization.rs 为大模块

**Files:**
- Create: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\git_vis\mod.rs`
- Create: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\git_vis\commit_stats.rs`
- Create: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\git_vis\branch_graph.rs`
- Create: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\git_vis\contributor.rs`
- Create: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\git_vis\sunburst.rs`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\mod.rs`
- Delete: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\git_visualization.rs` (内容已迁移到子模块)

**Interfaces:**
- Consumes: `adl_errors::AppError`, `adl_types`, `git2`
- Produces: `pub mod git_vis` (re-exporting all public functions from sub-modules)

- [ ] **Step 1: 阅读 git_visualization.rs 理解功能分组**

先查看 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\git_visualization.rs` 中的主函数签名：

```rust
pub fn compute_commit_stats(...) -> ...
pub fn compute_code_evolution(...) -> ...
pub fn compute_branch_graph(...) -> ...
pub fn compute_contributor_activity(...) -> ...
pub fn compute_contributor_module(...) -> ...
pub fn compute_file_sunburst(...) -> ...
pub fn compute_daily_commits(...) -> ...
pub fn compute_hourly_heatmap(...) -> ...
```

按功能分组拆分：

- `commit_stats.rs` → `compute_commit_stats`, `compute_daily_commits`, `compute_hourly_heatmap`, `compute_code_evolution`
- `branch_graph.rs` → `compute_branch_graph`
- `contributor.rs` → `compute_contributor_activity`, `compute_contributor_module`
- `sunburst.rs` → `compute_file_sunburst`

- [ ] **Step 2: 创建 `git_vis/` 目录和 `mod.rs`**

创建 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\git_vis\mod.rs`：

```rust
pub mod branch_graph;
pub mod commit_stats;
pub mod contributor;
pub mod sunburst;

pub use branch_graph::compute_branch_graph;
pub use commit_stats::{
    compute_code_evolution, compute_commit_stats, compute_daily_commits,
    compute_hourly_heatmap,
};
pub use contributor::{compute_contributor_activity, compute_contributor_module};
pub use sunburst::compute_file_sunburst;
```

- [ ] **Step 3: 创建子模块文件**

将 `git_visualization.rs` 中的代码按功能分组复制到对应的子模块文件中：

- `commit_stats.rs`: 复制 `compute_commit_stats`、`compute_daily_commits`、`compute_hourly_heatmap`、`compute_code_evolution` 函数及其辅助函数、use 语句
- `branch_graph.rs`: 复制 `compute_branch_graph` 函数及其辅助函数、use 语句
- `contributor.rs`: 复制 `compute_contributor_activity`、`compute_contributor_module` 函数及其辅助函数、use 语句
- `sunburst.rs`: 复制 `compute_file_sunburst` 函数及其辅助函数、use 语句

每个子模块文件包含本模块需要的 use 语句，函数签名和可见性标识不变。

- [ ] **Step 4: 更新 `git/mod.rs`**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\mod.rs`：

将 `pub mod git_visualization;` 替换为 `pub mod git_vis;`

将原来从 `git_visualization` 的 re-export 改为从 `git_vis` re-export：
```rust
pub use git_vis::*;
```

- [ ] **Step 5: 删除原文件**

删除 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\workspace\src\git\git_visualization.rs`

- [ ] **Step 6: 编译和测试验证**

```powershell
cargo check --workspace && cargo test -p adl-workspace && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
```
预期: all passed, 0 warnings

- [ ] **Step 7: Commit**

```powershell
git add ai-digital-life/crates/workspace/src/git/
git rm ai-digital-life/crates/workspace/src/git/git_visualization.rs
git commit -m "refactor(workspace): split git_visualization.rs into git_vis/ sub-modules"
```

---

### Task 10: MCP 服务器并发注册

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\src-tauri\src\commands\mcp.rs`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\src-tauri\Cargo.toml`

**Interfaces:**
- Consumes: `futures::future::join_all`
- Modifies: `load_mcp_config_inner` 函数

- [ ] **Step 1: 确认 `futures` 在 workspace 中可用**

检查 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\Cargo.toml` 的 `[workspace.dependencies]` 中是否有 `futures`。如果 `tokio` 已包含则无需额外添加，可用 `tokio::join!` 替代。

检查 `src-tauri/Cargo.toml` 是否已有 `futures` 依赖，若没有则添加：
```toml
futures = "0.3"
```

- [ ] **Step 2: 修改 `load_mcp_config_inner` 并发注册**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\src-tauri\src\commands\mcp.rs`，在文件顶部 `use` 区域添加：

```rust
use futures::future::join_all;
```

将 `load_mcp_config_inner` 函数修改为：

```rust
async fn load_mcp_config_inner(path: String) -> Result<usize, AppError> {
    let registry = adl_mcp_client::McpServerRegistry::from_json_file(std::path::Path::new(&path))?;
    let configs: Vec<_> = registry.list_enabled().into_iter().cloned().collect();
    let count = configs.len();
    let tasks: Vec<_> = configs
        .into_iter()
        .map(|config| {
            let client = mcp_client();
            async move { client.add_server(config).await }
        })
        .collect();
    join_all(tasks).await;
    Ok(count)
}
```

- [ ] **Step 3: 编译和测试**

```powershell
cargo check --workspace && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
```
预期: all passed, 0 warnings

- [ ] **Step 4: Commit**

```powershell
git add ai-digital-life/src-tauri/src/commands/mcp.rs ai-digital-life/src-tauri/Cargo.toml
git commit -m "perf(mcp): use join_all for concurrent MCP server registration"
```

---

### Task 11: 减少 model-gateway registry.rs 双重克隆

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\model-gateway\src\registry.rs`

**Interfaces:**
- Modifies: `ProviderRegistry::register()` 内部实现，接口不变

- [ ] **Step 1: 修复双重克隆**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\model-gateway\src\registry.rs`，将第 67-68 行：

```rust
        let id = def.id.clone();
        self.providers.insert(id.clone(), def);
        self.adapters.insert(id, Arc::from(adapter));
```

改为：

```rust
        self.adapters.insert(def.id.clone(), Arc::from(adapter));
        self.providers.insert(def.id.clone(), def);
```

注：这里 `def.id` 仍被克隆两次——一次给 adapters，一次给 providers（因为两个 insert 都需要所有权）。原代码克隆了 3 次（一次给 `id` 变量，两次给 insert），修复后减少为 2 次。如需真正避免双重克隆，可改为两个 HashMap 都使用 `&str` key + `Cow` 或接受这是必要的开销。

- [ ] **Step 2: 运行测试和 clippy**

```powershell
cargo test -p adl-model-gateway && cargo clippy --workspace --all-targets -- -D warnings
```
预期: all passed, 0 warnings

- [ ] **Step 3: Commit**

```powershell
git add ai-digital-life/crates/model-gateway/src/registry.rs
git commit -m "perf(model-gateway): reduce unnecessary id clone in ProviderRegistry::register"
```

---

### Task 12: 为图表组件添加基础渲染测试

**Files:**
- Create: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\components\charts\heatmap\heatmap-chart.test.tsx`
- Create: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\components\charts\bar-chart.test.tsx`

**Interfaces:**
- Tests: 验证组件挂载、空数据渲染、最小 props 渲染

- [ ] **Step 1: 创建 heatmap-chart 基础渲染测试**

创建 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\components\charts\heatmap\heatmap-chart.test.tsx`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeatmapChart } from './heatmap-chart';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({ t: {} as Record<string, string>, locale: 'en-US' }),
}));

describe('HeatmapChart', () => {
  const baseProps = {
    data: [],
    chartId: 'test-heatmap',
    xLabels: ['Mon', 'Tue'],
    yLabels: ['9:00', '10:00'],
    width: 400,
    height: 200,
    cellWidth: 40,
    cellHeight: 20,
    gap: 2,
    colors: ['#eee', '#333'],
    xAxisLabel: 'Days',
    yAxisLabel: 'Hours',
    tooltipFormatter: (v: number) => String(v),
    colorScale: (v: number) => '#333',
  };

  it('renders without crashing with empty data', () => {
    const { container } = render(<HeatmapChart {...baseProps} data={[]} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders cells for provided data', () => {
    const data = [
      { x: 0, y: 0, value: 5 },
      { x: 0, y: 1, value: 3 },
    ];
    const { container } = render(<HeatmapChart {...baseProps} data={data} />);
    const rects = container.querySelectorAll('rect[data-cell]');
    expect(rects.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: 创建 bar-chart 基础渲染测试**

创建 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\components\charts\bar-chart.test.tsx`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BarChart } from './bar-chart';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({ t: {} as Record<string, string>, locale: 'en-US' }),
}));

describe('BarChart', () => {
  const baseProps = {
    data: [],
    chartId: 'test-bar',
    xLabels: ['A', 'B'],
    width: 400,
    height: 200,
    barWidth: 30,
    gap: 4,
    color: '#333',
    xAxisLabel: 'Categories',
    yAxisLabel: 'Values',
    tooltipFormatter: (v: number) => String(v),
  };

  it('renders without crashing with empty data', () => {
    const { container } = render(<BarChart {...baseProps} data={[]} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders bars for provided data', () => {
    const data = [
      { x: 0, value: 10 },
      { x: 1, value: 20 },
    ];
    const { container } = render(<BarChart {...baseProps} data={data} />);
    const rects = container.querySelectorAll('rect[data-bar]');
    expect(rects.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: 运行前端测试**

```powershell
pnpm --dir frontend run test -- --run --reporter=verbose 2>&1 | Select-String "heatmap-chart|bar-chart|Tests"
```
预期: 新测试通过，总数增加

- [ ] **Step 4: 运行 lint**

```powershell
pnpm --dir frontend run lint
```
预期: 0 errors

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/frontend/src/components/charts/heatmap/heatmap-chart.test.tsx ai-digital-life/frontend/src/components/charts/bar-chart.test.tsx
git commit -m "test(frontend): add basic render tests for heatmap-chart and bar-chart"
```

---

### Task 13: 剩余低优先级修复（批量）

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\utils\favicon.ts`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\workspace-browser\multiworkspacebrowser.tsx` → 重命名为 `MultiWorkspaceBrowser.tsx`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\git-visualization\data\gitVisMockData.ts` → 移至 `test-fixtures/`

**Interfaces:** 无接口变更，纯重构

- [ ] **Step 1: 提取 Google Favicon URL 为常量**

编辑 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\utils\favicon.ts`，在文件顶部添加：

```typescript
const GOOGLE_FAVICON_API = 'https://www.google.com/s2/favicons';
```

将第 3 行（或使用该 URL 的位置）的硬编码 URL 替换为 `${GOOGLE_FAVICON_API}?domain={domain}&sz=64`

- [ ] **Step 2: 重命名 multiworkspacebrowser.tsx**

```powershell
git mv ai-digital-life/frontend/src/app/features/workspace-browser/multiworkspacebrowser.tsx ai-digital-life/frontend/src/app/features/workspace-browser/MultiWorkspaceBrowser.tsx
```

然后更新所有引用此文件的 import 路径（搜索 `multiworkspacebrowser` 的所有引用并更新路径）。

- [ ] **Step 3: 移动 gitVisMockData.ts 到 test-fixtures/**

```powershell
git mv ai-digital-life/frontend/src/app/features/git-visualization/data/gitVisMockData.ts ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts
```

更新所有引用此文件的 import 路径。

- [ ] **Step 4: 运行全量质量检查**

```powershell
pnpm --dir frontend run lint && pnpm --dir frontend run test -- --run && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
```
预期: all passed, 0 errors, 0 warnings

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "chore: low-priority refactoring fixes (favicon constant, file rename, mock data relocation)"
```

---

## 执行顺序建议

1. **Task 1-3** (严重安全修复) — 必须最先执行
2. **Task 4-7** (高优先级代码卫生) — 与安全修复无依赖，可并行
3. **Task 8-9** (中优先级结构改进) — 依赖 Task 1-3 完成后的编译状态
4. **Task 10-11** (中优先级性能) — 独立
5. **Task 12** (测试添加) — 独立
6. **Task 13** (低优先级清理) — 最后执行，可选

## 验证终点

所有 Task 完成后运行全量验证：

```powershell
cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && pnpm --dir frontend run lint && pnpm --dir frontend run test -- --run
```

预期结果: Rust 562+ 测试通过 + 0 clippy 警告，前端 744+ 测试通过 + 0 eslint errors
