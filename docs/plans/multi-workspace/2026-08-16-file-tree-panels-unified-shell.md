# 文件树面板统一共享外壳实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提取共享「多工作区树外壳 `MultiWorkspaceTreeShell`」，让 Files 与 Changes 面板统一选中态、点击外部清除、刷新按钮等行为与设计。

**Architecture:** 将现有 `MultiWorkspaceContainer` 增强为 `MultiWorkspaceTreeShell`（内含点击外部清除逻辑 + 空状态）。Store 为 Changes 新增独立选中态字段与专用「刷新中」状态，Files 现有逻辑不动。面板差异通过 `renderContent` slot 保留。

**Tech Stack:** React 19 + TypeScript + Zustand（前端）；测试用 Vitest + jsdom。

## Global Constraints

- 禁止 `any`；使用精确类型。
- 面板同时挂载（CSS `hidden`），选中态必须按面板隔离。
- Files 现有 `fileTreeClicked*` 字段与 `useFileCreation` / 重命名逻辑不动。
- Store action 必须带标准化 JSDoc（`@reads`/`@writes`/`@see`）。
- i18n 文本一律使用 `t.*` key，禁止硬编码。
- 所有异步操作失败必须记录错误（禁止空 `catch {}`）。
- 测试材料须基于真实类型定义，覆盖常规与边界路径。

---

### Task 1：editorSlice 新增 Changes 选中态字段与 action

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/editorSlice.ts`
- Test: `ai-digital-life/frontend/src/app/stores/slices/editorSlice.test.ts`（若不存在则新建）

**Interfaces:**
- Produces:
  - 状态：`changesTreeClickedPath?: string`、`changesTreeClickedWorkspaceId?: string`、`changesTreeClickedKind?: 'directory' | 'file'`、`changesTreeClickedWorkspaceRoot?: string`
  - action：`setChangesTreeClickedNode(workspaceId, path, kind)`、`setChangesTreeClickedWorkspaceRoot(workspaceId)`、`clearChangesTreeClickedNode()`

- [ ] **Step 1: Write the failing test**

```typescript
// editorSlice.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createEditorSlice } from './editorSlice';

function setup() {
  const state: any = {};
  const slice = createEditorSlice(
    (partial: any) => Object.assign(state, partial),
    () => state,
  );
  return { slice, state };
}

