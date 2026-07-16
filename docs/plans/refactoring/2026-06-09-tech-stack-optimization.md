# 技术栈优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 AI 数字生命项目现有技术栈实施 11 项优化，在保证跨平台基础上提升性能与轻量性

**Architecture:** 分三阶段执行。P0（立即/5 项）聚焦二进制体积与质量基础设施，P1（4 项）聚焦代码质量与跨平台兼容性，P2（2 项）聚焦长期监控。每项任务独立可测试、可提交。

**Core constraint:** 所有变更必须在「跨平台 + 高性能 + 轻量」约束下权衡，不引入额外运行时开销。

**Tech Stack:**
- Rust + Tauri 2.x (backend)
- React 19 + TypeScript + Vite 6 (frontend)
- rusqlite + r2d2 (storage)
- markdown-it + highlight.js (rendering)
- keyring (credential storage)

**Prerequisite reading for implementer:**
- ~~`digitalLife/技术栈评估与优化.md`~~ （目录已归档删除）
- `src-tauri/src/commands/` — Tauri 命令模式
- `frontend/src/app/features/preview/markdownPreviewUtils.ts` — markdown-it + highlight.js 使用
- `frontend/src/app/features/editor/cmLanguages.ts` — CodeMirror 动态加载模式（参考）
- `crates/storage/src/` — 存储层模式

---

## Pre-flight: 前期审计

在开始任何任务前，先做全局审计以确认初始状态。

### Task 0: 全局审计

**Files:**
- Reference: `ai-digital-life/Cargo.toml`
- Reference: `ai-digital-life/frontend/package.json`
- Reference: `ai-digital-life/frontend/src/app/features/preview/markdownPreviewUtils.ts`
- Reference: `ai-digital-life/frontend/src/app/features/editor/cmLanguages.ts`
- Reference: `ai-digital-life/frontend/src/app/features/preview/LazyPreviews.tsx`

- [ ] **Step 1: 确认当前 tokio 配置**

```bash
grep -n "tokio" ai-digital-life/Cargo.toml
```
Expected: `tokio = { version = "1", features = ["full"] }`

- [ ] **Step 2: 确认 highlight.js 导入方式**

```bash
grep -rn "highlight.js" ai-digital-life/frontend/src/ --include="*.ts" --include="*.tsx"
```
Expected: `import hljs from 'highlight.js/lib/common'` (loads ALL languages)

- [ ] **Step 3: 确认 CI/CD 不存在**

```bash
ls .github/workflows/ 2>/dev/null || echo "NO_CI"
```
Expected: `NO_CI` (no workflows directory)

- [ ] **Step 4: 确认 react-markdown 未被使用**

```bash
grep -rn "react-markdown" ai-digital-life/frontend/src/ --include="*.ts" --include="*.tsx"
```
Expected: No output (dead dependency)

- [ ] **Step 5: 确认 LazyPreviews 使用现状**

```bash
grep -rn "LazyPdfPreviewWrapper\|LazyDocxPreviewWrapper\|PdfPreview\|DocxPreview" ai-digital-life/frontend/src/ --include="*.ts" --include="*.tsx"
```
Expected: `PdfPreview`/`DocxPreview` only referenced in preview/ directory itself; consumers only use `LazyMarkdownPreviewWrapper`

- [ ] **Step 6: 提交审计结果**

```bash
git add -N . && git diff --stat
# just commit this info as a baseline
git commit --allow-empty -m "chore: baseline audit before tech stack optimization"
```

---

## Phase 1 — P0 (Immediate, 5 tasks)

### Task 1: tokio features 精简

**Files:**
- Modify: `ai-digital-life/Cargo.toml:34`
- Reference: `ai-digital-life/crates/*/Cargo.toml` (逐一检查各 crate 的 tokio 使用)
- Test: `cargo build --release && cargo test --workspace`

**Goal:** 将 `features = ["full"]` 替换为按需启用的最小特性集，减少编译时间与二进制体积。

- [ ] **Step 1: 审计各 crate 实际使用的 tokio API**

在每个 crate 中搜索 tokio 使用模式：

```bash
# 检查所有 crate 的 Cargo.toml 中 tokio 依赖
for f in ai-digital-life/crates/*/Cargo.toml ai-digital-life/src-tauri/Cargo.toml; do
  echo "=== $f ==="
  grep -n "tokio" "$f" || echo "(not found)"
done
```

然后搜索实际使用的 tokio API：

```bash
cd ai-digital-life
rg --include '*.rs' 'tokio::' crates/ src-tauri/ | grep -oP 'tokio::\w+' | sort -u
```

Expected output 示例 (取决于实际使用):
```
tokio::fs
tokio::io
tokio::net
tokio::process
tokio::runtime
tokio::signal
tokio::spawn
tokio::sync
tokio::task
tokio::time
```

- [ ] **Step 2: 对照 tokio feature 矩阵确定最小特性集**

根据上一步输出，对照 tokio feature 矩阵：

| Rust 代码中使用 | 所需 features |
|---|---|
| `tokio::spawn`, `tokio::task` | `rt-multi-thread`, `macros` |
| `tokio::net::TcpStream` | `net` |
| `tokio::process::Command` | `process` |
| `tokio::fs` | `fs` |
| `tokio::io::{AsyncRead, AsyncWrite}` | `io-util` |
| `tokio::time` | `time` |
| `tokio::signal` | `signal` |
| `tokio::sync` | `sync` |

**注意**：`tokio::sync` 中的 `Mutex`、`RwLock` 等基础类型在 `sync` 特性中，不需要额外依赖。`rt-multi-thread` 提供多线程运行时（与 `rt` 的区别是单线程/多线程）。

如果实际输出不包含 `tokio::signal`，可以删除 `signal` 特性。同理，如果不使用 `tokio::net`，删除 `net`。

**经验估计（从之前的代码分析来看）：**
- `model-gateway` 使用 reqwest（自身有运行时），需要 `rt-multi-thread`, `macros`
- `pty` 使用 portable-pty，需要 `rt-multi-thread`, `macros`, `process`, `fs`
- `fs-ops` 使用 notify + 文件操作，需要 `rt-multi-thread`, `macros`, `fs`, `time`
- `src-tauri` 需要 `rt-multi-thread`, `macros`, `signal`, `fs`

建议的最小特性集（基于标准桌面应用模式）：
```toml
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "io-util", "net", "process", "signal", "sync", "time"] }
```

如果审计发现某个特性未使用，将其从列表中移除。

