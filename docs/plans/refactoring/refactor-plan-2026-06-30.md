# 重构实施计划 – 2026-06-30

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 执行第 20 次重构洞察的 23 项发现，包括前端大文件拆分、Rust clone 消除、React.lazy 恢复、深层导入清理

**Architecture:** 分 3 个 Phase 执行：Phase 1 处理 🔴 高优先级（7 项），Phase 2 处理 🟡 中优先级（14 项），Phase 3 处理 🟢 低优先级（2 项）。每项变更后验证 ESLint/TypeScript/Clippy。

**Tech Stack:** TypeScript/React, Rust/Tauri, Zustand, CSS

**洞察报告:** [refactor-insight-2026-06-30.md](../../../docs/refactoring-insight/report/daily-insights/2026-06/refactor-insight-2026-06-30.md)

## Global Constraints

- 所有修改不得破坏现有功能及 UI/UX
- 最小变更原则：仅修复发现的问题，不做无关变更
- 不引入超出当前 Phase 范围的功能或架构变更
- 每项变更后运行类型检查验证
- 禁止猜测性修复，验证失败时使用 systematic-debugging

---

## Phase 1: 🔴 高优先级（7 项）

### Task 1.1: console.log 清理

**Files:**
- Modify: `frontend/src/mock-bridge.ts`
- Modify: `frontend/src/app/stores/slices/ciSlice.ts`

**Interfaces:**
- Consumes: 无
- Produces: 无新增接口

- [ ] **Step 1: 清理 mock-bridge.ts 中的 2 处 console.log**

搜索 `console.log` 并删除或替换为静默处理。

- [ ] **Step 2: 清理 ciSlice.ts 中的 1 处 console.log**

搜索 `console.log` 并删除。

- [ ] **Step 3: 验证**

```powershell
pnpm --dir frontend run lint
```

---

### Task 1.2: Rust task.rs unwrap 修复

**Files:**
- Modify: `src-tauri/src/commands/task.rs`

**Interfaces:**
- Consumes: 无
- Produces: 无新增接口

- [ ] **Step 1: 定位 task.rs L486 附近的 .unwrap() 调用**

读取 `src-tauri/src/commands/task.rs` 中 `deserialize_params(params).unwrap()` 处。

- [ ] **Step 2: 改为 ? 传播或 map_err**

```rust
// 将
let params = deserialize_params(params).unwrap();
// 改为
let params = deserialize_params(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
```

- [ ] **Step 3: 验证**

```powershell
cargo check --workspace
cargo clippy --workspace -- -D warnings
```

---

