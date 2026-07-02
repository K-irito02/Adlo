# 重构洞察 2026-07-02 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 执行第 22 次重构洞察发现的 49 项问题修复，聚焦 🔴 高优先级 19 项 + 关键 🟡 中优先级项

**Architecture:** 按风险递增分 6 个 Phase 执行。Phase 1-2 为低风险快速修复（死代码、契约修复、CSS 颜色 token、CSS 去重），Phase 3-4 为文件/函数拆分（Rust 大函数、前端大 Hook/组件），Phase 5-6 为 Store 切片分解、React.memo、i18n 和 Rust 错误处理改进。每 Phase 完成后运行验收门禁。

**Tech Stack:** TypeScript + React 19 + Zustand + Tauri 2.x + Rust

**洞察报告:** `docs/重构洞察/refactor-insight-2026-07-02.md`

## Global Constraints

- 所有修改不得破坏现有功能及 UI/UX
- 最小变更原则：仅修复发现的问题，不做无关变更
- 每 Phase 完成后运行四维门禁：`pnpm --dir frontend run typecheck` + `pnpm --dir frontend run lint` + `cargo check --workspace` + `cargo clippy --workspace -- -D warnings`
- 工作目录：`.worktrees/refactor-insight-main/ai-digital-life`
- Node.js 环境变量：`$env:Path = "D:\Program Files\nodejs;$env:Path"`
- Rust 环境变量：`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- 禁止跨 Phase：不引入超出当前 Phase 范围的功能或架构变更
- 所有 UI 展示文本必须使用 i18n key（包括错误消息）

## File Structure

| Phase | 操作类型 | 涉及文件 |
|-------|---------|---------|
| 1 | 删除死代码 + 契约修复 + 存储键统一 | ipc-types.generated.ts, ipc/shared.ts, browserSliceShared.ts, 6 个 browser slice 文件, browser.ts (IPC), main.rs |
| 2 | CSS 颜色 token + 重复消除 + 拆分 | browser-webview.css, file-operations.css, tree-shared.css(新), browser-history.css(新), browser-tree-entry.css(新), diff-viewer.css, themes.css |
| 3 | Rust 大文件/大函数拆分 | webview2_message.rs(拆为 5 模块), browser_webview.rs, tree.rs, agent_pipeline_stream.rs |
| 4 | 前端 Hook/组件拆分 | useTerminalPanel.ts(拆为 3 Hook), useBrowserWebView.ts(拆为 3 Hook), BrowserPanel.tsx(提取子 Hook + 子组件) |
| 5 | Store 切片分解 | browserFoldersDeletion.ts(新), browserBookmarkHelpers.ts(新), githubRepoDeleteHelpers.ts(新), editorActionsHelpers.ts(新) |
| 6 | React.memo + i18n + Rust 错误处理 | TreeNodeRow.tsx, JobRow.tsx, PatchFileCard.tsx, PatchHunkCard.tsx, ShortcutCard.tsx, ciSlice.ts, githubSlice.ts, githubRepoSlice.ts, setup.rs, git.rs, patch_apply.rs, manager.rs, webview2_message.rs |

---

## Phase 1: 🔴 快速修复（死代码 + 契约 + 存储键 + 颜色）

### Task 1: 删除死代码（ipc-types.generated.ts + createIpcError）

**Files:**
- Delete: `frontend/src/shared/ipc-types.generated.ts` (217行)
- Modify: `frontend/src/shared/ipc/shared.ts:20-22` (删除 createIpcError 函数)

**Interfaces:** 无依赖，无产出

- [ ] **Step 1: 确认 ipc-types.generated.ts 零引用**

Run: `cd ai-digital-life && pnpm exec grep -r "ipc-types.generated" frontend/src --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: 无匹配

- [ ] **Step 2: 确认 createIpcError 零引用**

Run: `cd ai-digital-life && pnpm exec grep -rn "createIpcError" frontend/src --include="*.ts" --include="*.tsx" | grep -v "shared/ipc/shared.ts"`
Expected: 无匹配

- [ ] **Step 3: 删除 ipc-types.generated.ts**

删除 `frontend/src/shared/ipc-types.generated.ts`

- [ ] **Step 4: 删除 createIpcError 函数**

从 `frontend/src/shared/ipc/shared.ts` 删除 `createIpcError` 函数（L20-22）

