# 重构洞察 2026-07-01 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 执行第 21 次重构洞察发现的 31 项问题修复，聚焦 🔴 高优先级 7 项 + 关键 🟡 中优先级项

**Architecture:** 按风险递增分 6 个 Phase 执行。Phase 1-2 为低风险快速修复（死代码、契约修复、CSS 合并），Phase 3-4 为文件拆分（outline.ts、ipc.ts、Store slices），Phase 5-6 为 Hook/组件分解与 Rust/i18n 改进。每 Phase 完成后运行验收门禁。

**Tech Stack:** TypeScript + React 19 + Zustand + Tauri 2.x + Rust

**洞察报告:** `docs/重构洞察/refactor-insight-2026-07-01.md`

## Global Constraints

- 所有修改不得破坏现有功能及 UI/UX
- 最小变更原则：仅修复发现的问题，不做无关变更
- 每 Phase 完成后运行四维门禁：`pnpm --dir frontend run typecheck` + `pnpm --dir frontend run lint` + `cargo check --workspace` + `cargo clippy --workspace -- -D warnings`
- 工作目录：`.worktrees/refactor-insight-main/ai-digital-life`
- Node.js 环境变量：`$env:Path = "D:\Program Files\nodejs;$env:Path"`
- Rust 环境变量：`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- 禁止跨 Phase：不引入超出当前 Phase 范围的功能或架构变更

## File Structure

| Phase | 操作类型 | 涉及文件 |
|-------|---------|---------|
| 1 | 删除死代码 | styles.css, cacheHelpers.ts, workspaceSlice.ts, preview-events.ts, ipc.ts |
| 2 | CSS 合并 | diff-shared.css(新), diff-inline.css, diff-side-by-side.css, themes.css |
| 3 | 文件拆分 | shared/outline/ 目录(新), shared/ipc/ 目录(扩) |
| 4 | Store 提取 | browserFoldersUtils.ts(新), browserFoldersTypes.ts(新), workspaceTreeActions.ts(新), githubTokenActions.ts(新) |
| 5 | Hook 拆分 | useBrowserFolderCrud.ts(新), useFloatingMenu.ts(新), useBrowserIframeState.ts(新) |
| 6 | Rust + i18n | manager.rs, browser.rs, ci_client.rs, search.rs, workspace_git.rs, QuickActions.tsx |

---

## Phase 1: 🔴 快速修复（死代码 + 契约修复）

### Task 1: 删除孤立 styles.css shim

**Files:**
- Delete: `frontend/src/styles.css`

**Interfaces:** 无依赖，无产出

- [ ] **Step 1: 确认无引用**

Run: `cd ai-digital-life && pnpm exec grep -r "styles.css" frontend/src --include="*.ts" --include="*.tsx" --include="*.html" | grep -v node_modules`
Expected: 无匹配（或仅匹配 `styles/index.css` 而非 `styles.css`）

- [ ] **Step 2: 删除文件**

删除 `frontend/src/styles.css`

- [ ] **Step 3: 类型检查**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`
Expected: PASS (0 errors)

### Task 2: 修复 IPC 契约 listPendingApprovals?

**Files:**
- Modify: `frontend/src/shared/ipc.ts:616`

**Interfaces:**
- Produces: `listPendingApprovals` 从可选变为必选，与三个桥接层 + Rust 一致

- [ ] **Step 1: 定位可选标记**

Read `frontend/src/shared/ipc.ts` 第 616 行附近，确认 `listPendingApprovals?:` 的上下文

- [ ] **Step 2: 移除 `?` 标记**

将 `listPendingApprovals?:` 改为 `listPendingApprovals:`

- [ ] **Step 3: 类型检查**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`
Expected: PASS（三桥接层已实现该方法，不会报缺失错误）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/shared/ipc.ts
git commit -m "fix(ipc): make listPendingApprovals required - all 3 bridges + Rust implement it"
```

### Task 3: 删除 cacheHelpers 废弃函数

**Files:**
- Modify: `frontend/src/app/stores/cacheHelpers.ts` (删除 L40-80 的 4 个 @deprecated 函数)

- [ ] **Step 1: 确认零引用**

Run: `cd ai-digital-life && pnpm exec grep -rn "getFileDocumentCache\|getChangePreviewCache\|getCachedLru\b\|setCachedLru\b" frontend/src --include="*.ts" --include="*.tsx" | grep -v "cacheHelpers.ts" | grep -v "getCachedLruTTL\|setCachedLruTTL"`
Expected: 无匹配

