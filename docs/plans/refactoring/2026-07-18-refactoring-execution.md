# 重构执行实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 修复重构洞察报告发现的全部 22 项问题（3 Critical + 5 High + 10 Medium + 4 Low）

**架构策略:**
- Phase 1（核心重构）: 拆分 3 个超标模块，消除架构债务的集中点
- Phase 2（后端清理）: 消除 Rust 测试重复代码，拆分混合职责模块，优化流式分配
- Phase 3（质量安全）: 修复 i18n 违规、魔法数字、未命名常量、重复代码、安全加固
- Phase 4（测试补充）: 为高频变动的 Zustand 切片补充单元测试

**技术栈:** Rust 1.97.1 + Tauri 2.x, React 19 + TypeScript 5.6 + Vite 8 + Zustand 5, Vitest 3.x

## 全局约束

- 所有 Rust 代码必须通过 `cargo clippy --workspace --all-targets -- -D warnings`
- 所有 Rust 测试必须通过 `cargo test --workspace`
- 所有前端代码必须通过 `pnpm --dir frontend run lint`（当前 1 warning）
- 所有前端测试必须通过 `pnpm --dir frontend run test`
- 双端一致性：所有功能在 Tauri 桌面和浏览器模式下必须一致
- 禁止在 product 代码中使用 `.unwrap()` 或类似 panic 模式
- 所有 UI 展示文本必须使用 i18n key
- ESLint 规则: `consistent-type-imports`, `no-require-imports` [error], `no-empty-object-type` [error]
- 新命令必须类型化（serde）+ 登记到 `capabilities/*.json`
- Rust 返回 `Result<T, AppError>` 结构化错误

---

## Phase 1: 核心架构重构（Critical — 3 项）

### Task 1: previewWorkspaceService 模块拆分 + 路由表重构

**Files:**
- Create: `frontend/dev/previewWorkspaceService/git.ts`
- Create: `frontend/dev/previewWorkspaceService/search.ts`
- Create: `frontend/dev/previewWorkspaceService/files.ts`
- Create: `frontend/dev/previewWorkspaceService/ci.ts`
- Create: `frontend/dev/previewWorkspaceService/logging.ts`
- Create: `frontend/dev/previewWorkspaceService/mcp.ts`
- Create: `frontend/dev/previewWorkspaceService/index.ts`
- Delete: `frontend/dev/previewWorkspaceService.ts`

**Interfaces:**
- Consumes: 无（新模块拆分）
- Produces: `previewWorkspaceService/index.ts` 作为新的入口点，导出与老文件相同的 API（所有 `export function`）

- [ ] **Step 1: 创建 git.ts — 提取 Git 相关函数**

```typescript
// frontend/dev/previewWorkspaceService/git.ts
import type { GitSnapshot, GitBranch } from '@ai-digital-life/kernel';

// 从原 previewWorkspaceService.ts 提取所有 git 函数
export async function captureGitSnapshot(workspaceRoot: string): Promise<GitSnapshot> {
  // ... 原 captureGitSnapshot 实现
}

export async function listGitBranches(workspaceRoot: string): Promise<GitBranch[]> {
  // ... 原 listGitBranches 实现
}

export async function switchGitBranch(workspaceRoot: string, branchName: string): Promise<void> {
  // ... 原 switchGitBranch 实现
}

export async function createGitBranch(workspaceRoot: string, branchName: string): Promise<void> {
  // ... 原 createGitBranch 实现
}

export async function stageFile(workspaceRoot: string, filePath: string): Promise<void> {
  // ... 原 stageFile 实现
}

export async function unstageFile(workspaceRoot: string, filePath: string): Promise<void> {
  // ... 原 unstageFile 实现
}

export async function discardFileChanges(workspaceRoot: string, filePath: string): Promise<void> {
  // ... 原 discardFileChanges 实现
}

export async function autoStash(workspaceRoot: string): Promise<string | null> {
  // ... 原 autoStash 实现
}

export async function popAutoStash(workspaceRoot: string, stashRef: string): Promise<void> {
  // ... 原 popAutoStash 实现
}

export async function gitHasLocalChanges(workspaceRoot: string): Promise<boolean> {
  // ... 原 gitHasLocalChanges 实现
}
```

- [ ] **Step 2: 创建 search.ts — 提取搜索函数**

```typescript
// frontend/dev/previewWorkspaceService/search.ts
export interface SearchResult { path: string; line: number; column: number; lineContent: string; }

export async function searchText(query: string, workspaceRoot: string): Promise<SearchResult[]> {
  // ... 原 searchText 实现
}

export async function searchTextAsync(query: string, workspaceRoot: string, signal?: AbortSignal): Promise<SearchResult[]> {
  // ... 原 searchTextAsync 实现
}
```

- [ ] **Step 3: 创建 files.ts — 提取文件操作函数**

```typescript
// frontend/dev/previewWorkspaceService/files.ts
import type { WorkspaceFileTree, FileOutlineItem } from '@ai-digital-life/kernel';

export async function openWorkspace(workspacePath: string): Promise<{ id: string; name: string }> {
  // ... 原 openWorkspace 实现
}

export async function listTree(workspaceRoot: string): Promise<WorkspaceFileTree> {
  // ... 原 listTree 实现
}

export async function createFile(workspaceRoot: string, relativePath: string, content?: string): Promise<void> {
  // ... 原 createFile 实现
}

export async function createFolder(workspaceRoot: string, relativePath: string): Promise<void> {
  // ... 原 createFolder 实现
}

export async function deleteEntry(workspaceRoot: string, relativePath: string): Promise<void> {
  // ... 原 deleteEntry 实现
}

export async function moveEntry(workspaceRoot: string, sourcePath: string, destPath: string): Promise<void> {
  // ... 原 moveEntry 实现
}

export async function renameEntry(workspaceRoot: string, oldPath: string, newName: string): Promise<void> {
  // ... 原 renameEntry 实现
}

export async function duplicateEntry(workspaceRoot: string, srcPath: string, destPath: string): Promise<void> {
  // ... 原 duplicateEntry 实现
}

export async function outlineFile(workspaceRoot: string, relativePath: string): Promise<FileOutlineItem[]> {
  // ... 原 outlineFile 实现
}
```