- [ ] **Step 5: 类型检查 + lint**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/shared/ipc-types.generated.ts frontend/src/shared/ipc/shared.ts
git commit -m "refactor(shared): remove dead code - ipc-types.generated.ts (217 lines) + createIpcError function"
```

### Task 2: 统一 browser 存储键常量到 browserSliceShared.ts

**Files:**
- Modify: `frontend/src/app/stores/slices/browserSliceShared.ts` (添加所有 BROWSER_*_KEY 常量导出)
- Modify: `frontend/src/app/stores/slices/browserSlice.ts` (删除本地定义，改为 import)
- Modify: `frontend/src/app/stores/slices/browserTabsSlice.ts` (删除本地定义，改为 import)
- Modify: `frontend/src/app/stores/slices/browserHistorySlice.ts` (删除本地定义，改为 import)
- Modify: `frontend/src/app/stores/slices/browserBookmarkSlice.ts` (删除本地定义，改为 import)
- Modify: `frontend/src/app/stores/slices/browserFoldersUtils.ts` (删除本地定义，改为 import)

**Interfaces:**
- Produces: `browserSliceShared.ts` 导出所有 BROWSER_*_KEY 常量

- [ ] **Step 1: 读取 browserSliceShared.ts 当前内容**

Read `frontend/src/app/stores/slices/browserSliceShared.ts`

- [ ] **Step 2: 在 browserSliceShared.ts 添加所有缺失的存储键常量**

在 `browserSliceShared.ts` 中添加（如缺失）：
```typescript
export const BROWSER_TABS_KEY = 'adl-ui:browser-tabs';
export const BROWSER_HISTORY_KEY = 'adl-ui:browser-history';
export const BROWSER_BOOKMARKS_KEY = 'adl-ui:browser-bookmarks';
export const BROWSER_TAB_FOLDERS_KEY = 'adl-ui:browser-tab-folders';
export const BROWSER_ACTIVE_TAB_KEY = 'adl-ui:browser-active-tab';
export const BROWSER_TREE_EXPANDED_KEY = 'adl-ui:browser-tree-expanded';
export const BROWSER_WORKSPACE_EXPANDED_KEY = 'adl-ui:browser-workspace-expanded';
```
保留已有的 `BROWSER_BOOKMARKS_STORAGE_KEY` 作为别名导出（向后兼容）：`export const BROWSER_BOOKMARKS_STORAGE_KEY = BROWSER_BOOKMARKS_KEY;`

- [ ] **Step 3: 在 5 个文件中删除本地常量定义并改为 import**

每个文件：
1. 删除本地 `const BROWSER_*_KEY = '...'` 定义
2. 添加 `import { BROWSER_*_KEY } from './browserSliceShared';`

- [ ] **Step 4: 类型检查 + lint**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/slices/
git commit -m "refactor(stores): unify browser storage key constants to browserSliceShared.ts leaf module"
```

### Task 3: 修复 IPC 契约 browser_fetch_page_meta

**Files:**
- Modify: `src-tauri/src/main.rs` (从 invoke_handler 移除 browser_fetch_page_meta 注册)

**Interfaces:**
- Produces: 移除未暴露的 Tauri 命令注册，与前端 IPC 契约对齐

**决策依据**：该命令仅供内部使用（Rust 侧的 fetchPageMeta 通过 fetchPageMeta.ts HTTP prefetch 实现），前端不通过 IPC 调用，因此从注册列表移除。

- [ ] **Step 1: 确认 frontend 无 fetchPageMeta IPC 调用**

Run: `cd ai-digital-life && pnpm exec grep -rn "fetchPageMeta" frontend/src --include="*.ts" --include="*.tsx" | grep -v "fetchPageMeta.ts" | grep -v "node_modules"`
Expected: 仅在 `fetchPageMeta.ts` 中作为 HTTP prefetch 函数存在，无 IPC invoke 调用

- [ ] **Step 2: 从 main.rs 移除注册**

读取 `src-tauri/src/main.rs` 第 180 行附近，移除 `browser_fetch_page_meta` 从 `invoke_handler` 的注册列表

- [ ] **Step 3: 编译检查 + clippy**

Run: `cd ai-digital-life && $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace && cargo clippy --workspace -- -D warnings`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/main.rs
git commit -m "fix(ipc): remove unused browser_fetch_page_meta command registration - not exposed in BrowserBridge"
```

### Task 4: 修复 CSS 硬编码颜色（browser-webview + file-operations）

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/browser-webview.css:118` (`#fff` → `var(--bg-strong)`)
- Modify: `frontend/src/styles/regions/rightpanel/file-operations.css:110,125` (硬编码 rgba → token)

**Interfaces:** 无依赖

- [ ] **Step 1: 修复 browser-webview.css:118**

将 `background: #fff` 改为 `background: var(--bg-strong)`

- [ ] **Step 2: 修复 file-operations.css:110,125**

在 `themes.css` 添加：
```css
--overlay-bg-1: rgba(255, 255, 255, 0.12);
--overlay-bg-2: rgba(255, 255, 255, 0.18);
```
（如 themes.css 已有类似 token，复用之）

将 `file-operations.css:110` 的 `rgba(255, 255, 255, 0.12)` 改为 `var(--overlay-bg-1)`
将 `file-operations.css:125` 的 `rgba(255, 255, 255, 0.18)` 改为 `var(--overlay-bg-2)`