- [ ] **Step 2: 删除 4 个废弃函数**

删除 `cacheHelpers.ts` 中 `getFileDocumentCache`、`getChangePreviewCache`、`getCachedLru`、`setCachedLru` 四个函数（含 @deprecated 注释）

- [ ] **Step 3: 类型检查 + lint**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: PASS

### Task 4: 删除 workspaceSlice 废弃字段 + preview-events 死方法

**Files:**
- Modify: `frontend/src/app/stores/slices/workspaceSlice.ts` (删除 workspaceTree/setWorkspaceTree)
- Modify: `frontend/src/preview-bridge/preview-events.ts` (删除 onUrlChanged/onMetaChanged)

- [ ] **Step 1: 确认 workspaceTree 零调用**

Run: `cd ai-digital-life && pnpm exec grep -rn "\.workspaceTree\b\|setWorkspaceTree" frontend/src --include="*.ts" --include="*.tsx" | grep -v "workspaceSlice.ts" | grep -v "workspaceTrees"`
Expected: 无匹配

- [ ] **Step 2: 删除 workspaceTree 字段 + setter**

从 `workspaceSlice.ts` 删除：字段声明 `workspaceTree`、接口声明 `setWorkspaceTree`、初始值 `workspaceTree: []`、实现 `setWorkspaceTree`

- [ ] **Step 3: 删除 preview-events 死方法**

从 `preview-events.ts` 删除 `onUrlChanged` 和 `onMetaChanged` 方法（保留 `onFileChanged`）

- [ ] **Step 4: 类型检查 + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 5: 提交 Phase 1**

```bash
git add -A
git commit -m "refactor: remove dead code (styles.css shim, deprecated cache helpers, workspaceTree field, preview-events dead methods)"
```

---

## Phase 2: 🔴 CSS Diff 合并 + 颜色 Token 化

### Task 5: 创建 diff-shared.css 提取共享规则

**Files:**
- Create: `frontend/src/styles/regions/rightpanel/diff-shared.css`
- Modify: `frontend/src/styles/regions/rightpanel/diff-inline.css` (移除已提取的重复规则)
- Modify: `frontend/src/styles/regions/rightpanel/diff-side-by-side.css` (移除已提取的重复规则)
- Modify: `frontend/src/styles/regions/rightpanel/rightpanel.css` (添加 diff-shared 导入)

**Interfaces:**
- Produces: `diff-shared.css` 含共享的 gutter/stripe/button 规则

- [ ] **Step 1: 分析重复规则**

Read `diff-inline.css` 和 `diff-side-by-side.css`，识别完全相同的规则块（deleted/inserted gutter border、stripe pattern、chunk button 样式）

- [ ] **Step 2: 创建 diff-shared.css**

提取共享规则到新文件，使用更高特异性选择器（`.adl-cm-diff-viewer .cm-deletedChunk` 等）替代 `!important`

- [ ] **Step 3: 从两文件移除已提取规则**

删除 `diff-inline.css` 和 `diff-side-by-side.css` 中已提取到 `diff-shared.css` 的重复规则

- [ ] **Step 4: 添加导入**

在 `rightpanel.css` 添加 `@import './diff-shared.css';`