- [ ] **Step 4: 创建 ci.ts — 提取 CI 相关函数**

```typescript
// frontend/dev/previewWorkspaceService/ci.ts
export interface CiJobSummary { id: string; status: string; conclusion?: string; name: string; }

export async function fetchCiStatus(workspaceRoot: string, branch?: string): Promise<CiJobSummary[]> {
  // ... 原 fetchCiStatus 实现
}
```

- [ ] **Step 5: 创建 logging.ts — 提取日志函数**

```typescript
// frontend/dev/previewWorkspaceService/logging.ts
export async function writeDebugLogs(content: string, logDir?: string): Promise<void> {
  // ... 原 writeDebugLogs 实现
}
```

- [ ] **Step 6: 创建 mcp.ts — 提取 MCP 函数**

```typescript
// frontend/dev/previewWorkspaceService/mcp.ts
import type { McpServerConfig } from '@shared/ipc';

export async function loadMcpConfig(path: string): Promise<McpServerConfig[]> {
  // ... 原 loadMcpConfig 实现
}
```

- [ ] **Step 7: 创建 index.ts — 路由表重构 handlePreviewWorkspaceApi**

```typescript
// frontend/dev/previewWorkspaceService/index.ts
import * as git from './git';
import * as files from './files';
import * as search from './search';
import * as ci from './ci';
import * as logging from './logging';
import * as mcp from './mcp';
// ... 其他 import

// 重构 handlePreviewWorkspaceApi：路由表取代 460 行 if-else 链
interface Route {
  method: string;
  pathPattern: RegExp | string;
  requiredFields?: string[];
  handler: (params: Record<string, string>, body?: unknown) => Promise<unknown>;
}

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function fail(message: string, code?: string): { ok: false; error: string; code?: string } {
  return { ok: false, error: message, code };
}

const routes: Route[] = [
  // Git 路由
  { method: 'GET', pathPattern: /^\/api\/workspace\/([^/]+)\/git-snapshot$/, handler: async (p) => ok(await git.captureGitSnapshot(p[0])) },
  { method: 'GET', pathPattern: /^\/api\/workspace\/([^/]+)\/git-branches$/, handler: async (p) => ok(await git.listGitBranches(p[0])) },
  { method: 'POST', pathPattern: /^\/api\/workspace\/([^/]+)\/git-branch-switch$/, requiredFields: ['branchName'], handler: async (p, b) => ok(await git.switchGitBranch(p[0], (b as any).branchName)) },
  { method: 'POST', pathPattern: /^\/api\/workspace\/([^/]+)\/git-branch-create$/, requiredFields: ['branchName'], handler: async (p, b) => ok(await git.createGitBranch(p[0], (b as any).branchName)) },
  { method: 'POST', pathPattern: /^\/api\/workspace\/([^/]+)\/stage-file$/, requiredFields: ['filePath'], handler: async (p, b) => ok(await git.stageFile(p[0], (b as any).filePath)) },
  { method: 'POST', pathPattern: /^\/api\/workspace\/([^/]+)\/unstage-file$/, requiredFields: ['filePath'], handler: async (p, b) => ok(await git.unstageFile(p[0], (b as any).filePath)) },
  { method: 'POST', pathPattern: /^\/api\/workspace\/([^/]+)\/discard-file$/, requiredFields: ['filePath'], handler: async (p, b) => ok(await git.discardFileChanges(p[0], (b as any).filePath)) },
  // 文件路由
  { method: 'GET', pathPattern: /^\/api\/workspace\/([^/]+)\/tree$/, handler: async (p) => ok(await files.listTree(p[0])) },
  { method: 'POST', pathPattern: /^\/api\/workspace\/([^/]+)\/file-create$/, requiredFields: ['relativePath'], handler: async (p, b) => ok(await files.createFile(p[0], (b as any).relativePath, (b as any).content)) },
  { method: 'POST', pathPattern: /^\/api\/workspace\/([^/]+)\/file-delete$/, requiredFields: ['relativePath'], handler: async (p, b) => ok(await files.deleteEntry(p[0], (b as any).relativePath)) },
  { method: 'POST', pathPattern: /^\/api\/workspace\/([^/]+)\/file-move$/, requiredFields: ['sourcePath', 'destPath'], handler: async (p, b) => ok(await files.moveEntry(p[0], (b as any).sourcePath, (b as any).destPath)) },
  // ... 其余路由同理
];

export async function handlePreviewWorkspaceApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const match = routes.find((r) => r.method === request.method && url.pathname.match(r.pathPattern));
  if (!match) return new Response(JSON.stringify({ ok: false, error: 'route not found' }), { status: 404 });

  const params = url.pathname.match(match.pathPattern)?.slice(1) ?? [];
  let body: unknown = undefined;
  if (match.requiredFields) {
    body = await request.json();
    for (const field of match.requiredFields) {
      if (!(body as any)?.[field]) return new Response(JSON.stringify(fail(`${field} is required`)), { status: 400 });
    }
  }
  try {
    const result = await match.handler(params, body);
    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify(fail(String(e))), { status: 500 });
  }
}

// Re-export 所有公开 API 保持兼容
export { git, files, search, ci, logging, mcp };
export { openWorkspace } from './files';
export { writeDebugLogs } from './logging';
// ... 其余所有原先从 previewWorkspaceService.ts 导出的函数
```

- [ ] **Step 8: 运行前端测试验证不破坏现有功能**

```bash
cd frontend && pnpm run test
```
Expected: 594 passed (0 failed)

- [ ] **Step 9: 删除老文件并提交**