describe('editorSlice changes tree clicked state', () => {
  beforeEach(() => {});

  it('setChangesTreeClickedNode 记录节点并清除根目录选中', () => {
    const { slice, state } = setup();
    slice.setChangesTreeClickedWorkspaceRoot('ws-1');
    slice.setChangesTreeClickedNode('ws-1', 'src/index.ts', 'file');
    expect(state.changesTreeClickedWorkspaceId).toBe('ws-1');
    expect(state.changesTreeClickedPath).toBe('src/index.ts');
    expect(state.changesTreeClickedKind).toBe('file');
    expect(state.changesTreeClickedWorkspaceRoot).toBeUndefined();
  });

  it('setChangesTreeClickedWorkspaceRoot 选中根目录并清除节点选中', () => {
    const { slice, state } = setup();
    slice.setChangesTreeClickedNode('ws-1', 'a.ts', 'file');
    slice.setChangesTreeClickedWorkspaceRoot('ws-1');
    expect(state.changesTreeClickedWorkspaceId).toBe('ws-1');
    expect(state.changesTreeClickedPath).toBeUndefined();
    expect(state.changesTreeClickedKind).toBeUndefined();
    expect(state.changesTreeClickedWorkspaceRoot).toBe('ws-1');
  });

  it('clearChangesTreeClickedNode 清除全部', () => {
    const { slice, state } = setup();
    slice.setChangesTreeClickedNode('ws-1', 'a.ts', 'file');
    slice.clearChangesTreeClickedNode();
    expect(state.changesTreeClickedPath).toBeUndefined();
    expect(state.changesTreeClickedWorkspaceId).toBeUndefined();
    expect(state.changesTreeClickedKind).toBeUndefined();
    expect(state.changesTreeClickedWorkspaceRoot).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir ai-digital-life/frontend run test -- editorSlice`
Expected: FAIL（`setChangesTreeClickedNode is not a function`）

- [ ] **Step 3: Implement the slice additions**

在 `EditorSlice` 接口（约 [editorSlice.ts:22-26](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/stores/slices/editorSlice.ts#L22-L27) 的 `fileTreeClicked*` 之后）、action 声明（约 :45-47）、实现（约 :101-127）以及 `clearEditorState`（约 :144-147）各追加对应 Changes 字段与 action。镜像 Files 实现，但不写 `fileNavigatorActiveWorkspaceId`：

```typescript
// 状态字段（接口）
changesTreeClickedPath?: string;
changesTreeClickedWorkspaceId?: string;
changesTreeClickedKind?: 'directory' | 'file';
changesTreeClickedWorkspaceRoot?: string;

// action 声明（接口）
setChangesTreeClickedNode: (workspaceId: string, path: string, kind: 'directory' | 'file') => void;
setChangesTreeClickedWorkspaceRoot: (workspaceId: string) => void;
clearChangesTreeClickedNode: () => void;

// 实现
setChangesTreeClickedNode: (workspaceId, path, kind) => {
  set({
    changesTreeClickedWorkspaceId: workspaceId,
    changesTreeClickedPath: path,
    changesTreeClickedKind: kind,
    changesTreeClickedWorkspaceRoot: undefined,
  });
},
setChangesTreeClickedWorkspaceRoot: (workspaceId) =>
  set({
    changesTreeClickedWorkspaceId: workspaceId,
    changesTreeClickedPath: undefined,
    changesTreeClickedKind: undefined,
    changesTreeClickedWorkspaceRoot: workspaceId,
  }),
clearChangesTreeClickedNode: () =>
  set({
    changesTreeClickedPath: undefined,
    changesTreeClickedWorkspaceId: undefined,
    changesTreeClickedKind: undefined,
    changesTreeClickedWorkspaceRoot: undefined,
  }),
```

同时在 `clearEditorState`（:130-149）追加同 4 个字段为 `undefined`。

- [ ] **Step 4: Run test to verify they pass**

Run: `pnpm --dir ai-digital-life/frontend run test -- editorSlice`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/editorSlice.ts ai-digital-life/frontend/src/app/stores/slices/editorSlice.test.ts
git commit -m "feat(stores): Changes 面板点击选中态独立字段与 action"
```

---

### Task 2：workspaceSlice 新增 Changes 专用「刷新中」状态

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/StoreState.ts`

**Interfaces:**
- Produces:
  - 状态：`changesTreeRefreshing: Record<string, boolean>`、`refreshingAllChanges: boolean`
  - setter：`setChangesTreeRefreshing(refreshing)`、`setRefreshingAllChanges(refreshing)`

- [ ] **Step 1: Add state fields**

在 [workspaceSlice.ts:86](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts#L86) 的 `workspaceChangesTreeErrors` 之后追加：

```typescript
changesTreeRefreshing: Record<string, boolean>;
refreshingAllChanges: boolean;
```

在接口 setter 区（:101 附近）追加：

```typescript
setChangesTreeRefreshing: (refreshing: Record<string, boolean>) => void;
setRefreshingAllChanges: (refreshing: boolean) => void;
```

在初始值（:125 附近）追加：

```typescript
changesTreeRefreshing: {},
refreshingAllChanges: false,
```

在实现（:146 附近）追加：

```typescript
setChangesTreeRefreshing: (refreshing) => set({ changesTreeRefreshing: refreshing }),
setRefreshingAllChanges: (refreshing) => set({ refreshingAllChanges: refreshing }),
```

在 `StoreState.ts` 中同步声明这 2 个状态与 2 个 setter（位置与 workspaceSlice 对应）。

- [ ] **Step 2: Type-check**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts ai-digital-life/frontend/src/app/stores/StoreState.ts
git commit -m "feat(stores): Changes 面板专用刷新中状态"
```

---

### Task 3：refreshGitSnapshot 支持 silent 并写「刷新中」状态

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/actions/gitSnapshotActions.ts`
- Test: `ai-digital-life/frontend/src/app/stores/actions/gitSnapshotActions.test.ts`（若不存在则新建）

**Interfaces:**
- Consumes: `changesTreeRefreshing`、`refreshingAllChanges`（Task 2）、`workspaceChangesTreeLoading`/`gitSnapshots`（已有）
- Produces: `refreshGitSnapshot(workspaceId, workspacePath, options?: { silent?: boolean })`

- [ ] **Step 1: Modify refreshGitSnapshot**

将 [gitSnapshotActions.ts:160-184](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/stores/actions/gitSnapshotActions.ts#L160-L184) 的 `refreshGitSnapshot` 改为支持 `options.silent`，非 silent 时写 `changesTreeRefreshing`（替代写 `workspaceChangesTreeLoading`），刷新保留已有树不闪 LoadingRow：

```typescript
/**
 * [refreshGitSnapshot - 刷新单个工作区的 Git 状态快照]
 * @param silent 为 true 时为静默刷新（仅更新数据），不触发该工作区刷新图标旋转
 * @reads gitSlice.workspaceChangesTreeLoading, gitSlice.workspaceChangesTreeErrors, gitSlice.changesTreeRefreshing
 * @writes gitSlice.gitSnapshots, gitSlice.workspaceChangesTreeLoading, gitSlice.workspaceChangesTreeErrors, gitSlice.changesTreeRefreshing
 * @see shared/ipc.ts → workspace.listGitStatusForWorkspace
 * @see mock-bridge.ts → workspace.listGitStatusForWorkspace
 * @see preview-bridge/index.ts → workspace.listGitStatusForWorkspace
 */
refreshGitSnapshot: async (
  workspaceId: string,
  workspacePath: string,
  options?: { silent?: boolean },
) => {
  const silent = options?.silent ?? false;
  if (!silent) {
    set({
      changesTreeRefreshing: { ...get().changesTreeRefreshing, [workspaceId]: true },
      workspaceChangesTreeErrors: {
        ...get().workspaceChangesTreeErrors,
        [workspaceId]: undefined,
      },
    });
  }
  const result = await window.digitalLife.workspace.listGitStatusForWorkspace(workspacePath);
  if (!silent) {
    set({
      changesTreeRefreshing: { ...get().changesTreeRefreshing, [workspaceId]: false },
    });
  }
  if (!result.ok) {
    if (!silent) {
      set({
        workspaceChangesTreeErrors: {
          ...get().workspaceChangesTreeErrors,
          [workspaceId]: result.error.message,
        },
      });
    }
    return;
  }
  set({
    gitSnapshots: { ...get().gitSnapshots, [workspaceId]: result.data },
  });
},
```

同步更新 `StoreState.ts` 中 `refreshGitSnapshot` 签名（:244）为 `(workspaceId, workspacePath, options?: { silent?: boolean }) => Promise<void>`。

- [ ] **Step 2: Write the failing test（mock 桥接）**

```typescript
// gitSnapshotActions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGitSnapshotActions } from './gitSnapshotActions';

function setup() {
  const state: any = {
    gitSnapshots: {},
    workspaceChangesTreeLoading: {},
    workspaceChangesTreeErrors: {},
    changesTreeRefreshing: {},
  };
  const get = () => state;
  const actions = createGitSnapshotActions(set as any, get);
  return { actions, state, set: set as any };
}

function set(partial: any) {
  Object.assign(this.state, typeof partial === 'function' ? partial(this.state) : partial);
}

describe('refreshGitSnapshot', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        listGitStatusForWorkspace: vi.fn(),
      },
    });
  });

  it('非 silent 时写 changesTreeRefreshing 而非 loading', async () => {
    const { actions, state, set } = setup();
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [] },
    });
    const p = actions.refreshGitSnapshot('ws-1', '/p');
    expect(state.changesTreeRefreshing['ws-1']).toBe(true);
    await p;
    expect(state.changesTreeRefreshing['ws-1']).toBe(false);
    expect(state.gitSnapshots['ws-1']).toEqual({ staged: [], unstaged: [], untracked: [] });
  });

  it('silent 时不写 changesTreeRefreshing', async () => {
    const { actions, state } = setup();
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [] },
    });
    await actions.refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(state.changesTreeRefreshing['ws-1']).toBe(false);
  });
});
```

> 注：`createGitSnapshotActions` 的导出名需按实际文件确认（若为 `createGitSnapshotActions`）。若测试无法直接调用切片工厂，则改为走 `useAppStore` 集成测试（见 Task 4 Step 2 说明）。

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --dir ai-digital-life/frontend run test -- gitSnapshotActions`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/actions/gitSnapshotActions.ts ai-digital-life/frontend/src/app/stores/StoreState.ts ai-digital-life/frontend/src/app/stores/actions/gitSnapshotActions.test.ts
git commit -m "feat(stores): refreshGitSnapshot 支持 silent 并写刷新中状态"
```

---

### Task 4：refreshAllChanges 只刷已展开工作区并管理 refreshingAllChanges

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelStateUtils.ts`
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesActions.ts`
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx`
- Test: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelStateUtils.test.ts`（若不存在则新建）

**Interfaces:**
- Consumes: `refreshGitSnapshot(id, path, {silent})`（Task 3）、`workspaceChangesExpanded`、`setRefreshingAllChanges`（Task 2）
- Produces: `refreshAllChanges(visibleWorkspaces, expandedIds, setRefreshingAll, refreshGitSnapshot)`（async）

- [ ] **Step 1: Modify refreshOneWorkspace / refreshAllChanges**

修改 [useChangesPanelStateUtils.ts:373-391](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelStateUtils.ts#L373-L391)：

```typescript
export function refreshOneWorkspace(
  workspaceId: string,
  recentWorkspaces: RecentWorkspaceEntry[],
  refreshGitSnapshot: (id: string, path: string, options?: { silent?: boolean }) => void,
): void {
  const ws = recentWorkspaces.find((w) => w.id === workspaceId);
  if (ws) {
    refreshGitSnapshot(workspaceId, ws.path);
  }
}