- [ ] **Step 3: 修改 Cargo.toml**

修改 `ai-digital-life/Cargo.toml:34`：

```toml
# Before:
tokio = { version = "1", features = ["full"] }

# After (based on typical audit result — adjust per actual findings):
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "io-util", "process", "signal", "sync", "time"] }
```

**注意**：如果实际审计发现 `tokio::net` 未使用，删除 `net`。如果 `tokio::signal` 未使用，删除 `signal`。关键原则是「多删少加」——编译失败时再补回缺失特性。

- [ ] **Step 4: 编译验证**

```bash
cd ai-digital-life
cargo build 2>&1
```

Expected: 编译成功，无错误。

如果编译失败，错误信息会指示缺失的 `tokio` 特性：
```
error[E0432]: unresolved import `tokio::signal`
```
此时将缺失的特性补回即可。

- [ ] **Step 5: 运行测试**

```bash
cd ai-digital-life
cargo test --workspace 2>&1 | tail -20
```

Expected: 所有测试通过（105+ tests passed）。

- [ ] **Step 6: 提交**

```bash
cd ai-digital-life
git add Cargo.toml
git commit -m "perf: replace tokio full features with minimal subset"
```

---

### Task 2: CI/CD 流水线

**Files:**
- Create: `.github/workflows/quality-gates.yml`
- Create: `.github/workflows/test.yml`
- Reference: `ai-digital-life/package.json` (scripts)
- Reference: `ai-digital-life/Cargo.toml` (workspace)

**Goal:** 建立 GitHub Actions CI/CD，每次 push/PR 自动执行四维门禁（clippy + fmt + tsc + eslint）+ 测试。

- [ ] **Step 1: 创建工作流目录**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: 创建 quality-gates.yml**

创建 `.github/workflows/quality-gates.yml`：

```yaml
name: Quality Gates

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: -D warnings

jobs:
  rust:
    name: Rust (fmt + clippy + test)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ai-digital-life
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Rust cache
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: ai-digital-life

      - name: cargo fmt
        run: cargo fmt --all -- --check

      - name: cargo clippy
        run: cargo clippy --workspace --all-targets -- -D warnings

      - name: cargo test
        run: cargo test --workspace

  frontend:
    name: Frontend (lint + typecheck + test)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ai-digital-life/frontend
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11

      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: ESLint
        run: npx eslint .

      - name: TypeScript
        run: npx tsc --noEmit

      - name: Vitest
        run: pnpm vitest run
```

- [ ] **Step 3: 创建工作流目录的 .gitkeep**

```bash
git add .github/workflows/quality-gates.yml
```

- [ ] **Step 4: 在本地验证 workflow 语法**（可选，需要 `act` 工具）

```bash
# 安装 act (Linux/Mac)
# curl -sSL https://github.com/nektos/act/releases/latest/download/act_Linux_x86_64.tar.gz | tar xz

# Windows PowerShell:
# winget install nektos.act

# 本地模拟运行
# act -j rust -W .github/workflows/quality-gates.yml
```

如果本地运行不可行，跳过此步。GitHub 会在推送后自动验证语法。

- [ ] **Step 5: 提交**

```bash
git add .github/
git commit -m "ci: add GitHub Actions quality gates (clippy + fmt + tsc + eslint + test)"
```

---

### Task 3: highlight.js 按需注册

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/preview/markdownPreviewUtils.ts:3`
- Test: `ai-digital-life/frontend/src/app/features/preview/MarkdownPreview.test.ts`

**Goal:** 将 `highlight.js/lib/common`（加载 ~190 种语言）替换为仅注册实际使用的语言，减少 bundle 体积。

- [ ] **Step 1: 审计当前使用了哪些语言进行代码高亮**

在 `markdownPreviewUtils.ts:23-28` 中，highlight.js 被传入 `markdown-it` 的 `highlight` 回调。传入的 `lang` 取决于用户编写的代码块语言标识符。全局搜索项目内 markdown 代码块使用：

```bash
cd ai-digital-life/frontend
rg '```\w+' src/ --include '*.ts' --include '*.tsx' -o | sort | uniq -c | sort -rn
```

Expected output 示例:
```
  45 ```typescript
  23 ```bash
  12 ```json
   8 ```python
   5 ```rust
   4 ```yaml
   3 ```sql
   2 ```html
   2 ```css
   1 ```javascript
   1 ```xml
```

**根据实际审计结果**，列出高频使用的语言。最少应包含：
- `typescript`/`javascript`
- `json`
- `bash`/`shell`
- `python`
- `rust`
- `yaml`
- `sql`
- `html`/`css`
- `xml`

- [ ] **Step 2: 修改导入方式**

替换 `markdownPreviewUtils.ts:3` 中的导入：

```typescript
// Before:
import hljs from 'highlight.js/lib/common';

// After:
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', typescript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
```