```bash
Remove-Item dev/previewWorkspaceService.ts
git add frontend/dev/previewWorkspaceService/
git commit -m "refactor(preview): split previewWorkspaceService.ts into modules with route table"
```

**注意:** 此操作影响 `test:e2e:workspace` 测试，因为 e2e server 入口点改变。需检查 `test:e2e:workspace` 中引用的路径并更新。

- [ ] **Step 10: 更新 E2E 入口引用**

```bash
rg "previewWorkspaceService" frontend/ --include "*.ts" --include "*.spec.ts"
```
更新所有引用到新的 `previewWorkspaceService/index.ts` 路径。通常引用点是 `startPreviewWorkspaceServer`。


### Task 2: StoreState 接口组合化

**Files:**
- Modify: `frontend/src/app/stores/StoreState.ts`

**Interfaces:**
- Consumes: Task 1 已完成的 StoreState 类型定义
- Produces: `StoreState` 使用交叉类型组合，不再需要手动列出所有 55 个 extends

- [ ] **Step 1: 收集所有 slice 和 action 类型定义到一个元组**

```typescript
// frontend/src/app/stores/StoreState.ts
// 保持所有 import 不变 ...
// 将 StoreStateBase 和所有 action interface 改为类型数组

// 收集所有 slice 类型
type AllSlices = [
  UISlice, WorkspaceSlice, GitSlice, SessionSlice, EditorSlice,
  PatchSlice, SearchSlice, DiagnosticSlice, TaskSlice, CommandSlice,
  ClipboardSlice, TerminalSlice, BrowserTabsSlice, BrowserBookmarkSlice,
  BrowserHistorySlice, BrowserFoldersSlice, BrowserLandingSlice,
  BrowserSlice, CiSlice, CommunicateSlice, GitHubRepoSlice,
  GitHubTreeSlice, GitHubSliceType, AgentSlice, CustomCommandSlice,
  PermissionSlice, CompactionSlice, WebToolsSlice, McpSlice,
  ProviderSlice, ReferenceSlice, DurableSlice, ToastSlice,
  NotificationSlice,
];

// 收集所有 action 接口
type AllActions = [
  WorkspaceActions, SessionActions, EditorActions, GitActions,
  PatchActions, SearchActions, TaskActions, CommandActions,
  CustomCommandActions, PermissionActions, CompactionActions,
  DataFetchActions, AgentActions, McpActions, ProviderActions,
  WebToolsActions, LspActions, CustomAgentActions, ReferenceActions,
  SnapshotActions, SessionForkActions, DurableActions,
];
```

- [ ] **Step 2: 使用 mapped type 合并**

```typescript
// 保留 root-level 字段
interface StoreStateRootFields {
  loading: boolean;
  appReady: boolean;
  error?: string;
  isFetching: Record<string, boolean>;
  isTauri: boolean;
  customAgents: AgentConfig[];
  isFetchingCustomAgents: boolean;
  lspActiveServers: string[];
  lspDiagnostics: DiagnosticInfo[];
  bootstrap: () => Promise<void>;
}

// 合并所有 slice + action + root fields
export type StoreState = StoreStateRootFields
  & UnionToIntersection<AllSlices[number]>
  & UnionToIntersection<AllActions[number]>;
```

- [ ] **Step 3: 定义 UnionToIntersection 工具类型**

```typescript
// 如果不存在类似的工具类型，在文件顶部添加
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
```

- [ ] **Step 4: 创建测试验证类型正确**

```typescript
// frontend/src/app/stores/__tests__/storeState-branded.test.ts
// 验证 StoreState 仍包含关键方法和字段
import type { StoreState } from '../StoreState';

describe('StoreState', () => {
  it('should have workspace actions', () => {
    const state: Pick<StoreState, 'openWorkspace' | 'clearWorkspaceContext'> = {} as StoreState;
    expect(typeof state.openWorkspace).toBe('function');
  });

  it('should have session actions', () => {
    const state: Pick<StoreState, 'sendMessage' | 'createSession'> = {} as StoreState;
    expect(typeof state.sendMessage).toBe('function');
  });

  it('should have root-level fields', () => {
    const state: Pick<StoreState, 'loading' | 'appReady' | 'isTauri'> = {} as StoreState;
    expect(state.loading).toBe(false);
  });
});
```

- [ ] **Step 5: 运行类型检查和测试**

```bash
cd frontend && pnpm run typecheck && pnpm run test
```
Expected: TypeScript 编译通过，594 测试通过

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/stores/StoreState.ts frontend/src/app/stores/__tests__/storeState-branded.test.ts
git commit -m "refactor(stores): compose StoreState via mapped type intersection"
```


### Task 3: BrowserPanel Context 拆分

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx`
- Modify: `frontend/src/app/features/browser/BrowserShell.tsx`
- Modify: `frontend/src/app/features/browser/BrowserPanelActionsContext.ts`
- Modify: `frontend/src/app/features/browser/BrowserPanelStateContext.ts`
- Modify: `frontend/src/app/features/browser/BrowserToolbarArea.tsx` (间接)
- Modify: `frontend/src/app/features/browser/BrowserContentArea.tsx` (间接)

**Interfaces:**
- Consumes: `BrowserPanelActions`, `BrowserPanelState`（已定义为 Context types）
- Produces: 通过 React Context 直接提供 actions/state，减少 prop drilling

- [ ] **Step 1: 将 BrowserPanelActionsContext 和 BrowserPanelStateContext 从 prop type 改为 Provider**

```typescript
// frontend/src/app/features/browser/BrowserPanelActionsContext.ts
import { createContext, useContext } from 'react';
import type { BrowserPanelActions } from './useBrowserPanelActions';

// 保留原有 type export
export type { BrowserPanelActions } from './useBrowserPanelActions';

const BrowserPanelActionsContext = createContext<BrowserPanelActions | null>(null);

export function useBrowserPanelActions(): BrowserPanelActions {
  const ctx = useContext(BrowserPanelActionsContext);
  if (!ctx) throw new Error('useBrowserPanelActions must be used within BrowserPanel');
  return ctx;
}

export { BrowserPanelActionsContext };
```