export async function refreshAllChanges(
  visibleWorkspaces: RecentWorkspaceEntry[],
  expandedWorkspaceIds: ReadonlySet<string>,
  setRefreshingAll: (refreshing: boolean) => void,
  refreshGitSnapshot: (id: string, path: string, options?: { silent?: boolean }) => void,
): Promise<void> {
  const targets = visibleWorkspaces.filter((ws) => expandedWorkspaceIds.has(ws.id));
  if (targets.length === 0) {
    return;
  }
  setRefreshingAll(true);
  await Promise.allSettled(
    targets.map((ws) => refreshGitSnapshot(ws.id, ws.path, { silent: true })),
  );
  setRefreshingAll(false);
}
```

- [ ] **Step 2: Update callers**

在 `useChangesActions.ts` 的 `onRefreshAll`（:168-172）改为 async 并传入 expanded 集合与 setter：

```typescript
const onRefreshAll = useCallback(() => {
  const s = useAppStore.getState();
  return refreshAllChanges(
    visibleWorkspaces,
    new Set(Object.keys(s.workspaceChangesExpanded).filter((id) => s.workspaceChangesExpanded[id])),
    s.setRefreshingAllChanges,
    (id, p, opts) => s.refreshGitSnapshot(id, p, opts),
  );
}, [visibleWorkspaces]);
```

同时更新 `refreshOneWorkspace` 调用处（:152-159）的 `refreshGitSnapshot` 回调签名，使其透传 `{silent}`（刷新单个工作区时不传 silent，触发该工作区刷新旋转）。

在 `useChangesPanelState.tsx` 中，将 `onRefreshAll` 从 `handleRefreshAllChanges: onRefreshAll` 改为异步调用（保持 wiring 不变，仅确保 `onRefreshAll` 返回 Promise 被正确处理）。

- [ ] **Step 3: Write the failing test**

```typescript
// useChangesPanelStateUtils.test.ts
import { describe, it, expect, vi } from 'vitest';
import { refreshAllChanges } from './useChangesPanelStateUtils';