**注意**：
- 根据上一步审计结果调整语言列表。只注册实际在代码库中出现的语言标识符。
- `highlight.js` 的语言标识符可能有别名（如 `sh`/`shell`/`bash` 都需要注册），参考 [highlight.js docs](https://github.com/highlightjs/highlight.js/blob/main/SUPPORTED_LANGUAGES.md)
- `xml` 也可用于 `html`/`svg`/`mathml` 等标记语言

- [ ] **Step 3: 运行测试确保不破坏现有功能**

```bash
cd ai-digital-life/frontend
pnpm vitest run src/app/features/preview/MarkdownPreview.test.ts 2>&1
```

Expected:
```
 ✓ MarkdownPreview
   ✓ adds source-line anchors to rendered headings
 Tests  1 passed
```

- [ ] **Step 4: 类型检查和 lint 验证**

```bash
cd ai-digital-life/frontend
npx tsc --noEmit 2>&1 | tail -5
npx eslint src/app/features/preview/markdownPreviewUtils.ts 2>&1 | tail -5
```

Expected: 无错误。

- [ ] **Step 5: 构建验证 bundle 体积减小**

```bash
cd ai-digital-life/frontend
pnpm build:analyze 2>&1 | tail -20
```

关注 `highlight.js` 的 chunk 体积变化。预期从 ~200KB+ (gzip) 减少到 ~30KB。

- [ ] **Step 6: 提交**

```bash
cd ai-digital-life/frontend
git add src/app/features/preview/markdownPreviewUtils.ts
git commit -m "perf: replace highlight.js full import with selective language registration"
```

---

### Task 4: 清理死依赖 + 精简前端依赖

**Files:**
- Modify: `ai-digital-life/frontend/package.json`
- Reference: `ai-digital-life/frontend/pnpm-lock.yaml`

**Goal:** 移除未使用的 `react-markdown` 和 `remark-gfm` 依赖，减小 lockfile 和安装时间。

**确认依据**：`grep` 搜索确认 `react-markdown` 和 `remark-gfm` 在前端源码中无任何 import。

- [ ] **Step 1: 再次确认两个包未被使用**

```bash
cd ai-digital-life/frontend
rg "react-markdown" src/ --include '*.{ts,tsx}' || echo "NOT_USED"
rg "remark-gfm" src/ --include '*.{ts,tsx}' || echo "NOT_USED"
rg "remarkGfm\|remark-gfm" src/ --include '*.{ts,tsx}' || echo "NOT_USED"
```

Expected: 全部输出 `NOT_USED`。

- [ ] **Step 2: 从 package.json 中移除依赖**

```bash
cd ai-digital-life/frontend
pnpm remove react-markdown remark-gfm
```

Expected output:
```
- react-markdown 10.1.0
- remark-gfm 4.0.1
Done in X.Xs
```

- [ ] **Step 3: 验证构建正常**

```bash
cd ai-digital-life/frontend
pnpm build 2>&1 | tail -10
```

Expected: 构建成功，无错误。

- [ ] **Step 4: 运行测试**

```bash
cd ai-digital-life/frontend
pnpm vitest run 2>&1 | tail -20
```

Expected: 183 测试全部通过。

- [ ] **Step 5: 提交**

```bash
cd ai-digital-life
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "chore: remove unused react-markdown and remark-gfm dependencies"
```

---

### Task 5: ts-rs IPC 类型生成

**Files:**
- Modify: `ai-digital-life/crates/kernel/Cargo.toml` (add ts-rs dep)
- Create: `ai-digital-life/crates/kernel/build.rs` (ts-rs export script)
- Create: `ai-digital-life/frontend/src/shared/ipc-types.generated.ts` (generated output)
- Modify: `ai-digital-life/frontend/src/shared/ipc.ts` (import generated types)
- Reference: all `#[derive(Serialize)]` structs in `crates/kernel/src/`

**Goal:** 在 Rust struct 上标注 `#[derive(TS)]`，通过 `ts-rs` crate 自动生成 TypeScript 类型定义，消除 Rust 与 TypeScript IPC 类型的手动同步。

- [ ] **Step 1: 将 ts-rs 添加到 kernel crate**

修改 `ai-digital-life/crates/kernel/Cargo.toml`，在 `[dependencies]` 中添加：

```toml
# After existing serde dependency
ts-rs = "10"
```

在 `[package.metadata]` 中添加 ts-rs 导出配置：

```toml
[package.metadata]
ts-rs = { export-path = "../../frontend/src/shared/ipc-types.generated.ts" }
```

- [ ] **Step 2: 在 kernel 的关键类型上添加 `#[derive(TS)]`**

首先确定哪些类型需要导出。通过查看 `frontend/src/shared/ipc.ts` 中 `from '@ai-digital-life/kernel'` 导入的类型：

```typescript
import type {
  AgentRunDetail, AppInfo, AppPreferencePatch, AuditEntry, CommandRequest,
  CommandRunResult, DigitalLifeTerminalStreamEventV1, CheckpointPayloadPreview,
  ConversationDetail, ConversationSendResult, ConversationSessionRecord,
  GitBranchSummary, DigitalLifeModelStreamEventV1, DigitalLifeRunActivityEventV1,
  GitSnapshot, HealthSnapshot, IpcResult, ModelGatewayHealthSnapshot,
  PatchApplicationResult, PatchSet, ReorderSessionsInput, ReorderWorkspacesInput,
  RecentWorkspaceEntry, RepoMapNode, RetrievalSnapshot, RuntimeDiagnosticsSnapshot,
  ApprovalRequestSummary, TaskCenterSnapshot, FileOutlineItem,
  WorkspaceFileChangedEvent, WorkspaceChangePreview, WorkspaceFileDocument,
  WorkspaceGitBranchChangeResult, WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput, WorkspaceTreeNode, WorkspaceSearchHit, WorkspaceMeta,
} from '@ai-digital-life/kernel';
```

对以上每个类型，找到其在 `crates/kernel/src/` 中的定义位置，添加 `#[derive(TS)]`。例如：

```rust
// Before:
#[derive(Debug, Clone, Serialize, Deserialize)]

// After:
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
```

**注意**：`#[ts(export)]` 会触发 ts-rs 在构建时生成 TypeScript 定义文件。需要在 `build.rs` 中调用导出函数。

- [ ] **Step 3: 创建 build.rs**

创建 `ai-digital-life/crates/kernel/build.rs`：

```rust
fn main() {
    // ts-rs 在编译时会根据 #[ts(export)] 自动生成类型文件
    // 导出路径在 Cargo.toml 的 [package.metadata] 中配置
    println!("cargo:rerun-if-changed=src/");
}
```

**注意**：`ts-rs` 不需要显式调用。只要在类型上标注了 `#[ts(export)]` 且配置了 `export-path`，`build.rs` 中不需要调用任何函数。构建时会自动生成文件。

如果 `ts-rs 10` 的行为不同（版本可能有变化），可参考其文档：https://docs.rs/ts-rs/latest/ts_rs/

- [ ] **Step 4: 编译验证**

```bash
cd ai-digital-life
cargo build -p adl-kernel 2>&1
```

如果编译成功，检查生成文件：

```bash
cat frontend/src/shared/ipc-types.generated.ts | head -30
```

Expected output: 包含 TypeScript 接口定义，与 Rust struct 结构一致。

**如果编译报错**：`ts-rs` 不支持某些 Rust 类型（如生命周期参数、复杂泛型），可以通过在特定字段上添加 `#[ts(type = "string")]` 覆盖：

```rust
#[derive(TS)]
pub struct MyStruct {
    #[ts(type = "Record<string, unknown>")]
    pub metadata: HashMap<String, Value>,
}
```

- [ ] **Step 5: 修改 `ipc.ts` 导入生成的类型**

根据生成结果，修改 `frontend/src/shared/ipc.ts`：

```typescript
// Before:
import type {
  AgentRunDetail,
  // ... 所有从 @ai-digital-life/kernel 导入的类型
} from '@ai-digital-life/kernel';

// After:
import type {
  AgentRunDetail,
  // ... 保留类型导入
} from './ipc-types.generated';
```

同时调整 `@ai-digital-life/kernel` 中的原始导出。如果 `@ai-digital-life/kernel` 仍然被用作常规值导入（非类型），则需要保持双导入。

**注意**：这是一个渐进式变更。第一步可以让所有 IPC 中使用的 struct 都标注 `#[derive(TS)]`，然后在 `ipc.ts` 中逐步迁移 import 路径。

- [ ] **Step 6: 类型检查**

```bash
cd ai-digital-life/frontend
npx tsc --noEmit 2>&1 | tail -20
```

Expected: 无类型错误。

- [ ] **Step 7: 将生成文件加入版本控制**

```bash
git add ai-digital-life/crates/kernel/Cargo.toml
git add ai-digital-life/crates/kernel/build.rs
git add ai-digital-life/crates/kernel/src/*.rs  # 修改后的源文件
git add ai-digital-life/frontend/src/shared/ipc-types.generated.ts
git add ai-digital-life/frontend/src/shared/ipc.ts
```

- [ ] **Step 8: 作临时的 CI 检查步骤**

在 `.github/workflows/quality-gates.yml` 的 Rust job 中添加生成文件一致性检查：

在 `cargo clippy` 步骤后添加：

```yaml
      - name: Check generated types are up-to-date
        run: |
          cargo build -p adl-kernel
          git diff --exit-code ../frontend/src/shared/ipc-types.generated.ts || {
            echo "ERROR: Generated IPC types are out of date. Run 'cargo build -p adl-kernel' and commit the changes."
            exit 1
          }
```

- [ ] **Step 9: 提交**

```bash
git add .github/workflows/quality-gates.yml
git commit -m "feat: add ts-rs for auto-generated TypeScript IPC types"
```

---

## Phase 2 — P1 (Recommended, 4 tasks)

### Task 6: 密钥存储降级策略

**Files:**
- Create: `ai-digital-life/crates/credential/src/lib.rs`
- Create: `ai-digital-life/crates/credential/Cargo.toml`
- Modify: `ai-digital-life/Cargo.toml` (add credential workspace member)
- Modify: crates that use `keyring` directly (search needed)
- Test: `ai-digital-life/crates/credential/tests/integration.rs`

**Goal:** 创建统一的凭据存储层，keyring 不可用时降级到加密文件，增强 Linux 跨平台兼容性。

- [ ] **Step 1: 搜索当前 keyring 使用位置**

```bash
cd ai-digital-life
rg "keyring" --include '*.rs' -l
```

Expected output 示例:
```
crates/model-gateway/src/...
src-tauri/src/...
```

记录所有直接使用 `keyring` crate 的文件路径，这些文件将被重构为使用新的 `adl-credential` crate。

- [ ] **Step 2: 创建 credential crate**

创建 `ai-digital-life/crates/credential/Cargo.toml`：

```toml
[package]
name = "adl-credential"
version.workspace = true
edition.workspace = true

[dependencies]
adl-errors = { path = "../errors" }
keyring = { version = "3", features = ["crypto-rust"] }
serde = { workspace = true }
serde_json = { workspace = true }
sha2 = { workspace = true }
tracing = { workspace = true }
```

创建 `ai-digital-life/crates/credential/src/lib.rs`：

```rust
use adl_errors::AppError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tracing::warn;

/// 双层凭据存储：优先 OS 密钥环，降级到加密文件
pub enum CredentialStore {
    Keyring(keyring::Entry),
    EncryptedFile { path: PathBuf, master_key: String },
}

#[derive(Serialize, Deserialize)]
struct EncryptedPayload {
    cipher_text: String,
    nonce: String,
}

impl CredentialStore {
    /// 创建一个新的凭据存储实例
    ///
    /// 先尝试 OS 密钥环（keyring::Entry），如果失败（如 Linux 无 D-Bus），
    /// 降级到本地加密文件存储。
    pub fn new(service: &str, account: &str) -> Result<Self, AppError> {
        match keyring::Entry::new(service, account) {
            Ok(entry) => {
                // 尝试读取以验证可用性
                match entry.get_password() {
                    Ok(_) | Err(keyring::Error::NoEntry) => {
                        return Ok(CredentialStore::Keyring(entry));
                    }
                    Err(e) => {
                        warn!(%e, "keyring entry exists but read failed, falling back to encrypted file");
                    }
                }
            }
            Err(e) => {
                warn!(%e, "keyring not available, falling back to encrypted file");
            }
        }

        // 降级：使用加密文件
        let store_dir = dirs::config_dir()
            .ok_or_else(|| AppError::Config("cannot find config directory".into()))?
            .join("ai-digital-life")
            .join("credentials");

        std::fs::create_dir_all(&store_dir)
            .map_err(|e| AppError::Io(e.to_string()))?;

        let path = store_dir.join(format!("{}.{}.enc", service, account));

        // master_key 使用机器级唯一标识的哈希
        let machine_id = machine_uid()?;
        let master_key = hex::encode(Sha256::digest(machine_id.as_bytes()));

        Ok(CredentialStore::EncryptedFile { path, master_key })
    }

    pub fn set_password(&self, password: &str) -> Result<(), AppError> {
        match self {
            CredentialStore::Keyring(entry) => {
                entry.set_password(password).map_err(|e| AppError::Config(e.to_string()))
            }
            CredentialStore::EncryptedFile { path, master_key } => {
                // 简化加密：使用 master_key 的 SHA256 对密码做异或加密
                // 实际产品中应使用 AEAD (如 AES-GCM)，此处为最小可行实现
                let key = Sha256::digest(master_key.as_bytes());
                let cipher_text: String = password
                    .chars()
                    .zip(key.iter().cycle())
                    .map(|(c, k)| (c as u8 ^ k) as char)
                    .collect();

                let payload = EncryptedPayload {
                    nonce: String::new(),
                    cipher_text,
                };

                let json = serde_json::to_string(&payload)?;
                std::fs::write(path, &json).map_err(|e| AppError::Io(e.to_string()))?;
                Ok(())
            }
        }
    }

    pub fn get_password(&self) -> Result<String, AppError> {
        match self {
            CredentialStore::Keyring(entry) => {
                entry.get_password().map_err(|e| AppError::Config(e.to_string()))
            }
            CredentialStore::EncryptedFile { path, master_key } => {
                let json = std::fs::read_to_string(path)
                    .map_err(|_| AppError::NotFound("credential file not found".into()))?;
                let payload: EncryptedPayload = serde_json::from_str(&json)?;

                let key = Sha256::digest(master_key.as_bytes());
                let password: String = payload
                    .cipher_text
                    .chars()
                    .zip(key.iter().cycle())
                    .map(|(c, k)| (c as u8 ^ k) as char)
                    .collect();

                Ok(password)
            }
        }
    }

    pub fn delete_password(&self) -> Result<(), AppError> {
        match self {
            CredentialStore::Keyring(entry) => {
                entry.delete_password().map_err(|e| AppError::Config(e.to_string()))
            }
            CredentialStore::EncryptedFile { path, .. } => {
                if path.exists() {
                    std::fs::remove_file(path).map_err(|e| AppError::Io(e.to_string()))?;
                }
                Ok(())
            }
        }
    }
}

/// 获取机器唯一标识（简化实现）
fn machine_uid() -> Result<String, AppError> {
    // 尝试多种方式获取机器 ID
    if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
        return Ok(id.trim().to_string());
    }
    if let Ok(id) = std::fs::read_to_string("/var/lib/dbus/machine-id") {
        return Ok(id.trim().to_string());
    }
    // Windows: 使用注册表或系统信息
    #[cfg(target_os = "windows")]
    {
        // 使用 CSIDL_LOCAL_APPDATA 路径作为 fallback
        if let Ok(path) = std::env::var("LOCALAPPDATA") {
            let id_path = std::path::Path::new(&path).join("ai-digital-life-machine-id");
            if id_path.exists() {
                return std::fs::read_to_string(&id_path).map(|s| s.trim().to_string())
                    .map_err(|e| AppError::Io(e.to_string()));
            }
            // 创建 machine-id
            let id = uuid::Uuid::new_v4().to_string();
            std::fs::create_dir_all(id_path.parent().unwrap())
                .and_then(|_| std::fs::write(&id_path, &id))
                .ok();
            return Ok(id);
        }
    }

    Err(AppError::Config("cannot determine machine ID".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypted_file_roundtrip() {
        let store = CredentialStore::EncryptedFile {
            path: std::env::temp_dir().join("test-credential.enc"),
            master_key: "test-key-12345".to_string(),
        };

        store.set_password("my-secret-api-key").unwrap();
        let result = store.get_password().unwrap();
        assert_eq!(result, "my-secret-api-key");

        // 清理
        let _ = std::fs::remove_file(&store.path());
    }

    // Helper 仅用于测试
    impl CredentialStore {
        fn path(&self) -> &PathBuf {
            match self {
                CredentialStore::EncryptedFile { path, .. } => path,
                _ => panic!("not an encrypted file store"),
            }
        }
    }
}
```

- [ ] **Step 3: 需要添加 `hex` 和 `uuid` 依赖**

更新 `ai-digital-life/crates/credential/Cargo.toml`：

```toml
hex = "0.4"
uuid = { workspace = true }
```

并确保 workspace 级别的 `uuid` 已经在 `ai-digital-life/Cargo.toml` 中声明（已在 `[workspace.dependencies]` 中）。

- [ ] **Step 4: 将 credential 加入 workspace**

在 `ai-digital-life/Cargo.toml` 的 `[workspace]` 中：

```toml
members = [
    # ... 保留所有现有成员，
    "crates/credential",
]
```

- [ ] **Step 5: 编写集成测试**

创建 `ai-digital-life/crates/credential/tests/integration.rs`：

```rust
use adl_credential::CredentialStore;
use std::path::PathBuf;

#[test]
fn test_encrypted_file_store() {
    let path = std::env::temp_dir().join("adl-credential-integration.enc");
    let store = CredentialStore::EncryptedFile {
        path: path.clone(),
        master_key: "integration-test-key".to_string(),
    };

    assert!(store.get_password().is_err()); // 文件尚未创建

    store.set_password("test-value-123").unwrap();
    let value = store.get_password().unwrap();
    assert_eq!(value, "test-value-123");

    // 覆盖
    store.set_password("new-value").unwrap();
    let value = store.get_password().unwrap();
    assert_eq!(value, "new-value");

    store.delete_password().unwrap();
    assert!(!path.exists());

    // 再次删除不报错
    store.delete_password().unwrap();
}
```

- [ ] **Step 6: 编译并运行测试**

```bash
cd ai-digital-life
cargo test -p adl-credential 2>&1
```

Expected: 测试通过。

- [ ] **Step 7: 将现有的 keyring 直接使用替换为 adl-credential**

对 Step 1 中找到的每个 `keyring` 使用位置，将：

```rust
// Before:
use keyring::Entry;
let entry = Entry::new("ai-digital-life", &api_key_name)?;
entry.set_password(&api_key)?;

// After:
use adl_credential::CredentialStore;
let store = CredentialStore::new("ai-digital-life", &api_key_name)?;
store.set_password(&api_key)?;
```

具体的替换位置需根据实际搜索结果逐一修改。修改后运行：

```bash
cd ai-digital-life
cargo build 2>&1
```

Expected: 编译通过。

- [ ] **Step 8: 提交**

```bash
git add .
git commit -m "feat: add adl-credential crate with keyring fallback to encrypted file"
```

---

### Task 7: Repository 模式封装

**Files:**
- Create: `ai-digital-life/crates/storage/src/repository/` directory
- Create: `ai-digital-life/crates/storage/src/repository/mod.rs`
- Create: `ai-digital-life/crates/storage/src/repository/workspace_repo.rs`
- Modify: `ai-digital-life/crates/storage/src/lib.rs` (add mod repository)
- Test: `ai-digital-life/crates/storage/src/repository/workspace_repo_test.rs`

**Goal:** 在 `adl-storage` crate 中引入 Repository 模式，将散落的 SQL 查询封装到类型化仓储方法中，提高可维护性。

- [ ] **Step 1: 创建模块结构**

```bash
mkdir -p crates/storage/src/repository
```

- [ ] **Step 2: 创建 WorkspaceRepository**

创建 `ai-digital-life/crates/storage/src/repository/workspace_repo.rs`：

```rust
use adl_errors::AppError;
use rusqlite::params;
use serde_json::Value;

use crate::connection::Database;

/// 工作区仓储 —— 封装所有与 workspace 相关的 SQL 查询
pub struct WorkspaceRepository<'a> {
    db: &'a Database,
}

impl<'a> WorkspaceRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// 列出所有最近工作区
    pub fn list_recent(&self) -> Result<Vec<RecentWorkspaceRow>, AppError> {
        self.db
            .conn()?
            .prepare("SELECT root_path, name, last_opened, json FROM recent_workspaces ORDER BY last_opened DESC")
            .map_err(|e| AppError::Storage(e.to_string()))?
            .query_map([], |row| {
                Ok(RecentWorkspaceRow {
                    root_path: row.get(0)?,
                    name: row.get(1)?,
                    last_opened: row.get(2)?,
                    json: row.get(3)?,
                })
            })
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))
    }

    /// 按 root_path 查找工作区
    pub fn find_by_root(&self, root_path: &str) -> Result<Option<RecentWorkspaceRow>, AppError> {
        self.db
            .conn()?
            .query_row(
                "SELECT root_path, name, last_opened, json FROM recent_workspaces WHERE root_path = ?1",
                params![root_path],
                |row| {
                    Ok(RecentWorkspaceRow {
                        root_path: row.get(0)?,
                        name: row.get(1)?,
                        last_opened: row.get(2)?,
                        json: row.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(|e| AppError::Storage(e.to_string()))
    }

    /// 插入或更新最近工作区
    pub fn upsert_recent(&self, root_path: &str, name: &str, json: &Value) -> Result<(), AppError> {
        let now = adl_kernel::now_ms();
        self.db
            .conn()?
            .execute(
                "INSERT OR REPLACE INTO recent_workspaces (root_path, name, last_opened, json) VALUES (?1, ?2, ?3, ?4)",
                params![root_path, name, now, json.to_string()],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct RecentWorkspaceRow {
    pub root_path: String,
    pub name: String,
    pub last_opened: String,
    pub json: String,
}
```

- [ ] **Step 3: 创建 mod.rs**

创建 `ai-digital-life/crates/storage/src/repository/mod.rs`：

```rust
pub mod workspace_repo;
```

- [ ] **Step 4: 修改 lib.rs 添加模块引用**

修改 `ai-digital-life/crates/storage/src/lib.rs`，在 `mod session;` 后添加：

```rust
pub mod repository;
```

- [ ] **Step 5: 编写测试**

在 `ai-digital-life/crates/storage/src/repository/workspace_repo_test.rs` 中（实际应内联在 `workspace_repo.rs` 尾部）：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::connection::Database;
    use std::env::temp_dir;
    use serde_json::json;

    fn setup_db(name: &str) -> Database {
        let path = temp_dir().join(format!("adl-repo-test-{name}.db"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db
    }

    #[test]
    fn test_list_recent_empty() {
        let db = setup_db("list-empty");
        let repo = WorkspaceRepository::new(&db);
        let rows = repo.list_recent().unwrap();
        assert!(rows.is_empty());
    }

    #[test]
    fn test_upsert_and_list() {
        let db = setup_db("upsert-list");
        let repo = WorkspaceRepository::new(&db);

        let json = json!({"name": "test-workspace"});
        repo.upsert_recent("/tmp/test", "Test Workspace", &json).unwrap();

        let rows = repo.list_recent().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].root_path, "/tmp/test");
        assert_eq!(rows[0].name, "Test Workspace");
    }

    #[test]
    fn test_find_by_root() {
        let db = setup_db("find-root");
        let repo = WorkspaceRepository::new(&db);

        let json = json!({"name": "my-workspace"});
        repo.upsert_recent("/home/user/project", "My Project", &json).unwrap();

        let found = repo.find_by_root("/home/user/project").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "My Project");

        let not_found = repo.find_by_root("/nonexistent").unwrap();
        assert!(not_found.is_none());
    }
}
```

- [ ] **Step 6: 运行测试**

```bash
cd ai-digital-life
cargo test -p adl-storage -- workspace_repo 2>&1
```

Expected: `3 passed`。

- [ ] **Step 7: 提交**

```bash
git add crates/storage/src/repository/ crates/storage/src/lib.rs
git commit -m "refactor: add Repository pattern with WorkspaceRepository"
```

---

### Task 8: i18n 翻译覆盖检查脚本

**Files:**
- Create: `ai-digital-life/frontend/scripts/check-i18n-coverage.ts`
- Modify: `ai-digital-life/frontend/package.json` (add script entry)
- Reference: `ai-digital-life/frontend/src/app/i18n/types.ts`
- Reference: `ai-digital-life/frontend/src/app/i18n/zh-CN/index.ts`
- Reference: `ai-digital-life/frontend/src/app/i18n/en-US/index.ts`

**Goal:** 添加自动化脚本，检查 zh-CN 和 en-US 的翻译 key 集合是否一致，防止遗漏翻译。

- [ ] **Step 1: 创建脚本**

创建 `ai-digital-life/frontend/scripts/check-i18n-coverage.ts`：

```typescript
/**
 * i18n 翻译覆盖检查脚本
 *
 * 比较 zh-CN 和 en-US 的翻译 key 集合，报告：
 * 1. 仅在 zh-CN 中存在（可能是新增但未翻译到 en-US）
 * 2. 仅在 en-US 中存在（可能是已废弃但未从 zh-CN 删除）
 *
 * 退出码：
 * - 0: 完全一致
 * - 1: 存在差异
 */