- [ ] **Step 3: 类型检查 + lint**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/styles/
git commit -m "fix(css): replace hardcoded #fff and rgba(255,255,255,*) with theme tokens"
```

---

## Phase 2: 🔴 CSS 重复消除 + 拆分

### Task 5: 提取 tree-shared.css（消除 ~200 行重复）

**Files:**
- Create: `frontend/src/styles/regions/rightpanel/tree-shared.css` (~200 行共享规则)
- Modify: `frontend/src/styles/regions/rightpanel/files-navigator.css` (移除重复规则，添加 @import)
- Modify: `frontend/src/styles/regions/rightpanel/file-tree-core.css` (移除重复规则，添加 @import)

**Interfaces:** 无依赖

- [ ] **Step 1: 识别重复规则**

读取 `files-navigator.css:205-543` 和 `file-tree-core.css:55-547`，对比找出 20+ 个完全相同的规则块

- [ ] **Step 2: 创建 tree-shared.css**

将重复规则移入 `frontend/src/styles/regions/rightpanel/tree-shared.css`

- [ ] **Step 3: 修改 files-navigator.css 和 file-tree-core.css**

在两个文件头部添加 `@import './tree-shared.css';`，删除已移入 tree-shared.css 的重复规则

- [ ] **Step 4: 类型检查 + lint**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/styles/regions/rightpanel/
git commit -m "refactor(css): extract tree-shared.css to eliminate ~200 lines duplication between files-navigator and file-tree-core"
```

### Task 6: 拆分 browser-webview.css (954行) 为 4 个子文件

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/browser-webview.css` (保留核心 iframe 容器样式，~300 行)
- Create: `frontend/src/styles/regions/rightpanel/browser-history.css` (~150 行)
- Create: `frontend/src/styles/regions/rightpanel/browser-tree-entry.css` (~250 行)
- Create: `frontend/src/styles/regions/rightpanel/browser-flat-list.css` (~90 行)
- Modify: `frontend/src/styles/regions/rightpanel/index.css` 或对应 barrel (添加新 @import)

**Interfaces:** 无依赖

- [ ] **Step 1: 读取 browser-webview.css 全文，按关注点切分**

读取 `frontend/src/styles/regions/rightpanel/browser-webview.css`，识别 4 个关注点边界：
- 1-100: 搜索区域 + iframe 容器（保留）
- 316-466: 历史记录样式 → `browser-history.css`
- 584-833: 树条目样式 → `browser-tree-entry.css`
- 863-954: 扁平列表样式 → `browser-flat-list.css`

- [ ] **Step 2: 创建 3 个新文件并迁移规则**

将对应行数的规则块迁移到新文件，每个文件添加注释说明职责

- [ ] **Step 3: 在 browser-webview.css 顶部添加 @import**

```css
@import './browser-history.css';
@import './browser-tree-entry.css';
@import './browser-flat-list.css';
```

- [ ] **Step 4: 类型检查 + lint**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/styles/regions/rightpanel/
git commit -m "refactor(css): split browser-webview.css (954 lines) into 4 focused files - history/tree-entry/flat-list extracted"
```

### Task 7: 优化 diff-viewer.css !important（80-97 + 209-245）

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/diff-viewer.css:80-97` (6 处 `border: none !important`)
- Modify: `frontend/src/styles/regions/rightpanel/diff-viewer.css:209-245` (10 处按钮 !important)

**Interfaces:** 无依赖

- [ ] **Step 1: 读取 diff-viewer.css:80-97 和 209-245**

读取目标行范围，理解选择器层级

- [ ] **Step 2: 替换 80-97 行的 `border: none !important`**

将 `.cm-merge-gutter { border: none !important; }` 改为更高特异性：
```css
.adl-cm-diff-viewer .cm-merge-gutter.cm-merge-gutter {
  border: none;
}
```

- [ ] **Step 3: 替换 209-245 行按钮 !important**

通过增加父选择器层级提升优先级，移除 !important

- [ ] **Step 4: 验证 !important 数量减少**

Run: `cd ai-digital-life && (Select-String -Path frontend\src\styles\regions\rightpanel\diff-viewer.css -Pattern '!important' -AllMatches).Matches.Count`
Expected: ≤ 52（原 68 - 16 优化）

- [ ] **Step 5: 类型检查 + lint**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/styles/regions/rightpanel/diff-viewer.css
git commit -m "refactor(css): reduce diff-viewer.css !important from 68 to ~52 using higher specificity selectors"
```

---

## Phase 3: 🔴 Rust 大文件/大函数拆分

### Task 8: 拆分 webview2_message.rs (655行) + 提取 register_webview2_handler