describe('refreshAllChanges', () => {
  it('只刷新已展开的工作区且使用 silent', async () => {
    const refresh = vi.fn(async () => {});
    const setRefreshingAll = vi.fn();
    const ws = [
      { id: 'ws-1', path: '/a' },
      { id: 'ws-2', path: '/b' },
      { id: 'ws-3', path: '/c' },
    ] as any[];
    await refreshAllChanges(ws, new Set(['ws-1', 'ws-3']), setRefreshingAll, refresh);
    expect(refresh).toHaveBeenCalledWith('ws-1', '/a', { silent: true });
    expect(refresh).toHaveBeenCalledWith('ws-3', '/c', { silent: true });
    expect(refresh).not.toHaveBeenCalledWith('ws-2', '/b', { silent: true });
    expect(setRefreshingAll).toHaveBeenNthCalledWith(1, true);
    expect(setRefreshingAll).toHaveBeenLastCalledWith(false);
  });

  it('无可刷新工作区时不调用 setRefreshingAll', async () => {
    const refresh = vi.fn();
    const setRefreshingAll = vi.fn();
    await refreshAllChanges([{ id: 'ws-1', path: '/a' }] as any[], new Set(), setRefreshingAll, refresh);
    expect(refresh).not.toHaveBeenCalled();
    expect(setRefreshingAll).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir ai-digital-life/frontend run test -- useChangesPanelStateUtils`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelStateUtils.ts ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesActions.ts ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx
git commit -m "feat(changes): 刷新全部只刷已展开工作区并管理刷新中状态"
```

---

### Task 5：新建共享组件 MultiWorkspaceTreeShell

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/multi-workspace/MultiWorkspaceTreeShell.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/multi-workspace/index.ts`（如有 barrel 则导出）

**Interfaces:**
- Consumes: `onClearSelection`（面板传入的稳定清除回调）
- Produces:
  - `MultiWorkspaceTreeShellProps`: `{ visibleWorkspaces; expandedState; emptyText; onToggleExpand; onClearSelection; renderContent }`
  - 组件：`MultiWorkspaceTreeShell`

- [ ] **Step 1: Create the component**

```typescript
import React, { useEffect } from 'react';
import type { RecentWorkspaceEntry } from '@shared/ipc';

export interface MultiWorkspaceTreeShellProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
  expandedState: Record<string, boolean>;
  emptyText: string;
  onToggleExpand: (workspaceId: string) => void;
  onClearSelection: () => void;
  renderContent: (workspace: RecentWorkspaceEntry, isExpanded: boolean) => React.ReactNode;
}

export const MultiWorkspaceTreeShell = React.memo(function MultiWorkspaceTreeShell({
  visibleWorkspaces,
  expandedState,
  emptyText,
  onToggleExpand,
  onClearSelection,
  renderContent,
}: MultiWorkspaceTreeShellProps) {
  // 点击外部清除选中态：保留交互元素（对话框/新建按钮/树行/工作区头/右键菜单），
  // 点击其余区域（含容器空白）清除选中态，与主流编辑器一致。
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          [
            '.adl-prompt-modal', // 新建/重命名对话框
            '.adl-confirm-overlay', // 删除确认对话框
            '.adl-tool-navigator__create-action', // 新建按钮
            '.adl-filetree__row', // 树节点行
            '.adl-multitree-entry__header', // 工作区头
            '.adl-sidebar-menu', // 右键菜单
          ].join(', '),
        )
      ) {
        return;
      }
      onClearSelection();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClearSelection]);

  if (visibleWorkspaces.length === 0) {
    return (
      <div className="adl-multitree">
        <div className="adl-multitree__empty">
          <p className="adl-empty-hint">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="adl-multitree">
      {visibleWorkspaces.map((ws) => (
        <React.Fragment key={ws.id}>
          {renderContent(ws, expandedState[ws.id] ?? false)}
        </React.Fragment>
      ))}
    </div>
  );
});
```

> 注意：调用方必须用 `useCallback` 传入稳定 `onClearSelection`，避免 effect 反复重挂。

- [ ] **Step 2: Type-check**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/multi-workspace/MultiWorkspaceTreeShell.tsx
git commit -m "feat(multi-workspace): 新增共享多工作区树外壳组件"
```