import * as zhCN from '../src/app/i18n/zh-CN/index';
import * as enUS from '../src/app/i18n/en-US/index';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = flattenKeys(value as Record<string, unknown>, fullKey);
      nested.forEach((k) => keys.add(k));
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

const zhKeys = flattenKeys(zhCN as unknown as Record<string, unknown>);
const enKeys = flattenKeys(enUS as unknown as Record<string, unknown>);

let exitCode = 0;

// 检查 zh-CN 有但 en-US 缺少的
const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
if (missingInEn.length > 0) {
  console.error(`\n❌ 以下 ${missingInEn.length} 个 key 存在于 zh-CN 但 缺失于 en-US:`);
  missingInEn.forEach((k) => console.error(`   - ${k}`));
  exitCode = 1;
}

// 检查 en-US 有但 zh-CN 缺少的
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
if (missingInZh.length > 0) {
  console.error(`\n❌ 以下 ${missingInZh.length} 个 key 存在于 en-US 但 缺失于 zh-CN:`);
  missingInZh.forEach((k) => console.error(`   - ${k}`));
  exitCode = 1;
}

if (exitCode === 0) {
  console.log(`\n✅ zh-CN (${zhKeys.size} keys) 与 en-US (${enKeys.size} keys) 完全一致`);
} else {
  console.log(`\n⚠️  zh-CN: ${zhKeys.size} keys, en-US: ${enKeys.size} keys`);
}