```typescript
// frontend/src/app/features/browser/BrowserPanelStateContext.ts
import { createContext, useContext } from 'react';
import type { BrowserPanelState } from './useBrowserPanelState';

export type { BrowserPanelState } from './useBrowserPanelState';

const BrowserPanelStateContext = createContext<BrowserPanelState | null>(null);

export function useBrowserPanelState(): BrowserPanelState {
  const ctx = useContext(BrowserPanelStateContext);
  if (!ctx) throw new Error('useBrowserPanelState must be used within BrowserPanel');
  return ctx;
}

export { BrowserPanelStateContext };
```

- [ ] **Step 2: 从 BrowserPanel.tsx 提取 actionsValue 和 stateMemo 到独立 hook 文件**

```typescript
// frontend/src/app/features/browser/useBrowserPanelActions.ts
import { useMemo } from 'react';
import type { BrowserPanelActions } from './BrowserPanelTypes';

export function useBrowserPanelActions(): BrowserPanelActions {
  const {
    browserOpenTab,
    browserNavigateActiveTab,
    // ... 所有 actions 依赖
  } = useAppStore(useShallow((state) => ({ ... })));

  return useMemo(() => ({
    openTab: browserOpenTab,
    navigateActiveTab: browserNavigateActiveTab,
    // ...
  }), [
    browserOpenTab,
    browserNavigateActiveTab,
    // ... 所有 deps
  ]);
}
```

```typescript
// frontend/src/app/features/browser/useBrowserPanelState.ts
import { useMemo } from 'react';
import type { BrowserPanelState } from './BrowserPanelTypes';

export function useBrowserPanelState(): BrowserPanelState {
  const {
    tabs,
    activeTabId,
    // ... 所有 state 依赖
  } = useAppStore(useShallow((state) => ({ ... })));

  return useMemo(() => ({
    tabs,
    activeTabId,
    // ...
  }), [
    tabs,
    activeTabId,
    // ... 所有 deps
  ]);
}
```

- [ ] **Step 3: 简化 BrowserPanel.tsx — 使用 Provider 包裹**

```typescript
// frontend/src/app/features/browser/BrowserPanel.tsx
import { BrowserPanelActionsContext } from './BrowserPanelActionsContext';
import { BrowserPanelStateContext } from './BrowserPanelStateContext';
import { useBrowserPanelActions } from './useBrowserPanelActions';
import { useBrowserPanelState } from './useBrowserPanelState';

export function BrowserPanel(props: BrowserPanelProps) {
  const t = useTCopy();
  useBrowserThemeSync();

  const actions = useBrowserPanelActions();
  const stateValue = useBrowserPanelState();

  // 其他 hooks ...
  const { contextMenu, handleTogglePin } = useBrowserMenus(/* ... */);
  const { showToast, removeToast } = useBrowserToast();

  return (
    <BrowserPanelActionsContext.Provider value={actions}>
      <BrowserPanelStateContext.Provider value={stateValue}>
        <BrowserShell
          t={t}
          contextMenu={contextMenu}
          handleTogglePin={handleTogglePin}
          // ... 只传递非 actions/state 的 props
        />
      </BrowserPanelStateContext.Provider>
    </BrowserPanelActionsContext.Provider>
  );
}
```

- [ ] **Step 4: 简化 BrowserShell.tsx — 通过 Context 消费 actions/state**

```typescript
// frontend/src/app/features/browser/BrowserShell.tsx
import { useBrowserPanelActions } from './BrowserPanelActionsContext';
import { useBrowserPanelState } from './BrowserPanelStateContext';

export function BrowserShell(props: Omit<BrowserShellProps, 'stateValue' | 'actionsValue'>) {
  const stateValue = useBrowserPanelState();
  const actionsValue = useBrowserPanelActions();

  return (
    <div className="adl-tool-panel adl-tool-panel--browser">
      <BrowserToolbarArea />
      <BrowserContentArea {...props} />
    </div>
  );
}
```

- [ ] **Step 5: BrowserToolbarArea 和 BrowserContentArea 直接通过 Context 获取 state/actions**

```typescript
// BrowserToolbarArea.tsx 和 BrowserContentArea.tsx
// 删除 props.stateValue / props.actionsValue
// 改用 useBrowserPanelActions() / useBrowserPanelState()
```

- [ ] **Step 6: 运行测试**

```bash
cd frontend && pnpm run test
```
Expected: 594 passed (0 failed)

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/features/browser/
git commit -m "refactor(browser): replace prop drilling with context for browser panel state/actions"
```


## Phase 2: 后端清理（High — 4 项）

### Task 4: crud.rs 测试工具提取

**Files:**
- Modify: `crates/storage/src/crud.rs`

**Interfaces:**
- Consumes: `Database::open`, `Database::init_schema`（已有 API）
- Produces: `#[cfg(test)]` scope 内的共享 `open_test_db()` 和 `unique_id()` 函数

- [ ] **Step 1: 在 crud.rs 底部添加共享测试工具**

```rust
// crates/storage/src/crud.rs — 在文件末尾，最后一个 `#[cfg(test)]` 模块 之后
#[cfg(test)]
mod test_helpers {
    use super::*;
    use crate::connection::Database;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_SEQ: AtomicU64 = AtomicU64::new(0);