---

### Task 6：Files 改用共享外壳，移除重复点击清除逻辑

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx`

**Interfaces:**
- Consumes: `MultiWorkspaceTreeShell`（Task 5）
- Produces: 无新接口（行为保持与现状一致）

- [ ] **Step 1: Refactor MultiWorkspaceFileTree**

- 删除 [MultiWorkspaceFileTree.tsx:73-100](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx#L73-L100) 的 `useEffect` 点击清除逻辑及对应 `useEffect`/`React` 导入（若不再使用）。
- 用 `MultiWorkspaceTreeShell` 替换末尾的 `MultiWorkspaceContainer`（:186-193）与空状态块（:176-184）：

```typescript
const onClearSelection = useCallback(() => {
  useAppStore.getState().clearFileTreeClickedNode();
}, []);

return (
  <MultiWorkspaceTreeShell
    visibleWorkspaces={workspaces}
    expandedState={expandedStates}
    emptyText={t.workspaceEmpty as string}
    onToggleExpand={onToggleExpand}
    onClearSelection={onClearSelection}
    renderContent={renderContent}
  />
);
```

- 更新 import：`MultiWorkspaceContainer` → `MultiWorkspaceTreeShell`；确认 `useCallback` 已导入。

- [ ] **Step 2: Type-check + run Files tree tests**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Run: `pnpm --dir ai-digital-life/frontend run test -- workspace-file-tree`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx
git commit -m "refactor(files): 改用共享多工作区树外壳"
```