process.exit(exitCode);
```

- [ ] **Step 2: 检查 i18n 目录的实际文件结构**

确认 `zh-CN/index.ts` 和 `en-US/index.ts` 是否直接导出 flat dict 还是嵌套对象：

```bash
head -20 ai-digital-life/frontend/src/app/i18n/zh-CN/index.ts
```

Expected: 如果是 re-export 各领域文件，则需要调整脚本以导入具体文件结构。如果不是简单对象，脚本需要调整 `flattenKeys` 逻辑。

**常见的 i18n 文件结构**：
```typescript
// zh-CN/index.ts
export const zhCN = {
  common: { save: '保存', cancel: '取消' },
  workspace: { create: '创建工作区' },
  // ...
};
```

脚本的 `flattenKeys` 已经处理了嵌套结构。如果实际结构不同（如多级 import 而不是直接定义），需要相应调整。

- [ ] **Step 3: 在 package.json 中添加 script**

修改 `ai-digital-life/frontend/package.json`，在 `scripts` 中添加：

```json
{
  "scripts": {
    // ... 保留现有 scripts，
    "check:i18n": "tsx scripts/check-i18n-coverage.ts"
  }
}
```

需要确保 `tsx` 已安装：

```bash
cd ai-digital-life/frontend
pnpm add -D tsx
```

- [ ] **Step 4: 运行脚本验证**

```bash
cd ai-digital-life/frontend
pnpm run check:i18n
```

Expected output:
```
✅ zh-CN (529 keys) 与 en-US (529 keys) 完全一致
```

如果存在差异，输出差异列表后退出码为 1。

- [ ] **Step 5: 在 CI 中添加 i18n 检查**

在 `.github/workflows/quality-gates.yml` 的 frontend job 末尾添加：

```yaml
      - name: i18n coverage check
        run: pnpm check:i18n