**Files:**
- Modify: `crates/browser/src/webview2_message.rs` (保留 webview2_messaging 入口 + dedup state，~150 行)
- Create: `crates/browser/src/webview2_postmessage.rs` (~110 行，setup_webview2_messaging)
- Create: `crates/browser/src/webview2_title.rs` (~130 行，setup_document_title_handler)
- Create: `crates/browser/src/webview2_favicon.rs` (~120 行，setup_favicon_changed_handler)
- Create: `crates/browser/src/webview2_history.rs` (~160 行，setup_history_changed_handler + spawn_spa_fallback + dedup_history_url)
- Modify: `crates/browser/src/lib.rs` (添加 mod 声明 + pub use)

**Interfaces:**
- Produces: `register_webview2_handler<T>(webview, handler_name, factory)` 泛型 helper（在 webview2_message.rs 或独立模块）

- [ ] **Step 1: 读取 webview2_message.rs 全文**

读取 `crates/browser/src/webview2_message.rs`，理解 4 个 setup_* 函数的重复模式

- [ ] **Step 2: 提取 register_webview2_handler 泛型 helper**

在 webview2_message.rs 中添加：
```rust
fn register_webview2_handler<T>(
    webview: &WebviewWindow,
    handler_name: &str,
    factory: impl Fn(WebviewWindow) -> T + Send + 'static,
) where T: FnMut(Vec<String>) + Send + 'static {
    let controller = webview.controller();
    let dispatcher = controller.CoreWebView2().unwrap();
    let handler = factory(webview.clone());
    dispatcher.AddWebMessageReceived(handler);
    // ...
}
```
（实际签名根据代码结构调整）

- [ ] **Step 3: 创建 4 个新文件并迁移函数**

将 4 个 `setup_*` 函数迁移到对应文件，使用 `register_webview2_handler` 消除样板代码

- [ ] **Step 4: 修改 lib.rs 添加 mod 声明**

```rust
mod webview2_postmessage;
mod webview2_title;
mod webview2_favicon;
mod webview2_history;

pub use webview2_message::*;
```

- [ ] **Step 5: 拆分 setup_history_changed_handler (157行)**

在 `webview2_history.rs` 中拆分为：
- `build_history_handler()` 构造闭包
- `spawn_spa_fallback()` 抽出 2s fallback 线程
- `dedup_history_url()` 抽出去重逻辑

- [ ] **Step 6: 编译检查 + clippy + 测试**

Run: `cd ai-digital-life && $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace && cargo clippy --workspace -- -D warnings && cargo test --workspace`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add crates/browser/src/
git commit -m "refactor(browser): split webview2_message.rs (655 lines) into 5 modules + extract register_webview2_handler generic helper"
```

### Task 9: 拆分其他 Rust 大函数（create_for_tab + list_tree_inner + emit_model_stream_events）

**Files:**
- Modify: `crates/browser/src/browser_webview.rs:42-129` (`BrowserManager::create_for_tab` 87行)
- Modify: `crates/workspace/src/tree.rs:46-133` (`list_tree_inner` 87行)
- Modify: `src-tauri/src/commands/agent_pipeline_stream.rs:6-93` (`emit_model_stream_events` 87行)

**Interfaces:** 无依赖

- [ ] **Step 1: 拆分 BrowserManager::create_for_tab**

提取 `setup_webview2_handlers(webview, tab_id, label)` 为独立函数
提取 `apply_color_scheme_to_webview(webview)` 为独立函数

- [ ] **Step 2: 拆分 list_tree_inner**

提取 `process_tree_entry(root, entry, remaining)` 处理单个 entry
保留主函数的排序逻辑

- [ ] **Step 3: 拆分 emit_model_stream_events**

提取 `emit_stream_event(app, run_id, seq, event_type, payload)` helper
将分块逻辑提取为 `chunk_model_content()`（测试中已有同名函数 L100，可直接复用）

- [ ] **Step 4: 编译检查 + clippy + 测试**

Run: `cd ai-digital-life && $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace && cargo clippy --workspace -- -D warnings && cargo test --workspace`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add crates/browser/src/browser_webview.rs crates/workspace/src/tree.rs src-tauri/src/commands/agent_pipeline_stream.rs
git commit -m "refactor: split 3 large Rust functions (create_for_tab, list_tree_inner, emit_model_stream_events) - each >80 lines"
```

---

## Phase 4: 🔴 前端 Hook/组件拆分

### Task 10: 拆分 useTerminalPanel.ts (323行) 为 3 个子 Hook

**Files:**
- Modify: `frontend/src/app/features/terminal/useTerminalPanel.ts` (保留为 orchestrator，~80 行)
- Create: `frontend/src/app/features/terminal/useTerminalTabActions.ts` (~100 行，标签切换/关闭/重命名)
- Create: `frontend/src/app/features/terminal/useTerminalShellManagement.ts` (~80 行，shell 选择/菜单)
- Create: `frontend/src/app/features/terminal/useTerminalViewport.ts` (~70 行，xterm 实例与滚动)