---

### Task 7：WorkspaceChangesEntry 对齐选中态与刷新旋转

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/workspace-changes-tree/WorkspaceChangesActions.ts`

**Interfaces:**
- Consumes: `changesTreeRefreshing`（Task 2）、`setChangesTreeClickedNode`/`setChangesTreeClickedWorkspaceRoot`（Task 1）
- Produces:
  - `WorkspaceChangesEntryProps` 新增：`clickedPath?: string`、`onNodeClicked: (path, kind) => void`、`isRefreshing: boolean`、`onWorkspaceRootClick: () => void`
  - `UseWorkspaceChangesActionsParams` 新增：`onWorkspaceRootClick`

- [ ] **Step 1: Update useWorkspaceChangesActions**

在 `WorkspaceChangesActions.ts` 的参数与返回值中新增 `onWorkspaceRootClick`，并在 `handleNameClick` 中调用：

```typescript
// 参数接口新增
onWorkspaceRootClick?: () => void;

// handleNameClick 改为
const handleNameClick = useCallback(() => {
  onToggleExpand();
  onWorkspaceRootClick?.();
}, [onToggleExpand, onWorkspaceRootClick]);
```

- [ ] **Step 2: Update WorkspaceChangesEntry**

- 新增 props：`clickedPath`、`onNodeClicked`、`isRefreshing`、`onWorkspaceRootClick`。
- 从 `useWorkspaceChangesActions` 接收 `onWorkspaceRootClick`。
- 刷新图标旋转（:158）由 `isLoading` 改为 `isRefreshing`：

```typescript
className={isRefreshing ? 'adl-spin' : undefined}
```

- `FileTree`（:198-213）增加选中态与点击回调，镜像 Files：

```typescript
<FileTree
  nodes={treeNodes}
  selectedFilePath={effectiveSelectedPath}
  extraSelectedPath={clickedPath}
  activePathIsWeak
  expandedPaths={expandedPaths}
  dirtyPaths={dirtyPaths}
  externalChangePath={externalChangePath}
  onToggle={(path) => {
    onNodeClicked(path, 'directory');
    onToggleFileTreePath(path);
  }}
  onOpenFile={(path) => {
    onNodeClicked(path, 'file');
    onOpenChangePreview(workspace.path, path);
  }}
  getContextMenuItems={wrappedGetContextMenuItems}
  contextMenuPersistRef={contextMenuPersistRef}
  clearMenuHighlightRef={clearMenuHighlightRef}
  expandLabel={expandLabel}
  collapseLabel={collapseLabel}
  renderMeta={renderMeta}
  renderCount={renderCount}
/>
```

- [ ] **Step 3: Type-check**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx ai-digital-life/frontend/src/app/features/workspace-changes-tree/WorkspaceChangesActions.ts
git commit -m "feat(changes): 工作区条目对齐选中态与刷新旋转"
```

---