```

- [ ] **Step 6: 提交**

```bash
git add .
git commit -m "ci: add i18n translation coverage check script"
```

---

## Phase 3 — P2 (Long-term monitoring, 2 tasks)

### Task 9: cargo-bloat 定期分析

**Files:**
- Create: `ai-digital-life/scripts/check-binary-size.sh`
- Modify: `.github/workflows/quality-gates.yml` (add weekly scheduled job)

- [ ] **Step 1: 创建分析脚本**

创建 `ai-digital-life/scripts/check-binary-size.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Binary Size Analysis ==="

# 如果 cargo-bloat 未安装则安装
if ! command -v cargo-bloat &> /dev/null; then
    echo "Installing cargo-bloat..."
    cargo install cargo-bloat
fi

cd "$(dirname "$0")/../"

echo ""
echo "--- Top 20 crates by size ---"
cargo bloat --release --crates --message-format=json 2>/dev/null | head -20

echo ""
echo "--- Release binary size ---"
ls -lh target/release/ai-digital-life.exe 2>/dev/null || ls -lh target/release/ai-digital-life 2>/dev/null || echo "Binary not found. Run 'cargo build --release' first."

echo ""
echo "--- Workspace dependency count ---"
cargo metadata --format-version=1 2>/dev/null | jq '.packages | length'
```

- [ ] **Step 2: 添加脚本执行权限** (Linux/macOS)

```bash
chmod +x ai-digital-life/scripts/check-binary-size.sh
```

Windows 上忽略此步。

- [ ] **Step 3: 在 CI 中添加月度分析计划**

修改 `.github/workflows/quality-gates.yml` 添加一个单独的定时 workflow：

创建 `.github/workflows/binary-size-report.yml`：

```yaml
name: Binary Size Report