- [ ] **Step 5: 视觉验证 + lint**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run lint`
Expected: PASS
注：CSS 变更需用户在界面验证 diff 视图 UI 无回归

### Task 6: diff 颜色 Token 化

**Files:**
- Modify: `frontend/src/styles/themes.css` (添加 diff 颜色 token)
- Modify: `frontend/src/styles/regions/rightpanel/diff-inline.css` (替换硬编码颜色)
- Modify: `frontend/src/styles/regions/rightpanel/diff-side-by-side.css` (替换硬编码颜色)

- [ ] **Step 1: 在 themes.css 定义 diff token**

添加：`--diff-danger-border`、`--diff-danger-stripe`、`--diff-success-border`、`--diff-success-stripe`、`--diff-fade-gradient`（dark/light 两套）

- [ ] **Step 2: 替换 diff-inline.css 硬编码颜色**

将 `rgba(239,68,68,*)` → `var(--diff-danger-border)` 等

- [ ] **Step 3: 替换 diff-side-by-side.css 硬编码颜色**

同 Step 2

- [ ] **Step 4: 提交 Phase 2**

```bash
git add -A
git commit -m "refactor(css): extract diff-shared.css + tokenize diff colors, reduce ~20 !important"
```

---

## Phase 3: 🔴 大文件拆分

### Task 7: 拆分 outline.ts 按语言族

**Files:**
- Create: `frontend/src/shared/outline/index.ts` (编排器)
- Create: `frontend/src/shared/outline/markdown.ts`、`brace.ts`、`python.ts` 等（各语言族解析器）
- Delete/Replace: `frontend/src/shared/outline.ts` (内容迁移到 outline/ 目录)

**Interfaces:**
- Produces: `outline/` 目录，主文件 `index.ts` 作为编排器，各语言族独立模块
- 参考：`crates/outline/` 已拆 11 模块的范例

- [ ] **Step 1: 分析 outline.ts 结构**

Read `frontend/src/shared/outline.ts`，识别 13 种语言族的解析函数边界（markdown/brace/brace-config/python/yaml/json/html/css/vue/shell/powershell/sql/config/none）

- [ ] **Step 2: 创建 outline/ 目录结构**

创建 `frontend/src/shared/outline/index.ts`，从原 `outline.ts` 迁移编排逻辑

- [ ] **Step 3: 按语言族提取子模块**

为每个语言族创建独立文件（如 `markdown.ts`、`brace.ts`、`python.ts` 等），迁移对应解析逻辑

- [ ] **Step 4: 更新导入路径**

搜索所有 `from '@/shared/outline'` 或 `from '../outline'` 导入，确认新路径解析正常（目录 index.ts 自动解析）

- [ ] **Step 5: 类型检查 + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor: split outline.ts (862 lines) into language-family modules"
```

### Task 8: 继续 ipc.ts 域拆分

**Files:**
- Create: `frontend/src/shared/ipc/app.ts`、`browser.ts`、`task.ts`、`terminal.ts`、`conversation.ts`、`patch.ts`、`pty.ts`、`github.ts`、`command.ts`、`agent.ts`、`retrieval.ts`、`window.ts`
- Modify: `frontend/src/shared/ipc.ts` (变为纯 barrel re-export)

**Interfaces:**
- 已有 `shared/ipc/workspace.ts` 作为范例
- Produces: `ipc.ts` 变为纯 barrel，各子接口独立文件

- [ ] **Step 1: 分析 ipc.ts 接口边界**

Read `frontend/src/shared/ipc.ts`，识别 13 个子接口（WindowBridge/AppBridge/WorkspaceBridge/RetrievalBridge/ConversationBridge/AgentBridge/PatchBridge/CommandBridge/PtyBridge/TaskBridge/RunActivityBridge/BrowserBridge/GitHubBridge）及其相关类型

- [ ] **Step 2: 按接口提取子文件**

为每个接口创建 `shared/ipc/<name>.ts`，迁移接口定义 + 相关类型

- [ ] **Step 3: 将 ipc.ts 改为 barrel re-export**

```typescript
export * from './ipc/workspace';
export * from './ipc/app';
export * from './ipc/browser';
// ... 其余接口
```

- [ ] **Step 4: 类型检查**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`
Expected: PASS（barrel re-export 不改变导入路径）

- [ ] **Step 5: 提交 Phase 3**

```bash
git add -A
git commit -m "refactor: complete ipc.ts domain split (932 lines -> barrel + 12 sub-modules)"
```

---

## Phase 4: 🟡 Store Slice 提取

### Task 9: 提取 browserFoldersSlice 辅助函数 + 类型

**Files:**
- Create: `frontend/src/app/stores/slices/browserFoldersUtils.ts` (纯树遍历辅助函数)
- Create: `frontend/src/app/stores/slices/browserFoldersTypes.ts` (类型定义)
- Modify: `frontend/src/app/stores/slices/browserFoldersSlice.ts` (437→<350行)

- [ ] **Step 1: 提取类型定义到 browserFoldersTypes.ts**

将 `BookmarkTabItem`、`TabFolderState`、`TabFolderStateUpdate` 等类型移到新文件

- [ ] **Step 2: 提取辅助函数到 browserFoldersUtils.ts**

将 `findFolderById`、`collectAllDescendantFolderIds`、`collectAllDescendantTabIds`、`collectAllFolderTabIds`、`buildTabsById` (L42-80) 移到新文件

- [ ] **Step 3: 在 browserFoldersSlice.ts 导入**

替换内联定义为 import

- [ ] **Step 4: 类型检查 + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run test`
Expected: PASS