**Interfaces:**
- Produces: 3 个新 Hook，useTerminalPanel 组合并暴露统一 API

- [ ] **Step 1: 读取 useTerminalPanel.ts 全文，按关注点切分**

读取 `frontend/src/app/features/terminal/useTerminalPanel.ts`，识别 3 个关注点边界

- [ ] **Step 2: 创建 3 个新 Hook 文件**

将对应逻辑迁移到新文件，每个 Hook 单一职责

- [ ] **Step 3: 修改 useTerminalPanel.ts 为 orchestrator**

```typescript
export function useTerminalPanel() {
  const tabActions = useTerminalTabActions();
  const shellManagement = useTerminalShellManagement();
  const viewport = useTerminalViewport();
  return { ...tabActions, ...shellManagement, ...viewport };
}
```

- [ ] **Step 4: 类型检查 + lint + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint && pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/terminal/
git commit -m "refactor(terminal): split useTerminalPanel.ts (323 lines) into 3 focused hooks - tabActions/shellManagement/viewport"
```

### Task 11: 拆分 useBrowserWebView.ts (308行) 为 3 个子 Hook

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserWebView.ts` (保留为 orchestrator，~70 行)
- Create: `frontend/src/app/features/browser/useWebViewLifecycle.ts` (~90 行，create/destroy/activate)
- Create: `frontend/src/app/features/browser/useWebViewNavigation.ts` (~80 行，navigate/goBack/goForward/reload)
- Create: `frontend/src/app/features/browser/useWebViewBounds.ts` (~70 行，setBounds/滚动同步)

**Interfaces:**
- Produces: 3 个新 Hook，useBrowserWebView 组合并暴露统一 API

- [ ] **Step 1: 读取 useBrowserWebView.ts 全文，按关注点切分**

- [ ] **Step 2: 创建 3 个新 Hook 文件**

- [ ] **Step 3: 修改 useBrowserWebView.ts 为 orchestrator**

- [ ] **Step 4: 类型检查 + lint + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint && pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/
git commit -m "refactor(browser): split useBrowserWebView.ts (308 lines) into 3 focused hooks - lifecycle/navigation/bounds"
```

### Task 12: 拆分 BrowserPanel.tsx (841行) - 提取子 Hook + 子组件

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx` (降至 ~500 行)
- Create: `frontend/src/app/features/browser/useBrowserIframeState.ts` (~60 行，iframe 错误/历史状态)
- Create: `frontend/src/app/features/browser/useBrowserNavigatorState.ts` (~70 行，mode/address/path 状态)
- Create: `frontend/src/app/features/browser/useBrowserZoomState.ts` (~30 行，zoomLevel)
- Create: `frontend/src/app/features/browser/BrowserIframeErrorOverlay.tsx` (~50 行，iframe 错误展示)

**Interfaces:**
- Produces: 3 个新 Hook + 1 个新子组件

- [ ] **Step 1: 读取 BrowserPanel.tsx 全文，识别 9 组 useState 的关注点边界**

读取 `frontend/src/app/features/browser/BrowserPanel.tsx`，按 useState 分组：
- iframe 状态（loadError/blockedDetected/history）→ `useBrowserIframeState`
- navigator 状态（mode/address/selectedTreePath）→ `useBrowserNavigatorState`
- zoom（zoomLevel）→ `useBrowserZoomState`

- [ ] **Step 2: 创建 3 个子 Hook**

将对应 useState + useEffect 逻辑迁移到新 Hook

- [ ] **Step 3: 创建 BrowserIframeErrorOverlay 子组件**

将 iframe 错误展示 JSX 抽离为独立组件

- [ ] **Step 4: 修改 BrowserPanel.tsx 使用新 Hook 和子组件**

```typescript
export function BrowserPanel() {
  const iframeState = useBrowserIframeState();
  const navigatorState = useBrowserNavigatorState();
  const zoomState = useBrowserZoomState();
  // ... 仅保留编排逻辑
}
```

- [ ] **Step 5: 类型检查 + lint + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint && pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 6: 验证 BrowserPanel.tsx 行数**