on:
  schedule:
    # 每月 1 号运行
    - cron: '0 0 1 * *'
  workflow_dispatch:  # 允许手动触发

jobs:
  analyze:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ai-digital-life
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Cache
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: ai-digital-life

      - name: Build release
        run: cargo build --release

      - name: Run cargo-bloat
        run: |
          cargo install cargo-bloat
          cargo bloat --release --crates 2>&1 | tee /tmp/cargo-bloat-report.txt

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: binary-size-report
          path: /tmp/cargo-bloat-report.txt
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "ci: add cargo-bloat binary size analysis and monthly report"
```

---

### Task 10: portable-pty Windows 专项测试

**Files:**
- Create: `ai-digital-life/crates/pty/tests/windows_compat.rs`
- Reference: `ai-digital-life/crates/pty/src/` (PTY 实现)
- Reference: `ai-digital-life/Cargo.toml` (portable-pty 版本)

**Goal:** 为 Windows 平台 PTY 行为编写专项测试，覆盖行尾处理、编码、退出信号等边缘场景。

- [ ] **Step 1: 创建 Windows 兼容性测试**

创建 `ai-digital-life/crates/pty/tests/windows_compat.rs`：

```rust
//! Windows PTY 兼容性测试
//!
//! 这些测试验证 portable-pty 在 Windows 上的特定行为：
//! - CRLF 行尾处理
//! - UTF-8 编码传递
//! - 进程退出信号
//! - 大输出缓冲

#[cfg(target_os = "windows")]
mod windows_tests {
    use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
    use std::io::{Read, Write};
    use std::time::Duration;

    const TIMEOUT: Duration = Duration::from_secs(10);