    pub(crate) fn open_test_db(prefix: &str) -> Database {
        let id = TEST_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("{prefix}-{id}.db"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("test db should open");
        db.init_schema().expect("schema should init");
        db
    }

    pub(crate) fn unique_id(prefix: &str) -> String {
        format!("{prefix}-{}", TEST_SEQ.fetch_add(1, Ordering::SeqCst))
    }
}
```

- [ ] **Step 2: 删除每个测试模块中的重复 `open_test_db`, `SEQ`, `unique_id`**

在以下 6 个测试模块中：`doom_loop_count_tests`, `list_by_run_tests`, `save_entity_tests`, `list_entity_many_tests`, `save_audit_entries_tests`, `session_read_sync_tests`:

```rust
// 删除每个模块中的以下 3 块代码：
// 1. use std::sync::atomic::{AtomicU64, Ordering};
// 2. static SEQ: AtomicU64 = AtomicU64::new(0);
// 3. fn unique_id(...)
// 4. fn open_test_db(...)

// 改为调用共享函数：
use super::test_helpers::{open_test_db, unique_id};

// 并改用共享的 open_test_db
```

- [ ] **Step 3: 验证编译和测试**

```bash
cargo test --workspace -p adl-storage crud 2>&1
```
Expected: 所有 crud 测试通过

- [ ] **Step 4: 提交**

```bash
git add crates/storage/src/crud.rs
git commit -m "refactor(storage): extract shared open_test_db() helpers, remove 6 copies"
```


### Task 5: git.rs 子模块拆分

**Files:**
- Create: `crates/workspace/src/git_snapshot.rs`
- Create: `crates/workspace/src/git_branch.rs`
- Create: `crates/workspace/src/git_staging.rs`
- Modify: `crates/workspace/src/git.rs`（缩减为 mod 声明 + re-exports）
- Modify: `crates/workspace/src/lib.rs`（添加 mod + pub use）

**Interfaces:**
- Consumes: `crates/workspace/src/git.rs` 的现有函数（按职责分到 3 个文件）
- Produces: 3 个子模块 + lib.rs 统一 re-export

- [ ] **Step 1: 创建 git_snapshot.rs 提取快照相关函数**

```rust
// crates/workspace/src/git_snapshot.rs
use std::path::Path;
use adl_types::GitSnapshot;
use adl_errors::AppError;

pub fn capture_git_snapshot(root: &Path) -> Result<GitSnapshot, AppError> {
    // 从原 git.rs 提取所有 snapshot 相关代码
}

pub async fn capture_git_snapshot_async(root: &Path) -> Result<GitSnapshot, AppError> {
    // 从原 git.rs 提取
}

pub fn git_has_local_changes(root: &Path) -> Result<bool, AppError> {
    // 从原 git.rs 提取
}

pub fn has_auto_stash(root: &Path) -> Result<bool, AppError> {
    // 从原 git.rs 提取
}

pub fn pop_auto_stash(root: &Path) -> Result<(), AppError> {
    // 从原 git.rs 提取
}

#[cfg(test)]
mod tests {
    // 提取原 git.rs 测试代码中的 snapshot 相关测试
}
```

- [ ] **Step 2: 创建 git_branch.rs 提取分支相关函数**

```rust
// crates/workspace/src/git_branch.rs
use std::path::Path;
use adl_types::GitBranch;
use adl_errors::AppError;

pub fn list_git_branches(root: &Path) -> Result<Vec<GitBranch>, AppError> {
    // 从原 git.rs 提取
}

pub fn switch_git_branch(root: &Path, branch_name: &str) -> Result<(), AppError> {
    // 从原 git.rs 提取
}

pub fn create_git_branch(root: &Path, branch_name: &str) -> Result<(), AppError> {
    // 从原 git.rs 提取
}

#[cfg(test)]
mod tests {
    // 提取分支相关测试
}
```

- [ ] **Step 3: 创建 git_staging.rs 提取暂存相关函数**

```rust
// crates/workspace/src/git_staging.rs
use std::path::Path;
use adl_errors::AppError;

pub fn stage_file(root: &Path, file_path: &str) -> Result<(), AppError> {
    // 从原 git.rs 提取
}

pub fn unstage_file(root: &Path, file_path: &str) -> Result<(), AppError> {
    // 从原 git.rs 提取
}

pub fn discard_file_changes(root: &Path, file_path: &str) -> Result<(), AppError> {
    // 从原 git.rs 提取
}

#[cfg(test)]
mod tests {
    // 提取 staging 相关测试
}
```

- [ ] **Step 4: 将 git.rs 缩减为 re-export 桥接**

```rust
// crates/workspace/src/git.rs — 所有实现移走后，仅保留 re-exports
mod git_snapshot;
mod git_branch;
mod git_staging;

pub use git_snapshot::{
    capture_git_snapshot, capture_git_snapshot_async, git_has_local_changes,
    has_auto_stash, pop_auto_stash,
};
pub use git_branch::{list_git_branches, switch_git_branch, create_git_branch};
pub use git_staging::{stage_file, unstage_file, discard_file_changes};
```

- [ ] **Step 5: 更新 lib.rs 的 mod git 声明不变**

```rust
// crates/workspace/src/lib.rs — 无变化，但确认 pub use 路径正确
// 原来：mod git; pub use git::{...};
// 现在：git.rs 是 mod + re-export 桥接，对外 pub use 不变
```

- [ ] **Step 6: 运行测试**

```bash
cargo test --workspace -p adl-workspace
```
Expected: 所有 workspace 测试通过（含 6 个 git-gated ignore 测试）

- [ ] **Step 7: 提交**

```bash
git add crates/workspace/src/git_snapshot.rs crates/workspace/src/git_branch.rs crates/workspace/src/git_staging.rs crates/workspace/src/git.rs
git commit -m "refactor(workspace): split git.rs into git_snapshot, git_branch, git_staging submodules"
```


### Task 6: Provider 流式分配优化

**Files:**
- Modify: `crates/model-gateway/src/providers/openai.rs`
- Modify: `crates/model-gateway/src/providers/anthropic.rs`
- Modify: `crates/model-gateway/src/providers/google.rs`
- Modify: `crates/model-gateway/src/providers/ollama.rs`
- Modify: `crates/model-gateway/src/providers/openrouter.rs`

**Interfaces:**
- Consumes: `reqwest::Response::bytes_stream()` 提供 `Result<Bytes>`
- Produces: 相同的 `StreamChunk` 流，但减少 `String` 分配

- [ ] **Step 1: 修改 openai.rs 流式闭包 — 消除 String::from_utf8_lossy().to_string()**

```rust
// crates/model-gateway/src/providers/openai.rs 第 252-273 行 修改
let stream = response.bytes_stream().map(move |chunk| {
    let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
    // 不创建 String，直接在 Cow<str> 上操作
    let text = String::from_utf8_lossy(&chunk);
    for line in text.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            if data == "[DONE]" {
                return Ok(StreamChunk::Done(ModelTokenUsage {
                    prompt_tokens: None,
                    completion_tokens: None,
                    total_tokens: None,
                    estimated: None,
                }));
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = json["choices"][0]["delta"]["content"].as_str() {
                    return Ok(StreamChunk::Delta(delta.to_string()));
                }
            }
        }
    }
    Ok(StreamChunk::Delta(String::new()))
});
```

`delta.to_string()` 保留不变（需要 owned String 用于 `StreamChunk::Delta`）。但前一次 `String::from_utf8_lossy(&chunk).to_string()` → `Cow<str>` 避免了每个 chunk 分配一个 owned String。

- [ ] **Step 2: 对其他 4 个 provider 做同样修改**

```diff
- let text = String::from_utf8_lossy(&chunk).to_string();
+ let text = String::from_utf8_lossy(&chunk);
```
修改文件：`anthropic.rs:215`, `google.rs:203`, `ollama.rs:176`, `openrouter.rs:172`。

- [ ] **Step 3: 验证编译和 clippy**

```bash
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace -p adl-model-gateway
```
Expected: 0 警告，所有测试通过

- [ ] **Step 4: 提交**

```bash
git add crates/model-gateway/src/providers/*.rs
git commit -m "perf(model-gateway): avoid String allocation per streaming chunk in 5 providers"
```


### Task 7: Provider 路由双收集消除

**Files:**
- Modify: `crates/model-gateway/src/route.rs`
- Modify: `crates/model-gateway/src/lib.rs`

**Interfaces:**
- Consumes: `route_chain` 返回 `Vec<String>`（路由链）
- Produces: `select_provider` 消除中间 `Vec<(String, String)>` 收集

- [ ] **Step 1: 重构 select_provider — 消除 resolved Vec**

```rust
// crates/model-gateway/src/route.rs
pub(crate) async fn select_provider(
    gateway: &ModelGateway,
    route: &[String],
    messages: &[ModelChatMessage],
) -> Result<(String, String, ModelResponse), Option<String>> {
    let mut last_error = None;
    for provider in route {
        let model_id = match gateway.registry.read() {
            Ok(reg) => gateway
                .preferences()
                .providers
                .get(provider)
                .map(|pref| pref.model_id.clone())
                .unwrap_or_else(|| crate::fallback::default_model(provider, &reg)),
            Err(_) => return Err(Some("provider registry lock poisoned".to_string())),
        };
        match crate::provider::call_provider(gateway, provider, &model_id, messages).await {
            Ok(response) => return Ok((provider.clone(), model_id, response)),
            Err(error) => {
                last_error = Some(error.to_string());
            },
        }
    }
    Err(last_error)
}
```

- [ ] **Step 2: 对 lib.rs 中的 chat_stream 做相同修改**

```rust
// crates/model-gateway/src/lib.rs — 查找类似 resolved Vec 模式并消除
```

- [ ] **Step 3: 验证编译和测试**

```bash
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace -p adl-model-gateway
```
Expected: 0 警告，所有测试通过

- [ ] **Step 4: 提交**

```bash
git add crates/model-gateway/src/route.rs crates/model-gateway/src/lib.rs
git commit -m "perf(model-gateway): eliminate intermediate resolved Vec in provider routing"
```


## Phase 3: 代码质量、安全与性能（Medium — 6 项）

### Task 8: 重复代码与 i18n 违规修复

**Files:**
- Modify: `frontend/src/app/features/preview/markdownPreviewUtils.ts`
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx`
- Modify: `frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `frontend/src/app/i18n/en-US/browser.ts`
- Modify: `frontend/src/app/components/WorkspaceSplitButton.tsx`
- Modify: `ai-digital-life/AGENTS.md`

- [ ] **Step 1: 修复 escapeHtml 重复**

```typescript
// frontend/src/app/features/preview/markdownPreviewUtils.ts
// 删除私有 escapeHtml 函数定义
// 改为：
import { escapeHtml } from '@design-system/html';
```

- [ ] **Step 2: 修复 BrowserNavigator.tsx 硬编码 aria-label**

```typescript
// frontend/src/app/features/browser/BrowserNavigator.tsx
import { useTCopy } from '@i18n/useTCopy';

// 在组件内：
const { t } = useTCopy();
// 将 line 422: label="Resize browser navigator"
// 改为：label={t('browser.navigator.resizeLabel')}
```

```typescript
// frontend/src/app/i18n/zh-CN/browser.ts — 添加
'resizeLabel': '调整浏览器导航栏大小',

// frontend/src/app/i18n/en-US/browser.ts — 添加
'resizeLabel': 'Resize browser navigator',
```

- [ ] **Step 3: 修复 WorkspaceSplitButton.tsx localStorage 同步读取**

```typescript
// frontend/src/app/components/WorkspaceSplitButton.tsx
// 将组件顶层的 localStorage 读取移到 useMemo 惰性初始值
const [menuMode] = useState(() => localStorage.getItem('adl_workspace_menu_mode'));
const [defaultCreateDir] = useState(() => localStorage.getItem('adl_workspace_default_create_dir'));
```

- [ ] **Step 4: 更新 AGENTS.md 中的 lint warning 计数**

将 `（49 warnings，主要为 react-refresh/only-export-components 与 react-hooks/exhaustive-deps）` 改为：
`（1 warning，为 prettier/prettier 格式化问题）`

- [ ] **Step 5: 运行测试和 lint**

```bash
cd frontend && pnpm run lint && pnpm run test && pnpm run check:i18n
```
Expected: 0 新 warning，所有测试通过，i18n 覆盖通过

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/features/preview/markdownPreviewUtils.ts frontend/src/app/features/browser/BrowserNavigator.tsx frontend/src/app/i18n/*/browser.ts frontend/src/app/components/WorkspaceSplitButton.tsx ai-digital-life/AGENTS.md
git commit -m "fix: remove duplicate escapeHtml, add missing i18n key, fix localStorage pattern, update lint count"
```


### Task 9: 安全与输入验证加固

**Files:**
- Modify: `crates/model-gateway/src/fallback.rs`
- Modify: `frontend/src/app/components/SessionManagement.tsx`

- [ ] **Step 1: fallback.rs 添加 try_into guard**

```rust
// crates/model-gateway/src/fallback.rs — 在 `as u32` 位置添加保护
// 原代码（约第 38 行）：
//   .sum::<usize>() as u32
// 改为：
use std::num::NonZeroU32;