Run: `cd ai-digital-life && (Get-Content frontend\src\app\features\browser\BrowserPanel.tsx).Count`
Expected: ≤ 600

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/features/browser/
git commit -m "refactor(browser): split BrowserPanel.tsx (841 lines) - extract 3 sub-hooks + IframeErrorOverlay component"
```

---

## Phase 5: 🟡 Store 切片分解

### Task 13: 提取 browserFoldersDeletion.ts + browserBookmarkHelpers.ts 纯函数

**Files:**
- Create: `frontend/src/app/stores/slices/browserFoldersDeletion.ts` (~150 行，删除操作纯函数)
- Create: `frontend/src/app/stores/slices/browserBookmarkHelpers.ts` (~150 行，bookmark 纯函数)
- Modify: `frontend/src/app/stores/slices/browserFoldersSlice.ts` (424→~280 行)
- Modify: `frontend/src/app/stores/slices/browserBookmarkSlice.ts` (389→~200 行)

**Interfaces:**
- Produces: 2 个新纯函数模块

- [ ] **Step 1: 读取 browserFoldersSlice.ts，识别 browserDeleteAllTabsInNode + browserDeleteOwnTabsInNode 的计算逻辑**

- [ ] **Step 2: 创建 browserFoldersDeletion.ts**

将 nodePath 解析、tabId 收集、workspace bookmark 过滤、folder 清理逻辑提取为纯函数：
- `computeDeleteAllTabsOutcome(state, nodePath)`
- `computeDeleteOwnTabsOutcome(state, nodePath)`

- [ ] **Step 3: 修改 browserFoldersSlice.ts 调用纯函数**

slice 仅负责 `set()` 调用：
```typescript
browserDeleteAllTabsInNode: (nodePath) => set((state) => {
  const { nextTabs, nextFolders, nextBookmarks } = computeDeleteAllTabsOutcome(state, nodePath);
  return { ...state, browserTabs: nextTabs, ... };
}),
```

- [ ] **Step 4: 对 browserBookmarkSlice 重复 Step 1-3**

提取 `computeToggleBookmarkOutcome` 和 `computeBookmarkTabOutcome`

- [ ] **Step 5: 类型检查 + lint + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint && pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/stores/slices/
git commit -m "refactor(stores): extract browserFoldersDeletion + browserBookmarkHelpers pure functions - slices down to ~280/~200 lines"
```

### Task 14: 提取 githubRepoDeleteHelpers.ts + editorActionsHelpers.ts

**Files:**
- Create: `frontend/src/app/stores/slices/githubRepoDeleteHelpers.ts` (~80 行)
- Create: `frontend/src/app/stores/actions/editorActionsHelpers.ts` (~120 行)
- Modify: `frontend/src/app/stores/slices/githubRepoSlice.ts` (392→~320 行)
- Modify: `frontend/src/app/stores/actions/editorActions.ts` (329→~200 行)

**Interfaces:**
- Produces: 2 个新 helper 模块

- [ ] **Step 1: 提取 githubRepoDeleteHelpers.ts**

合并三个删除方法为单一 `computeFolderDeleteOutcome(folders, folderId, activeCiWorkspaceId)` 纯函数

- [ ] **Step 2: 修改 githubRepoSlice.ts 调用纯函数**

- [ ] **Step 3: 提取 editorActionsHelpers.ts**

将 `openFileGeneric`（63 行）和 `openChangePreviewGeneric`（47 行）及其 Config 接口移入

- [ ] **Step 4: 修改 editorActions.ts 调用 helper**

- [ ] **Step 5: 类型检查 + lint + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint && pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/stores/
git commit -m "refactor(stores): extract githubRepoDeleteHelpers + editorActionsHelpers - slices/actions down to ~320/~200 lines"
```

---

## Phase 6: 🟡 React.memo + i18n + Rust 错误处理

### Task 15: 5 个列表项组件添加 React.memo

**Files:**
- Modify: `frontend/src/app/features/file-tree/TreeNodeRow.tsx`
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/JobRow.tsx`
- Modify: `frontend/src/app/features/patch-review/PatchFileCard.tsx`
- Modify: `frontend/src/app/features/patch-review/PatchHunkCard.tsx`
- Modify: `frontend/src/app/features/browser/browser-landing/ShortcutCard.tsx`

**Interfaces:** 无依赖

- [ ] **Step 1: 为 5 个组件添加 React.memo 包裹**

每个组件改为：
```typescript
export const ComponentName = React.memo(function ComponentName(props: ComponentNameProps) {
  // 原有实现
});
```

注意：保持默认导出兼容性（如有）