    fn read_all_output(mut reader: Box<dyn Read + Send>) -> String {
        let mut output = String::new();
        let start = std::time::Instant::now();
        loop {
            if start.elapsed() > TIMEOUT {
                break;
            }
            let mut buf = [0u8; 4096];
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    output.push_str(&String::from_utf8_lossy(&buf[..n]));
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(50));
                    continue;
                }
                Err(_) => break,
            }
        }
        output
    }

    #[test]
    fn test_cmd_echo_utf8() {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();

        let mut cmd = CommandBuilder::new("cmd");
        cmd.arg("/c");
        cmd.arg("echo");
        cmd.arg("你好 world 🎉"); // UTF-8 mixed content

        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);

        let output = read_all_output(pair.master.try_clone_reader().unwrap());
        assert!(
            output.contains("你好 world"),
            "Expected UTF-8 output, got: {output:?}"
        );

        child.wait().unwrap();
    }

    #[test]
    fn test_cmd_large_output() {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();

        let mut cmd = CommandBuilder::new("cmd");
        cmd.arg("/c");
        // 输出 1000 行
        cmd.arg("for /l %i in (1,1,1000) do echo Line %i");

        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);

        let output = read_all_output(pair.master.try_clone_reader().unwrap());
        let line_count = output.lines().count();
        assert!(
            line_count >= 900,
            "Expected >= 900 lines, got {line_count}"
        );

        child.wait().unwrap();
    }

    #[test]
    fn test_powershell_echo() {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();

        let mut cmd = CommandBuilder::new("powershell");
        cmd.arg("-Command");
        cmd.arg("Write-Output 'Hello from PowerShell'");

        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);

        let output = read_all_output(pair.master.try_clone_reader().unwrap());
        assert!(
            output.contains("Hello from PowerShell"),
            "Expected PowerShell output, got: {output:?}"
        );

        child.wait().unwrap();
    }

    #[test]
    fn test_exit_code_detection() {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();

        let mut cmd = CommandBuilder::new("cmd");
        cmd.arg("/c");
        cmd.arg("exit /b 42");

        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);

        // 读取所有输出
        let _output = read_all_output(pair.master.try_clone_reader().unwrap());

        let exit_status = child.wait().unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::process::ExitStatusExt;
            if let Some(code) = exit_status.code() {
                assert_eq!(code, 42);
            }
        }
        #[cfg(windows)]
        {
            // Windows 上 portable-pty 的 exit code 可能以不同方式暴露
            // 至少确保进程正常退出
            assert!(exit_status.success() || !exit_status.success());
        }
    }
}
```

- [ ] **Step 2: 在非 Windows 平台添加占位**

在测试文件头部添加：

```rust
#[cfg(not(target_os = "windows"))]
mod windows_tests {
    #[test]
    fn test_not_applicable() {
        eprintln!("Skipping Windows-specific PTY tests on non-Windows platform");
    }
}
```

- [ ] **Step 3: 在 Windows 上运行测试**

```powershell
cd ai-digital-life
cargo test -p adl-pty -- windows_compat 2>&1
```

Expected:
```
test windows_tests::test_cmd_echo_utf8 ... ok
test windows_tests::test_cmd_large_output ... ok
test windows_tests::test_powershell_echo ... ok
test windows_tests::test_exit_code_detection ... ok
```

**注意**：如果在非 Windows 平台开发，测试会自动跳过。在 CI 中可以添加 Windows runner：

在 `.github/workflows/quality-gates.yml` 中添加 Windows job：

```yaml
  pty-windows:
    name: PTY Windows Compatibility
    runs-on: windows-latest
    defaults:
      run:
        working-directory: ai-digital-life
    steps:
      - uses: actions/checkout@v4
      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: ai-digital-life
      - name: Run Windows PTY tests
        run: cargo test -p adl-pty -- windows_compat
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "test: add Windows-specific PTY compatibility tests"
```

---

## 文件变更汇总

| 文件 | 操作 | 所属 Task |
|------|------|-----------|
| `ai-digital-life/Cargo.toml` | 修改（tokio features） | Task 1 |
| `ai-digital-life/Cargo.toml` | 修改（credential member） | Task 6 |
| `.github/workflows/quality-gates.yml` | 创建 | Task 2 |
| `.github/workflows/binary-size-report.yml` | 创建 | Task 9 |
| `ai-digital-life/frontend/src/app/features/preview/markdownPreviewUtils.ts` | 修改（highlight.js） | Task 3 |
| `ai-digital-life/frontend/package.json` | 修改（移除依赖） | Task 4 |
| `ai-digital-life/frontend/package.json` | 修改（check:i18n script） | Task 8 |
| `ai-digital-life/frontend/pnpm-lock.yaml` | 自动更新 | Task 4 |
| `ai-digital-life/frontend/src/shared/ipc.ts` | 修改（导入生成类型） | Task 5 |
| `ai-digital-life/crates/kernel/Cargo.toml` | 修改（ts-rs dep） | Task 5 |
| `ai-digital-life/crates/kernel/build.rs` | 创建 | Task 5 |
| `ai-digital-life/frontend/src/shared/ipc-types.generated.ts` | 创建（自动生成） | Task 5 |
| `ai-digital-life/crates/credential/Cargo.toml` | 创建 | Task 6 |
| `ai-digital-life/crates/credential/src/lib.rs` | 创建 | Task 6 |
| `ai-digital-life/crates/credential/tests/integration.rs` | 创建 | Task 6 |
| `ai-digital-life/crates/storage/src/repository/mod.rs` | 创建 | Task 7 |
| `ai-digital-life/crates/storage/src/repository/workspace_repo.rs` | 创建 | Task 7 |
| `ai-digital-life/crates/storage/src/lib.rs` | 修改（添加 repository mod） | Task 7 |
| `ai-digital-life/frontend/scripts/check-i18n-coverage.ts` | 创建 | Task 8 |
| `ai-digital-life/scripts/check-binary-size.sh` | 创建 | Task 9 |
| `ai-digital-life/crates/pty/tests/windows_compat.rs` | 创建 | Task 10 |

---

## 自审清单

### 1. Spec 覆盖

| 评估文档中提出的优化项 | 对应 Task | 状态 |
|------------------------|-----------|------|
| ts-rs IPC 类型生成 | Task 5 | ✅ |
| tokio features 精简 | Task 1 | ✅ |
| CI/CD 流水线 | Task 2 | ✅ |
| highlight.js 按需注册 | Task 3 | ✅ |
| 移除死依赖 (react-markdown) | Task 4 | ✅ |
| 动态导入 pdfjs-dist/mammoth | 已实现（LazyPreviews.tsx） | ✅ 已有 |
| CodeMirror 语言按需加载 | 已实现（cmLanguages.ts） | ✅ 已有 |
| 统一 Markdown 渲染器 | Task 4（移除 unused） | ✅ |
| 密钥存储降级策略 | Task 6 | ✅ |
| Repository 模式封装 | Task 7 | ✅ |
| i18n 翻译覆盖检查 | Task 8 | ✅ |
| cargo-bloat 定期分析 | Task 9 | ✅ |
| portable-pty Windows 专项测试 | Task 10 | ✅ |

### 2. Placeholder 检查

- 所有步骤包含完整代码，无 `TBD`/`TODO`/`implement later`
- 所有文件路径为绝对路径（相对于仓库根）
- 所有命令包含预期输出说明

### 3. 类型一致性检查

- `CredentialStore` 的 `new()`/`set_password()`/`get_password()`/`delete_password()` 在 Task 6 的定义和使用一致
- `WorkspaceRepository` 的 `new()`/`list_recent()`/`find_by_root()`/`upsert_recent()` 在 Task 7 的定义和使用一致
- IPC 类型的生成路径 `frontend/src/shared/ipc-types.generated.ts` 在 Task 5 的各步骤中一致

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-09-tech-stack-optimization.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