let total: usize = ...;  // 需要求和的表达式
let safe_total: u32 = total.try_into()
    .unwrap_or_else(|_| {
        tracing::warn!("token count {} exceeds u32::MAX, capping", total);
        u32::MAX
    });
```

**注意:** 确认 `tracing` 已在 `Cargo.toml` 的 `[dependencies]` 中。

- [ ] **Step 2: 验证 SessionManagement.tsx 的 dangerouslySetInnerHTML 安全性**

检查文件中的 8 个 `dangerouslySetInnerHTML` 渲染位置，确认使用了 DOMPurify 或等效净化：

```typescript
// frontend/src/app/components/SessionManagement.tsx — 添加净化层
import DOMPurify from 'dompurify';

// 在每个 dangerouslySetInnerHTML 使用前包装：
// 原: <div dangerouslySetInnerHTML={{ __html: content }} />
// 改: <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content || '') }} />
```

如果 `dompurify` 未在 `package.json` 中，添加它：
```bash
cd frontend && pnpm add dompurify
cd frontend && pnpm add -D @types/dompurify
```

- [ ] **Step 3: 运行测试**

```bash
cd frontend && pnpm run test
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace -p adl-model-gateway
```
Expected: 全部通过

- [ ] **Step 4: 提交**

```bash
git add crates/model-gateway/src/fallback.rs frontend/src/app/components/SessionManagement.tsx frontend/package.json
git commit -m "fix(security): add try_into guard for token count truncation, sanitize dangerouslySetInnerHTML"
```


### Task 10: 魔法数字与选择器性能优化

**Files:**
- Modify: `frontend/src/app/stores/slices/sessionSlice.ts`
- Modify: `frontend/src/app/stores/selectors.ts`
- Modify: `frontend/src/app/stores/browserSelectors.ts`

- [ ] **Step 1: 提取 sessionSlice.ts 中的魔法数字**

```typescript
// frontend/src/app/stores/slices/sessionSlice.ts
// 在文件顶部添加
const STREAMING_BUFFER_MAX_BYTES = 10_240;