- [ ] **Step 2: 类型检查 + lint + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint && pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/features/file-tree/TreeNodeRow.tsx frontend/src/app/regions/right-panel/panels/communicate/JobRow.tsx frontend/src/app/features/patch-review/ frontend/src/app/features/browser/browser-landing/ShortcutCard.tsx
git commit -m "perf(react): wrap 5 list-item components with React.memo - TreeNodeRow/JobRow/PatchFileCard/PatchHunkCard/ShortcutCard"
```

### Task 16: ciSlice/githubSlice/githubRepoSlice 硬编码中文 → i18n key

**Files:**
- Create: `frontend/src/shared/ciErrors.ts` (~20 行，共享错误码常量)
- Modify: `frontend/src/app/stores/slices/ciSlice.ts:232,265`
- Modify: `frontend/src/app/stores/slices/githubSlice.ts:201,233,300,332`
- Modify: `frontend/src/app/stores/slices/githubRepoSlice.ts:130`
- Modify: `frontend/src/app/i18n/zh-CN/ci.ts` (添加新 key)
- Modify: `frontend/src/app/i18n/en-US/ci.ts` (添加新 key)

**Interfaces:**
- Produces: `shared/ciErrors.ts` 导出错误码常量

- [ ] **Step 1: 创建 shared/ciErrors.ts**

```typescript
export const CI_ERROR_CODES = {
  CONFIG_MISSING_REPO: 'CI_CONFIG_MISSING_REPO',
  FETCH_STATUS_FAILED: 'CI_FETCH_STATUS_FAILED',
} as const;
```

- [ ] **Step 2: 添加 i18n key**

zh-CN/ci.ts:
```typescript
ciConfigMissingRepo: '请先配置仓库 owner 和 repo',
ciFetchStatusFailed: '获取 CI 状态失败',
ciDefaultFolderName: '目录 {index}',
```

en-US/ci.ts:
```typescript
ciConfigMissingRepo: 'Please configure repository owner and repo first',
ciFetchStatusFailed: 'Failed to fetch CI status',
ciDefaultFolderName: 'Folder {index}',
```

- [ ] **Step 3: 修改 ciSlice.ts 使用错误码**

将 `'请先配置仓库 owner 和 repo'` 改为 `CI_ERROR_CODES.CONFIG_MISSING_REPO`
将 `'获取 CI 状态失败'` 改为 `CI_ERROR_CODES.FETCH_STATUS_FAILED`

- [ ] **Step 4: 修改 githubSlice.ts 使用错误码（4 处）**

- [ ] **Step 5: 修改 githubRepoSlice.ts:130 使用 i18n key**

将 `` `目录 ${folderCount + 1}` `` 改为存储 `CI_ERROR_CODES.DEFAULT_FOLDER_NAME` 或结构化 `{ code: 'DEFAULT_FOLDER_NAME', index: folderCount + 1 }`

- [ ] **Step 6: 修改消费组件通过 useTCopy() 翻译错误码**

找到 ciError / githubError 状态的消费组件，添加错误码 → i18n key 的映射逻辑

- [ ] **Step 7: 类型检查 + lint + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint && pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add frontend/src/shared/ciErrors.ts frontend/src/app/stores/slices/ frontend/src/app/i18n/
git commit -m "refactor(i18n): replace hardcoded Chinese error messages in slices with structured error codes + i18n keys"
```

### Task 17: 修复 Rust unwrap_or_default 静默吞错 + manager.rs expect

**Files:**
- Modify: `src-tauri/src/setup.rs:41` (init_app_state)
- Modify: `crates/workspace/src/git.rs:285,288` (capture_git_paths_with_fallback_async)
- Modify: `crates/change-engine/src/patch_apply.rs:61`
- Modify: `crates/adl-logging/src/manager.rs:276` (TerminalWriter::write expect)
- Modify: `crates/browser/src/webview2_message.rs:33` (FAVICON_CACHE Mutex → RwLock)

**Interfaces:** 无依赖

- [ ] **Step 1: 修复 setup.rs:41**

将 `adl_config::load(&data_dir).unwrap_or_default()` 改为：
```rust
match adl_config::load(&data_dir) {
    Ok(c) => c,
    Err(e) => {
        tracing::warn!(error = %e, "config load failed, using default");
        LogConfig::default()
    }
}
```

- [ ] **Step 2: 修复 git.rs:285,288**

将两层 `unwrap_or_default()` 改为 `match` + `tracing::warn!`

- [ ] **Step 3: 修复 patch_apply.rs:61**

将 `read_text_file(...).unwrap_or_default()` 改为 `match` + `tracing::warn!`

- [ ] **Step 4: 修复 manager.rs:276 expect()**

将 `guard.as_mut().expect(...)` 改为 `match` + 返回 `Err(io::Error::other(...))`

- [ ] **Step 5: 修改 FAVICON_CACHE Mutex → RwLock**

将 `Lazy<Mutex<HashMap<String, String>>>` 改为 `Lazy<RwLock<HashMap<String, String>>>`
将所有 `.lock()` 读访问改为 `.read()`，写访问改为 `.write()`

- [ ] **Step 6: 编译检查 + clippy + 测试**

Run: `cd ai-digital-life && $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace && cargo clippy --workspace -- -D warnings && cargo test --workspace`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/setup.rs crates/workspace/src/git.rs crates/change-engine/src/patch_apply.rs crates/adl-logging/src/manager.rs crates/browser/src/webview2_message.rs
git commit -m "fix(rust): replace silent unwrap_or_default with tracing::warn + manager.rs expect with match + FAVICON_CACHE Mutex→RwLock"
```

---

## Phase 完成后的全局验收

### Final Verification

- [ ] **Step 1: 前端四维门禁**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run lint && pnpm --dir frontend run typecheck && pnpm --dir frontend run test`
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 2: Rust 四维门禁**