### Task 8：MultiWorkspaceChangesTree 接入共享外壳与选中态

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/workspace-changes-tree/MultiWorkspaceChangesTree.tsx`

**Interfaces:**
- Consumes: `MultiWorkspaceTreeShell`（Task 5）、`WorkspaceChangesEntry` 新 props（Task 7）、`changesTreeClicked*`（Task 1）
- Produces:
  - `MultiWorkspaceChangesTreeProps` 新增：`clickedPath`、`clickedWorkspaceId`、`onNodeClicked`、`onWorkspaceRootClick`、`refreshingStates`、`onClearSelection`

- [ ] **Step 1: Update props & renderContent**

新增 props：`clickedPath?: string`、`clickedWorkspaceId?: string`、`onNodeClicked: (workspaceId, path, kind) => void`、`onWorkspaceRootClick: (workspaceId: string) => void`、`refreshingStates?: Record<string, boolean>`、`onClearSelection: () => void`。

在 `renderContent`（:59-116）中向 `WorkspaceChangesEntry` 传递：

```typescript
<WorkspaceChangesEntry
  workspace={workspace}
  isCurrent={workspace.id === activeWorkspaceId}
  isExpanded={isExpanded}
  treeNodes={treeData[workspace.id]}
  isLoading={loadingStates[workspace.id] ?? false}
  isRefreshing={refreshingStates?.[workspace.id] ?? false}
  error={errorStates[workspace.id]}
  selectedChangePreviewPath={selectedChangePreviewPath}
  selectedChangePreviewWorkspaceId={selectedChangePreviewWorkspaceId}
  clickedPath={clickedWorkspaceId === workspace.id ? clickedPath : undefined}
  expandedPaths={expandedPaths[workspace.id] ?? {}}
  dirtyPaths={dirtyPaths}
  externalChangePath={externalChangePath}
  onToggleExpand={() => onToggleExpand(workspace.id)}
  onHideFromRightPanels={onHideFromRightPanels}
  changeCount={changeCounts[workspace.id] ?? 0}
  onRefreshTree={() => onRefreshOne(workspace.id)}
  onToggleFileTreePath={(path) => onToggleFileTreePath(workspace.id, path)}
  onOpenChangePreview={onOpenChangePreview}
  onNodeClicked={(path, kind) => onNodeClicked(workspace.id, path, kind)}
  onWorkspaceRootClick={() => onWorkspaceRootClick(workspace.id)}
  getContextMenuItems={getContextMenuItems}
  contextMenuPersistRef={contextMenuPersistRef}
  clearMenuHighlightRef={clearMenuHighlightRef}
  expandLabel={t.expandDetails as string}
  collapseLabel={t.collapseDetails as string}
  t={t}
  renderMeta={renderMeta}
  renderCount={renderCount}
/>
```

同步更新依赖数组。

- [ ] **Step 2: 用共享外壳替换空状态与容器**

用 `MultiWorkspaceTreeShell` 替换 `MultiWorkspaceContainer`（:128-135）与空状态块（:118-126）：

```typescript
return (
  <MultiWorkspaceTreeShell
    visibleWorkspaces={workspaces}
    expandedState={expandedStates}
    emptyText={t.changesEmpty as string}
    onToggleExpand={onToggleExpand}
    onClearSelection={onClearSelection}
    renderContent={renderContent}
  />
);
```

更新 import：`MultiWorkspaceContainer` → `MultiWorkspaceTreeShell`。

- [ ] **Step 3: Type-check**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/workspace-changes-tree/MultiWorkspaceChangesTree.tsx
git commit -m "feat(changes): 多工作区树接入共享外壳与选中态"
```

---