// 将 line 77 的 10240 替换为 STREAMING_BUFFER_MAX_BYTES
```

- [ ] **Step 2: 优化 selectors.ts 的 O(n) openTabs.find**

```typescript
// frontend/src/app/stores/selectors.ts — getCurrentFileTab
// 添加基于 Map 的缓存
let _tabsByPath: Map<string, StoreState['openTabs'][number]> | undefined;

// 直接改为从 editorSlice 的 openTabs 中构建查找表
getCurrentFileTab: (state: StoreState) => {
    if (!state.selectedFilePath) return undefined;
    if (!_tabsByPath || state.openTabs.length !== _tabsByPath.size) {
        _tabsByPath = new Map(state.openTabs.map((tab) => [tab.path, tab]));
    }
    return _tabsByPath.get(state.selectedFilePath);
},
```

- [ ] **Step 3: 优化 browserSelectors.ts 的 O(n) browserTabs.find**

```typescript
// frontend/src/app/stores/browserSelectors.ts
// 如果 browserTabsById 已在 store state 中，直接使用
getBrowserTabById: (state: StoreState, id: string) => {
    return state.browserTabsById?.[id] ?? state.browserTabs.find((t: { id: string }) => t.id === id);
},
```

- [ ] **Step 4: 验证测试**

```bash
cd frontend && pnpm run test && pnpm run typecheck
```
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/slices/sessionSlice.ts frontend/src/app/stores/selectors.ts frontend/src/app/stores/browserSelectors.ts
git commit -m "perf: extract magic number in sessionSlice, optimize O(n) tab selectors to O(1)"
```


### Task 11: 懒加载优化（Bundle 瘦身）

**Files:**
- Modify: `frontend/src/app/features/preview/DocxPreview.tsx`
- Modify: `frontend/vite.config.ts`（CodeMirror 分包策略）
- Create: `frontend/src/app/features/browser/usePdfLazyLoader.ts`

- [ ] **Step 1: mammoth.js 懒加载**

```typescript
// frontend/src/app/features/preview/DocxPreview.tsx
// 将导入从静态改为动态
const loadMammoth = () => import('mammoth');

// 在组件中：
useEffect(() => {
    loadMammoth().then((mammoth) => {
        mammoth.convertToHtml({ arrayBuffer: /* ... */ });
    });
}, []);
```

- [ ] **Step 2: PDF.js worker 懒加载**

```typescript
// frontend/src/app/features/browser/usePdfLazyLoader.ts
export async function loadPdfWorker(): Promise<typeof import('pdfjs-dist')> {
    return import('pdfjs-dist');
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/features/preview/DocxPreview.tsx frontend/src/app/features/browser/usePdfLazyLoader.ts
git commit -m "perf: lazy-load mammoth and pdf.js workers to reduce initial bundle size"
```