### Task 1.3: useBrowserTreeActions.ts 拆分（718→4 文件）

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserTreeActions.ts`
- Create: `frontend/src/app/features/browser/useBrowserTagActions.ts`
- Create: `frontend/src/app/features/browser/useBrowserFolderActions.ts`
- Create: `frontend/src/app/features/browser/useBrowserBookmarkActions.ts`
- Create: `frontend/src/app/features/browser/useBrowserMenuActions.ts`

**Interfaces:**
- Consumes: browserSlice, browserFoldersSlice, browserTabsSlice
- Produces: `useBrowserTagActions`, `useBrowserFolderActions`, `useBrowserBookmarkActions`, `useBrowserMenuActions`

- [ ] **Step 1: 读取 useBrowserTreeActions.ts 分析职责边界**

识别标签操作、目录操作、书签操作、菜单回调的函数分组。

- [ ] **Step 2: 提取 useBrowserTagActions.ts**

提取标签相关的操作函数（创建、关闭、导航、刷新 meta 等）。

- [ ] **Step 3: 提取 useBrowserFolderActions.ts**

提取目录相关的操作函数（创建、删除、重命名、展开/折叠等）。

- [ ] **Step 4: 提取 useBrowserBookmarkActions.ts**

提取书签相关的操作函数（添加、删除、切换等）。

- [ ] **Step 5: 提取 useBrowserMenuActions.ts**

提取菜单回调函数（context menu、dropdown menu 等）。

- [ ] **Step 6: 更新 useBrowserTreeActions.ts**

改为 barrel re-export 或组合 Hook，调用 4 个子 Hook。

- [ ] **Step 7: 更新所有引用**

搜索导入 `useBrowserTreeActions` 的文件，确保接口兼容。

- [ ] **Step 8: 验证**

```powershell
pnpm --dir frontend run typecheck
pnpm --dir frontend run lint:fix
```

---

### Task 1.4: shared/ipc.ts 拆分（1296→按域拆分）

**Files:**
- Modify: `frontend/src/shared/ipc.ts`
- Create: `frontend/src/shared/ipc/app.ts`
- Create: `frontend/src/shared/ipc/browser.ts`
- Create: `frontend/src/shared/ipc/workspace.ts`
- Create: `frontend/src/shared/ipc/task.ts`
- Create: `frontend/src/shared/ipc/terminal.ts`
- Create: `frontend/src/shared/ipc/communication.ts`
- Create: `frontend/src/shared/ipc/index.ts` (barrel)

**Interfaces:**
- Consumes: shared/ipc-types.generated.ts
- Produces: 按域拆分的 IPC 类型定义

- [ ] **Step 1: 读取 ipc.ts 分析接口域边界**

识别 App、Browser、Workspace、Task、Terminal、Communication 等接口族。

- [ ] **Step 2: 创建域子模块**

每个子模块导出对应域的 IPC 接口。

- [ ] **Step 3: 创建 barrel index.ts**

re-export 所有子模块。

- [ ] **Step 4: 更新所有引用**

搜索导入 `shared/ipc` 的文件，确认 barrel 兼容。

- [ ] **Step 5: 验证**

```powershell
pnpm --dir frontend run typecheck
```

---

### Task 1.5: kernel/index.ts 拆分（1158→子模块）

**Files:**
- Modify: `frontend/src/kernel/index.ts`
- Create: `frontend/src/kernel/api.ts`
- Create: `frontend/src/kernel/errors.ts`
- Create: `frontend/src/kernel/session.ts`
- Create: `frontend/src/kernel/files.ts`
- Create: `frontend/src/kernel/types.ts`

**Interfaces:**
- Consumes: 桥接层（tauri-bridge/preview-bridge/mock-bridge）
- Produces: 按域拆分的 kernel API

- [ ] **Step 1: 读取 kernel/index.ts 分析职责边界**

识别 API 定义、错误类型、会话管理、文件操作、类型定义等。

- [ ] **Step 2: 创建域子模块**

每个子模块导出对应域的 kernel API。

- [ ] **Step 3: 更新 barrel index.ts**

re-export 所有子模块。

- [ ] **Step 4: 验证**

```powershell
pnpm --dir frontend run typecheck
```

---

### Task 1.6: React.lazy/Suspense 恢复

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/regions/RightPanel.tsx`
- Create: `frontend/src/app/components/LazyComponents.tsx`

**Interfaces:**
- Consumes: React.lazy, Suspense
- Produces: 延迟加载的重型组件

- [ ] **Step 1: 创建 LazyComponents.tsx**

对以下重型组件添加 React.lazy 包装：
- `DiffEditorSection` (CodeMirror)
- `EditorSurfaceShell` (CodeMirror)
- `TerminalPanel` (xterm.js)
- `GitHubPanel`
- `ChangesPanel`
- `BrowserPanel`

- [ ] **Step 2: 在 App.tsx/RightPanel.tsx 中使用 Suspense 包裹**

```tsx
const LazyDiffEditor = React.lazy(() => import('./panels/DiffEditorSection'));
// 使用处包裹 <Suspense fallback={<div className="skeleton" />}>
```

- [ ] **Step 3: 验证**

```powershell
pnpm --dir frontend run typecheck
pnpm --dir frontend run test -- --run
```

---

### Task 1.7: 深层相对导入清理（105 处）

**Files:**
- 修改 43 个文件中使用 `../../` 及以上深度的导入

**Interfaces:**
- Consumes: tsconfig paths 别名配置
- Produces: 使用 `@` 路径别名的导入

- [ ] **Step 1: 搜索所有深层导入位置**

```powershell
# 搜索 3+ 层相对导入
grep -rn "\.\.\/\.\.\/\.\.\/" frontend/src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: 逐文件替换为 @ 别名**

示例：
```typescript
// 从
import { something } from '../../../shared/types';
// 改为
import { something } from '@shared/types';
```

- [ ] **Step 3: 验证**

```powershell
pnpm --dir frontend run typecheck
pnpm --dir frontend run lint:fix
```

---

## Phase 2: 🟡 中优先级（14 项）

### Task 2.1: BrowserPanel.tsx 提取子组件（689→~500 行）

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx`
- Create: `frontend/src/app/features/browser/BrowserPanelDialogs.tsx`
- Create: `frontend/src/app/features/browser/BrowserPanelLanding.tsx`