Run: `cd ai-digital-life && $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo check --workspace && cargo test --workspace`
Expected: 0 warnings, all tests pass

- [ ] **Step 3: 行数回归验证**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; node -e "const fs=require('fs');const files=['frontend/src/app/features/browser/BrowserPanel.tsx','frontend/src/app/features/terminal/useTerminalPanel.ts','frontend/src/app/features/browser/useBrowserWebView.ts','crates/browser/src/webview2_message.rs','frontend/src/styles/regions/rightpanel/browser-webview.css','frontend/src/app/stores/slices/browserFoldersSlice.ts','frontend/src/app/stores/slices/browserBookmarkSlice.ts'];files.forEach(f=>{try{const c=fs.readFileSync(f,'utf8').split('\\n').length;console.log(c+'\\t'+f)}catch(e){console.log('MISSING\\t'+f)}})"`
Expected:
- BrowserPanel.tsx ≤ 600
- useTerminalPanel.ts ≤ 100
- useBrowserWebView.ts ≤ 100
- webview2_message.rs ≤ 200
- browser-webview.css ≤ 500
- browserFoldersSlice.ts ≤ 300
- browserBookmarkSlice.ts ≤ 250

- [ ] **Step 4: !important 数量验证**

Run: `cd ai-digital-life && (Get-ChildItem -Recurse -Path frontend\src\styles -Include *.css | ForEach-Object { (Select-String -Path $_.FullName -Pattern '!important' -AllMatches).Matches.Count } | Measure-Object -Sum).Sum`
Expected: ≤ 263（原 279 - 16 优化）

---

## Self-Review

### Spec coverage

| 洞察报告发现 | 对应 Task | 状态 |
|-------------|----------|------|
| 🔴 ipc-types.generated.ts 死文件 | Task 1 | ✅ |
| 🔴 createIpcError 死函数 | Task 1 | ✅ |
| 🔴 存储键常量多重定义 | Task 2 | ✅ |
| 🔴 IPC 契约 browser_fetch_page_meta | Task 3 | ✅ |
| 🔴 CSS 硬编码颜色（#fff, rgba） | Task 4 | ✅ |
| 🔴 CSS 重复（files-navigator + file-tree-core） | Task 5 | ✅ |
| 🔴 browser-webview.css 954行 | Task 6 | ✅ |
| 🔴 diff-viewer.css 68 !important | Task 7 | ✅ |
| 🔴 webview2_message.rs 655行 + 4 大函数 | Task 8 | ✅ |
| 🔴 create_for_tab + list_tree_inner + emit_model_stream_events | Task 9 | ✅ |
| 🔴 useTerminalPanel.ts 323行 | Task 10 | ✅ |
| 🔴 useBrowserWebView.ts 308行 | Task 11 | ✅ |
| 🔴 BrowserPanel.tsx 841行 | Task 12 | ✅ |
| 🟡 browserFoldersSlice + browserBookmarkSlice | Task 13 | ✅ |
| 🟡 githubRepoSlice + editorActions | Task 14 | ✅ |
| 🟡 5 个 React.memo 缺失 | Task 15 | ✅ |
| 🟡 ciSlice/githubSlice/githubRepoSlice i18n | Task 16 | ✅ |
| 🟡 Rust unwrap_or_default + expect + Mutex | Task 17 | ✅ |

### 未覆盖项（已评估为低优先级或依赖前序任务）

- 🟡 TerminalPanel.tsx 378行 - 可在 Task 10 中顺带处理
- 🟡 useTerminalPtyLifecycle.ts 223行 - 可在 Task 10 中顺带处理
- 🟡 terminalSlice.ts 357行 - Store 拆分依赖较大，留待下轮
- 🟡 githubSlice.ts 341行 - 同上
- 🟡 workspaceActions.ts 303行 - 可在 Task 14 中顺带处理
- 🟡 CSS z-index token 系统 - 涉及 74 处修改，留待下轮
- 🟡 CSS 阴影 token - 可在 Task 4 中顺带处理
- 🟡 preview-conversation/patch/command 透传风格 - 留待下轮
- 🟢 缺失 barrel index.ts - 留待下轮
- 🟢 workspace_git.rs:138 clone - 留待下轮

### Type consistency

- `BROWSER_*_KEY` 常量在 Task 2 中统一定义，所有后续 task 引用相同名称 ✅
- `CI_ERROR_CODES` 在 Task 16 中定义，消费组件使用相同名称 ✅
- `register_webview2_handler<T>` 在 Task 8 中定义，4 个 setup_* 函数使用相同签名 ✅