### Task 9：Changes 面板/树面板接线选中态与刷新状态

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesTreePanel.tsx`
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx`
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/useChangesPanelState.tsx`（如选中态需在此选取）

**Interfaces:**
- Consumes: `changesTreeClicked*`、`changesTreeRefreshing`、`refreshingAllChanges`（Task 1/2）、`clearChangesTreeClickedNode`（Task 1）
- Produces: 无新接口（接线）

- [ ] **Step 1: ChangesTreePanel 透传新 props**

在 `ChangesTreePanel` 的 `TreeDataProps`/`TreeCallbacks` 增加：`clickedPath`、`clickedWorkspaceId`、`onNodeClicked`、`onClearSelection`、`refreshingStates`、`refreshingAll`。在 `MultiWorkspaceChangesTree`（:186-213）透传：

```typescript
<MultiWorkspaceChangesTree
  workspaces={visibleWorkspaces}
  activeWorkspaceId={activeWorkspaceId}
  expandedStates={workspaceChangesExpanded}
  treeData={changesTreeData as Record<string, WorkspaceTreeNode[]>}
  loadingStates={workspaceChangesTreeLoading}
  refreshingStates={changesTreeRefreshing}
  errorStates={workspaceChangesTreeErrors}
  selectedChangePreviewPath={navigatorSelectedPath}
  selectedChangePreviewWorkspaceId={selectedChangePreviewWorkspaceId}
  clickedPath={clickedPath}
  clickedWorkspaceId={clickedWorkspaceId}
  expandedPaths={expandedPathsByWs}
  dirtyPaths={dirtyPathsSet}
  externalChangePath={externalChangePath}
  onToggleExpand={onToggleExpand}
  onRefreshOne={onRefreshOne}
  changeCounts={changeCounts}
  onHideFromRightPanels={onHideFromRightPanels}
  onToggleFileTreePath={onToggleFileTreePath}
  onOpenChangePreview={onOpenChangePreview}
  onNodeClicked={onNodeClicked}
  onClearSelection={onClearSelection}
  getContextMenuItems={...}
  contextMenuPersistRef={contextMenuPersistRef}
  clearMenuHighlightRef={clearMenuHighlightRef}
  renderMeta={renderMeta}
  renderCount={renderCount}
/>
```

将工具栏 `isRefreshingAll`（:152）由 `anyChangesTreeLoading` 改为 `refreshingAll`。

> 若 `changesTreeRefreshing`/`refreshingAll` 在 ChangesTreePanel 未直接可得，则在 `ChangesPanel.tsx` 顶层 `useChangesPanelState` 返回值中选取并透传。

- [ ] **Step 2: ChangesPanel 接线**

在 [ChangesPanel.tsx:98](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx#L98) 的 `useChangesPanelState(props)` 返回值中，新增选取：
- `changesTreeClickedPath`、`changesTreeClickedWorkspaceId`、`changesTreeRefreshing`、`refreshingAllChanges`（来自 store）
- `handleChangesNodeClicked`：`(wid, path, kind) => useAppStore.getState().setChangesTreeClickedNode(wid, path, kind)`
- `handleChangesWorkspaceRootClick`：`(wid) => useAppStore.getState().setChangesTreeClickedWorkspaceRoot(wid)`
- `handleChangesClearSelection`：`useCallback(() => useAppStore.getState().clearChangesTreeClickedNode(), [])`

并在 `ChangesTreePanel`（:119-168）传入 `clickedPath`、`clickedWorkspaceId`、`onNodeClicked`、`onClearSelection`、`refreshingStates`、`refreshingAll`。

- [ ] **Step 3: Type-check + run Changes tests**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Run: `pnpm --dir ai-digital-life/frontend run test -- ChangesTreePanel`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesTreePanel.tsx ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx ai-digital-life/frontend/src/app/regions/right-panel/panels/useChangesPanelState.tsx
git commit -m "feat(changes): 面板接线选中态与刷新状态"
```

---

### Task 10：全量验收（ESLint / Prettier / 类型 / 测试）

**Files:**
- 无新增（对已改文件统一执行格式与校验）

- [ ] **Step 1: Lint + Format**

Run: `pnpm --dir ai-digital-life/frontend run lint:fix`
Run: `pnpm --dir ai-digital-life/frontend run format`

- [ ] **Step 2: Type-check**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 3: Run full frontend test suite**

Run: `pnpm --dir ai-digital-life/frontend run test`
Expected: PASS（若存在 Files/Changes 相关快照或集成测试，确认无回归）

- [ ] **Step 4: Commit**

```bash
git add -A ai-digital-life/frontend
git commit -m "chore(frontend): 统一文件树面板验收修复"
```