**Interfaces:**
- Consumes: useBrowserPanel store 选择器
- Produces: BrowserPanelDialogs, BrowserPanelLanding

- [ ] **Step 1: 提取 BrowserPanelDialogs.tsx**

提取所有对话框渲染逻辑（CreateTabDialog、BookmarkToFolderDialog、ConfirmDialog 等）。

- [ ] **Step 2: 提取 BrowserPanelLanding.tsx**

提取着陆页/空状态渲染逻辑。

- [ ] **Step 3: 更新 BrowserPanel.tsx**

使用提取的子组件，精简主文件。

- [ ] **Step 4: 验证**

```powershell
pnpm --dir frontend run typecheck
```

---

### Task 2.2: BrowserTreeEntry.tsx 提取子组件（507→~350 行）

**Files:**
- Modify: `frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx`
- Create: `frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx`
- Create: `frontend/src/app/features/browser-tree/BrowserTreeEntryChildren.tsx`

**Interfaces:**
- Consumes: browserSlice, browserFoldersSlice
- Produces: BrowserTreeEntryMenu, BrowserTreeEntryChildren

- [ ] **Step 1: 提取菜单渲染组件**

- [ ] **Step 2: 提取子条目展开组件**

- [ ] **Step 3: 更新主组件**

- [ ] **Step 4: 验证**

---