### Task 10: 拆分 workspaceActions → workspaceTreeActions

**Files:**
- Create: `frontend/src/app/stores/actions/workspaceTreeActions.ts` (树加载+展开，~180行)
- Modify: `frontend/src/app/stores/actions/workspaceActions.ts` (425→~245行)

- [ ] **Step 1: 迁移树加载函数**

将 `loadWorkspaceTree`、`refreshOneWorkspaceTree`、`refreshAllWorkspaceTrees`、`expandAllWorkspaceTreesInFileNav`、`toggleWorkspaceTreeInFileNav`、`expandWorkspaceTreeInFileNav`、`collapseAllWorkspaceTreesInFileNav` 迁移到新文件

- [ ] **Step 2: 更新 barrel 导出**

在 `actions/index.ts` 添加 `workspaceTreeActions` 导出

- [ ] **Step 3: 类型检查 + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run test`
Expected: PASS

### Task 11: 提取 githubRepoSlice token 管理

**Files:**
- Create: `frontend/src/app/stores/slices/githubTokenActions.ts`
- Modify: `frontend/src/app/stores/slices/githubRepoSlice.ts` (422→<350行)

- [ ] **Step 1: 迁移 token 管理函数**

将 set/clear/has access token 相关逻辑迁移到新文件

- [ ] **Step 2: 类型检查 + 测试 + 提交 Phase 4**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run test`
Expected: PASS

```bash
git add -A
git commit -m "refactor: extract store slice helpers (browserFolders, workspaceTree, githubToken)"
```

---

## Phase 5: 🟡 Hook/组件分解

### Task 12: 拆分 useBrowserFolderActions

**Files:**
- Create: `frontend/src/app/features/browser/useBrowserFolderCrud.ts`
- Create: `frontend/src/app/features/browser/useBrowserFolderReorder.ts`
- Modify: `frontend/src/app/features/browser/useBrowserFolderActions.ts` (521→编排器)

- [ ] **Step 1: 拆分 CRUD 操作到 useBrowserFolderCrud**

迁移创建/重命名/删除文件夹逻辑

- [ ] **Step 2: 拆分排序操作到 useBrowserFolderReorder**

迁移拖拽/置顶逻辑

- [ ] **Step 3: 主 Hook 变为编排器**

`useBrowserFolderActions` 组合两个子 Hook

- [ ] **Step 4: 类型检查 + 测试**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run test`
Expected: PASS

### Task 13: 提取 GitHubLogViewer Hook（useFloatingMenu 可复用）

**Files:**
- Create: `frontend/src/app/hooks/useFloatingMenu.ts` (可复用浮窗菜单 Hook)
- Create: `frontend/src/app/regions/right-panel/panels/communicate/useLogViewerJobs.ts`
- Create: `frontend/src/app/regions/right-panel/panels/communicate/useLogSearch.ts`
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.tsx` (419→精简)

- [ ] **Step 1: 创建 useFloatingMenu**

提取 dropdownOpen/menuLeft/menuTop/menuWidth 4 个 useState 到通用 Hook

- [ ] **Step 2: 创建 useLogViewerJobs + useLogSearch**

提取日志查看状态和搜索状态

- [ ] **Step 3: GitHubLogViewer 组合 3 个子 Hook**