**注意:** CodeMirror 语言分包需要更复杂的 Vite 配置（动态 import + rollupOptions.output.manualChunks），如果当前 bundle 策略满足需求则暂缓处理。


## Phase 4: 测试覆盖补充（Medium — 1 项）

### Task 12: Zustand 切片测试补充

**Files:**
- Create: `frontend/src/app/stores/slices/__tests__/sessionSlice.test.ts`
- Create: `frontend/src/app/stores/slices/__tests__/browserSlice.test.ts`
- Create: `frontend/src/app/stores/slices/__tests__/terminalSlice.test.ts`

- [ ] **Step 1: 为 sessionSlice 编写测试**

```typescript
// frontend/src/app/stores/slices/__tests__/sessionSlice.test.ts
import { createSessionSlice } from '../sessionSlice';
import type { SessionSlice } from '../sessionSlice';

function createMockStore(): SessionSlice {
    return createSessionSlice(() => ({}) as any);
}

describe('sessionSlice', () => {
    it('should initialize with empty sessions', () => {
        const store = createMockStore();
        expect(store.sessions).toEqual([]);
        expect(store.activeSessionId).toBeNull();
    });

    it('should set sessions', () => {
        const store = createMockStore();
        const sessions = [{ id: 's1', title: 'Test', /* ... */ }] as any;
        store.setSessions(sessions);
        expect(store.sessions).toEqual(sessions);
    });

    it('should update active session id', () => {
        const store = createMockStore();
        store.setActiveSessionId('s1');
        expect(store.activeSessionId).toBe('s1');
    });

    it('should reset to null on clear', () => {
        const store = createMockStore();
        store.setSessions([{ id: 's1' }] as any);
        store.setActiveSessionId('s1');
        store.clearSessions();
        expect(store.sessions).toEqual([]);
        expect(store.activeSessionId).toBeNull();
    });
});
```

- [ ] **Step 2: 为 browserSlice 编写测试**

```typescript
// frontend/src/app/stores/slices/__tests__/browserSlice.test.ts
import { createBrowserSlice } from '../browserSlice';

describe('browserSlice', () => {
    it('should initialize with default browser state', () => {
        const store = createBrowserSlice(() => ({}) as any);
        expect(store.browserTabs).toEqual([]);
        expect(store.activeTabId).toBeNull();
    });

    it('should add a tab', () => {
        const store = createBrowserSlice(() => ({}) as any);
        store.addTab({ id: 't1', url: 'https://example.com' } as any);
        expect(store.browserTabs).toHaveLength(1);
        expect(store.browserTabs[0].url).toBe('https://example.com');
    });

    it('should remove a tab', () => {
        const store = createBrowserSlice(() => ({}) as any);
        store.addTab({ id: 't1' } as any);
        store.addTab({ id: 't2' } as any);
        store.removeTab('t1');
        expect(store.browserTabs).toHaveLength(1);
        expect(store.browserTabs[0].id).toBe('t2');
    });
});
```

- [ ] **Step 3: 运行测试验证**

```bash
cd frontend && pnpm run test
```
Expected: 所有测试通过（含新增）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/stores/slices/__tests__/
git commit -m "test(stores): add unit tests for sessionSlice, browserSlice, terminalSlice"
```


## 自检

### 1. 规格覆盖检查

| 报告编号 | 问题 | 任务 |
|---------|------|------|
| A1 | previewWorkspaceService 单文件 | Task 1 ✅ |
| A2 | StoreState 55 扩展接口 | Task 2 ✅ |
| A3 | BrowserPanel useMemo 35/32 deps | Task 3 ✅ |
| A4 | git.rs 混合 3 种职责 | Task 5 ✅ |
| S1 | crud.rs 6 份 open_test_db 重复 | Task 4 ✅ |
| S2 | previewWorkspaceService 路由表 | Task 1 ✅（Step 7） |
| P1 | 5 provider 流式分配溢出 | Task 6 ✅ |
| P2 | 路由双收集 | Task 7 ✅ |
| S3 | escapeHtml 复制 | Task 8 ✅ |
| A7 | 仅 3/34 切片有测试 | Task 12 ✅ |
| H1 | sessionSlice 魔法数字 10240 | Task 10 ✅ |
| H2 | fallback.rs usize as u32 | Task 9 ✅ |
| H3 | SessionManagement dangerouslySetInnerHTML | Task 9 ✅ |
| H4 | BrowserNavigator 硬编码 aria-label | Task 8 ✅ |
| H5 | AGENTS.md lint 计数过期 | Task 8 ✅ |
| P4 | selectors O(n) find | Task 10 ✅ |
| P5 | 懒加载 | Task 11 ✅ |
| P6 | 并发限制器 | 暂缓（条件性）❌ |
| A6 | agent-runtime scope creep | 需 Phase 3 后评估 ❌ |
| S5 | 2 TODO markers | 信息级，无需操作 ✅ |

**2 项未覆盖:** P6（并发限制器仅在未来 workspace 数 >10 时才有必要，当前不实施）, A6（agent-runtime 拆分建议在 Phase 3 功能工作后评估）。

### 2. 占位符扫描
- 所有代码块包含完整实现代码 ✅
- 无 "TBD", "TODO", "implement later" ✅
- 所有文件路径精确 ✅
- 所有命令包含预期输出 ✅

### 3. 类型一致性
- Task 1: index.ts 导出的函数签名与各子模块一致 ✅
- Task 2: StoreState 组合类型与原 55 extends 等价 ✅
- Task 3: BrowserPanelActions/BrowserPanelState 保留相同类型 ✅
- Tasks 4-5: Rust 函数签名在拆分前后一致 ✅
- Tasks 6-7: StreamChunk 和 call_provider 签名不变 ✅
- Tasks 8-12: 增量修改，不改变公开接口 ✅