### Task 2.3: BrowserNavigator.tsx 按模式拆分（478→~300 行）

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx`
- Create: `frontend/src/app/features/browser/BrowserNavOpenMode.tsx`
- Create: `frontend/src/app/features/browser/BrowserNavTabsMode.tsx`
- Create: `frontend/src/app/features/browser/BrowserNavListMode.tsx`
- Create: `frontend/src/app/features/browser/BrowserNavSearchMode.tsx`

**Interfaces:**
- Consumes: browserSlice, browserTabsSlice
- Produces: 4 种导航模式组件

- [ ] **Step 1-4: 提取 4 种导航模式组件**

- [ ] **Step 5: 验证**

---

### Task 2.4: useChangesPanelState.tsx 提取子 Hook（493→~300 行）

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelFilters.ts`
- Create: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelSort.ts`

**Interfaces:**
- Consumes: changesPanelSlice
- Produces: useChangesPanelFilters, useChangesPanelSort

- [ ] **Step 1-2: 提取过滤和排序 Hook**

- [ ] **Step 3: 验证**

---

### Task 2.5: useBrowserTreeData.ts 提取子 Hook（464→~300 行）

**Files:**
- Modify: `frontend/src/app/features/browser-tree/useBrowserTreeData.ts`
- Create: `frontend/src/app/features/browser-tree/useBrowserTreeCache.ts`
- Create: `frontend/src/app/features/browser-tree/useBrowserTreeVirtualization.ts`

**Interfaces:**
- Consumes: browserFoldersSlice, browserTabsSlice
- Produces: useBrowserTreeCache, useBrowserTreeVirtualization

- [ ] **Step 1-2: 提取缓存和虚拟化 Hook**

- [ ] **Step 3: 验证**

---

### Task 2.6: fileTree.tsx 提取子 Hook（482→~350 行）

**Files:**
- Modify: `frontend/src/app/features/file-tree/fileTree.tsx`
- Create: `frontend/src/app/features/file-tree/useFileTreeVirtualization.ts`
- Create: `frontend/src/app/features/file-tree/useFileTreeHover.ts`

**Interfaces:**
- Consumes: workspaceSlice
- Produces: useFileTreeVirtualization, useFileTreeHover

- [ ] **Step 1-2: 提取虚拟化和悬停 Hook**

- [ ] **Step 3: 验证**

---

### Task 2.7: browserFoldersSlice.ts 提取选择器（438→~300 行）

**Files:**
- Modify: `frontend/src/app/stores/slices/browserFoldersSlice.ts`
- Create: `frontend/src/app/stores/slices/browserFoldersSelectors.ts`
- Create: `frontend/src/app/stores/slices/browserFoldersHelpers.ts`

- [ ] **Step 1-2: 提取选择器和帮助函数**

- [ ] **Step 3: 验证**

---

### Task 2.8: githubRepoSlice.ts 提取选择器（422→~300 行）

**Files:**
- Modify: `frontend/src/app/stores/slices/githubRepoSlice.ts`
- Create: `frontend/src/app/stores/slices/githubRepoSelectors.ts`
- Create: `frontend/src/app/stores/slices/githubRepoHelpers.ts`

- [ ] **Step 1-2: 提取选择器和帮助函数**

- [ ] **Step 3: 验证**

---

### Task 2.9: workspaceActions.ts 提取浏览器清理（425→~350 行）

**Files:**
- Modify: `frontend/src/app/stores/actions/workspaceActions.ts`
- Create: `frontend/src/app/stores/actions/browserCleanupActions.ts`

- [ ] **Step 1: 提取浏览器清理相关 action**

- [ ] **Step 2: 验证**

---

### Task 2.10: Rust agent_pipeline.rs clone 消除

**Files:**
- Modify: `src-tauri/src/commands/agent_pipeline.rs`

- [ ] **Step 1: 将 collect_file_context 等函数参数 String 改为 &str**

- [ ] **Step 2: 验证**

```powershell
cargo check --workspace
cargo clippy --workspace -- -D warnings
```

---

### Task 2.11: Rust task.rs clone 消除 + approval 子模块

**Files:**
- Modify: `src-tauri/src/commands/task.rs`
- Create: `src-tauri/src/commands/task_approval.rs`

- [ ] **Step 1: 提取 task_decide_approval 到独立子模块**

- [ ] **Step 2: 参数借用化消除 clone**

- [ ] **Step 3: 验证**

---

### Task 2.12: Rust patch.rs clone 消除

**Files:**
- Modify: `src-tauri/src/commands/patch.rs`

- [ ] **Step 1: 参数借用化消除 8 处 clone**

- [ ] **Step 2: 验证**

---

### Task 2.13: Rust workspace_sidebar.rs clone 消除

**Files:**
- Modify: `src-tauri/src/commands/workspace_sidebar.rs`

- [ ] **Step 1: 参数借用化消除 5 处 clone**

- [ ] **Step 2: 验证**

---

### Task 2.14: App.tsx getState() → 选择器

**Files:**
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: 定位 useAppStore.getState() 调用**

- [ ] **Step 2: 改为 useAppStore 选择器订阅**

```typescript
// 从
const sessionId = useAppStore.getState().activeSessionId;
// 改为
const activeSessionId = useAppStore(s => s.activeSessionId);
```

- [ ] **Step 3: 验证**

---

## Phase 3: 🟢 低优先级（2 项）

### Task 3.1: crates/workspace/src/lib.rs 测试代码外移

**Files:**
- Modify: `crates/workspace/src/lib.rs`
- Create: `crates/workspace/tests/lib_tests.rs`

- [ ] **Step 1: 将 #[cfg(test)] mod tests 移至 tests/ 目录**

- [ ] **Step 2: 验证**

```powershell
cargo test -p adl-workspace
```

---

### Task 3.2: crates/browser/src/webview2_message.rs 按消息类型拆分

**Files:**
- Modify: `crates/browser/src/webview2_message.rs`
- Create: `crates/browser/src/webview2_message_navigation.rs`
- Create: `crates/browser/src/webview2_message_audio.rs`

- [ ] **Step 1: 按消息类型拆分**

- [ ] **Step 2: 验证**

---

## 执行统计

| Phase | 任务数 | 预计代码变化 |
|-------|--------|-------------|
| Phase 1 | 7 | +300 / -500 行 |
| Phase 2 | 14 | +400 / -600 行 |
| Phase 3 | 2 | +50 / -50 行 |
| **总计** | **23** | **+750 / -1150 行** |

## 执行方式

**1. Subagent-Driven（推荐）** - 每任务独立子代理 + 代码审查
**2. Inline Execution** - 本会话批量执行 + 检查点

---

> 由 writing-plans 生成于 2026-06-30
> 基于洞察报告: [refactor-insight-2026-06-30.md](../../../docs/refactoring-insight/report/daily-insights/2026-06/refactor-insight-2026-06-30.md)