- [ ] **Step 4: 类型检查 + 测试 + 提交 Phase 5**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run test`
Expected: PASS

```bash
git add -A
git commit -m "refactor: decompose GitHubLogViewer (13 useState -> 3 hooks) + extract reusable useFloatingMenu"
```

---

## Phase 6: 🟡 Rust 改进 + i18n + 类型修复

### Task 14: 修复 Rust unwrap/expect 模式一致性

**Files:**
- Modify: `crates/adl-logging/src/manager.rs:80,83,268`
- Modify: `src-tauri/src/commands/browser.rs:162`

- [ ] **Step 1: manager.rs 改用 `?` 传播**

L80,83: `.lock().unwrap()` → `.map_err(|_| LogError::Config("session lock poisoned".into()))?`
L268: `.as_mut().unwrap()` → `.expect("file state must be Some after needs_reopen check")`

- [ ] **Step 2: browser.rs 改用 poisoned-mutex 恢复**

L162: `.expect("fetch cache mutex lock failed")` → `.unwrap_or_else(|e| e.into_inner())`

- [ ] **Step 3: Rust 检查**

Run: `cd ai-digital-life && $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace && cargo clippy --workspace -- -D warnings`
Expected: PASS

### Task 15: 添加静默错误的 tracing 日志

**Files:**
- Modify: `crates/ci-status/src/ci_client.rs:131`
- Modify: `crates/workspace/src/search.rs:62`

- [ ] **Step 1: ci_client.rs 添加 warn 日志**

在 `unwrap_or_default()` 前添加 `tracing::warn!(run_id = %run_id, error = %e, "fetch_jobs failed, returning empty list")`

- [ ] **Step 2: search.rs 添加 warn 日志**

在 `unwrap_or_default()` 前添加 `tracing::warn!(path = %file.display(), error = %e, "failed to read file during search")`

- [ ] **Step 3: Rust 检查**

Run: `cd ai-digital-life && $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace && cargo clippy --workspace -- -D warnings`
Expected: PASS

### Task 16: 消除 workspace_git.rs clone

**Files:**
- Modify: `src-tauri/src/commands/workspace_git.rs:41,140`

- [ ] **Step 1: L41 `..workspace.clone()` 改为字段逐个更新或 `std::mem::take`**

- [ ] **Step 2: L140 `update_workspace_after_git_change` 改为借用 `&GitSnapshot`**

- [ ] **Step 3: Rust 检查**

Run: `cd ai-digital-life && $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace && cargo clippy --workspace -- -D warnings && cargo test --workspace`
Expected: PASS

### Task 17: QuickActions tooltip i18n 化

**Files:**
- Modify: `frontend/src/app/components/QuickActions.tsx:84,91,99`
- Modify: `frontend/src/app/i18n/locales/zh.json` + `en.json` (添加 key)

- [ ] **Step 1: 添加 i18n key**

在 zh.json/en.json 添加 `quickActionsSkills`、`quickActionsMcpServers`、`quickActionsNewWorkspace`

- [ ] **Step 2: 替换硬编码 tooltip**

`tooltip="Skills"` → `tooltip={t('quickActionsSkills')}` 等

- [ ] **Step 3: 类型检查 + lint**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: PASS

### Task 18: 打破 browser 三切片类型环

**Files:**
- Create: `frontend/src/app/stores/slices/browserSliceShared.ts` (共享类型 + 常量)
- Modify: `browserFoldersSlice.ts`、`browserTabsSlice.ts`、`browserBookmarkSlice.ts` (改为从 shared 导入)

- [ ] **Step 1: 提取共享类型到 browserSliceShared.ts**

迁移 `BrowserTabState`、`TabFolderState`、`BookmarkTabItem` + 常量 `BROWSER_BOOKMARKS_STORAGE_KEY`、`BROWSER_BOOKMARK_TABID_URL_MAP_KEY`

- [ ] **Step 2: 三个切片改为从 shared 导入**

替换互相导入为 `from './browserSliceShared'`

- [ ] **Step 3: 类型检查 + 测试 + 提交 Phase 6**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck && pnpm --dir frontend run test`
Expected: PASS

```bash
git add -A
git commit -m "refactor: Rust unwrap consistency + tracing logs + clone elimination + i18n + break type cycle"
```

---

## 最终验收（Phase 6 完成后）

### 四维门禁

- [ ] **前端 ESLint + Prettier**

Run: `cd ai-digital-life && $env:Path = "D:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run lint:fix && pnpm --dir frontend run format`

- [ ] **前端类型检查**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 errors

- [ ] **前端测试**

Run: `pnpm --dir frontend run test`
Expected: all passed

- [ ] **Rust 格式 + Clippy + 编译**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo fmt --all && cargo clippy --workspace --all-targets --fix -- -D warnings && cargo check --workspace`
Expected: 0 warnings, 0 errors

- [ ] **Rust 测试**

Run: `cargo test --workspace`
Expected: all passed

---

## 自检清单

- [ ] 所有 🔴 高优先级项（7 项）均已覆盖
- [ ] 关键 🟡 中优先级项已覆盖（Store 提取、Hook 拆分、Rust 改进、i18n、类型环）
- [ ] 每个任务有明确的文件路径和验证命令
- [ ] 遵循最小变更原则
- [ ] 未引入超出 Phase 范围的功能或架构变更
