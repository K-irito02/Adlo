# 书签错误提示友好化 + 标签标题隔离 + 悬停语义化路径 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 浏览器书签三项收尾优化——(1) 新建/编辑书签因真重复被拦截时弹出含**语义化路径**的友好 toast；(2) 书签自定义标题不再泄漏到已打开/将打开的标签（标签始终显示网站真实标题）；(3) 目录/书签悬停的 `title` 从内部标识（`folder:xxx`）改为语义化路径。

**Architecture:** 纯前端。新增两个纯函数 `buildFolderPathLabel`/`buildWorkspacePathLabel` 构建语义化路径（沿 `parentId` 链 + 工作区名）；`browserCreateBookmarkEntry`/`browserUpdateSavedBookmark`/`browserBookmarkTab` 返回 `{ok, pathLabel}`（拦截时带路径）；`useBrowserDialogs`/`useBrowserTagActions` 移除向 live tab 写自定义标题的调用点；`TreeNodeRow`/`FileTree` 新增可选 `nodeTitle`/`getNodeTitle` prop（默认回退 `nodePath`），`BrowserEntrySubEntries` 提供语义化 title。

**Tech Stack:** React 19 + Zustand + TypeScript + Vitest + React Testing Library。

## Global Constraints

- i18n parity：zh-CN/en-US 的 `browser.ts` 必须同步新增 `browserBookmarkDuplicateWithPath`（`keys.test.ts` 自动校验顶级 key 集合一致）。
- 质量门禁：`npx tsc --noEmit`（frontend 目录）0 错误、`npx eslint .` 0 errors、`npx vitest run` 通过。
- 去重铁律（用户确认）：URL 是核心身份。URL 不同、仅标题相同 → 始终允许（不构成碰撞）。URL 相同 + 同路径 + 标题相同 → 真重复，拦截。适用于所有新增、更新标题、编辑路径。
- 标签标题隔离（用户确认）：已打开/将打开的标签始终显示网站真实标题；书签自定义标题只在书签树/列表显示。
- 悬停 title（用户确认）：目录显示语义化路径（如"工作区A → 工具 → 子文件夹"）；书签叶子显示"路径 / 书签名"（如"工具 → 子文件夹 / 百度"），路径无法解析时退化为仅名称。
- 星标收藏按钮（`browserToggleBookmark`）不改（url 开关语义）。
- 不做的事（YAGNI）：不改其他文件树（git 树/工作区文件树）的悬停 title；不新增 toast 组件/富文本；不动 `browserToggleBookmark` 去重；不动书签树节点标题显示。
- 禁止向后兼容重导出；`browserOpenTab`/`browserNavigateActiveTab` 的调用契约（url, title, workspaceId, folderId）保持兼容（仅调用方不再传自定义 title）。
- TDD：store action / dialog handler 先写失败测试。
- 工作目录：前端命令在 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend` 下执行（`npx vitest run <file>` 等）。

---

### Task 1: 语义化路径纯函数

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserFoldersUtils.ts`
- Create: `ai-digital-life/frontend/src/app/stores/slices/__tests__/browserFoldersUtils.test.ts`

**Interfaces:**
- Consumes: `TabFolderState`（`browserFoldersTypes.ts`，含 `id`/`name`/`parentId`/`parentType`）、`RecentWorkspaceEntry`（`workspaceSlice.ts`，含 `id`/`name`/`path`）。
- Produces:
  - `buildFolderPathLabel(folderId: string, folders: TabFolderState[], workspaces: RecentWorkspaceEntry[]): string`
  - `buildWorkspacePathLabel(wsId: string, workspaces: RecentWorkspaceEntry[]): string`

- [ ] **Step 1: 写失败测试**

创建 `browserFoldersUtils.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  buildFolderPathLabel,
  buildWorkspacePathLabel,
} from '../browserFoldersUtils';
import type { TabFolderState } from '../browserFoldersTypes';

const folders: TabFolderState[] = [
  { id: 'root', name: '工具', createdAt: 0 },
  { id: 'sub', name: '子文件夹', createdAt: 0, parentId: 'root', parentType: 'folder' },
  { id: 'deep', name: '三层', createdAt: 0, parentId: 'sub', parentType: 'folder' },
  { id: 'wsRoot', name: '工作区根目录', createdAt: 0, parentId: 'ws1', parentType: 'workspace' },
  { id: 'wsSub', name: '工作区子目录', createdAt: 0, parentId: 'wsRoot', parentType: 'folder' },
];

const workspaces = [
  { id: 'ws1', name: '工作区A', path: 'E:/ws-a', isPinned: false },
];

describe('buildFolderPathLabel', () => {
  it('顶层文件夹只返回文件夹名', () => {
    expect(buildFolderPathLabel('root', folders, workspaces)).toBe('工具');
  });

  it('嵌套文件夹返回 "根 → 子"', () => {
    expect(buildFolderPathLabel('sub', folders, workspaces)).toBe('工具 → 子文件夹');
    expect(buildFolderPathLabel('deep', folders, workspaces)).toBe('工具 → 子文件夹 → 三层');
  });

  it('挂在工作区下的文件夹最前面加工作区名', () => {
    expect(buildFolderPathLabel('wsRoot', folders, workspaces)).toBe('工作区A → 工作区根目录');
    expect(buildFolderPathLabel('wsSub', folders, workspaces)).toBe(
      '工作区A → 工作区根目录 → 工作区子目录',
    );
  });

  it('未知 folderId 返回空字符串', () => {
    expect(buildFolderPathLabel('nope', folders, workspaces)).toBe('');
  });

  it('循环 parentId 保护：超出步数截断不死循环', () => {
    const cycleA: TabFolderState = { id: 'a', name: 'A', createdAt: 0, parentId: 'b' };
    const cycleB: TabFolderState = { id: 'b', name: 'B', createdAt: 0, parentId: 'a' };
    const label = buildFolderPathLabel('a', [cycleA, cycleB], []);
    // 应在 N 步内停止，返回非空字符串且不含死循环
    expect(label).toContain('A');
    expect(label.length).toBeLessThan(200);
  });
});

describe('buildWorkspacePathLabel', () => {
  it('返回工作区名', () => {
    expect(buildWorkspacePathLabel('ws1', workspaces)).toBe('工作区A');
  });
  it('未知 wsId 返回空字符串', () => {
    expect(buildWorkspacePathLabel('nope', workspaces)).toBe('');
  });
  it('工作区无 name 时用 path 回退', () => {
    expect(buildWorkspacePathLabel('ws2', [{ id: 'ws2', name: '', path: 'E:/ws-b', isPinned: false }])).toBe('E:/ws-b');
  });
});
```

> 注意：`RecentWorkspaceEntry` 的实际字段以 `workspaceSlice.ts` 为准（含 `id`/`name`/`path`/`isPinned` 等）；若字段名不同，以实际类型为准调整 mock。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/app/stores/slices/__tests__/browserFoldersUtils.test.ts`（在 `ai-digital-life/frontend` 目录）
Expected: FAIL（`buildFolderPathLabel is not a function`）。

- [ ] **Step 3: 实现**

在 `browserFoldersUtils.ts` 末尾新增：

```ts
const MAX_PATH_STEPS = 20;

export function buildWorkspacePathLabel(
  wsId: string,
  workspaces: RecentWorkspaceEntry[],
): string {
  const ws = workspaces.find((w) => w.id === wsId);
  if (!ws) {
    return '';
  }
  return (ws.name?.trim() || ws.path?.trim() || '').trim();
}

export function buildFolderPathLabel(
  folderId: string,
  folders: TabFolderState[],
  workspaces: RecentWorkspaceEntry[],
): string {
  const parts: string[] = [];
  let currentId = folderId;
  let steps = 0;
  let visited = new Set<string>();
  while (currentId && steps < MAX_PATH_STEPS && !visited.has(currentId)) {
    const folder = findFolderById(folders, currentId);
    if (!folder) {
      break;
    }
    visited.add(currentId);
    parts.unshift(folder.name?.trim() || '');
    if (folder.parentType === 'workspace' && folder.parentId) {
      const wsLabel = buildWorkspacePathLabel(folder.parentId, workspaces);
      if (wsLabel) {
        parts.unshift(wsLabel);
      }
      break;
    }
    currentId = folder.parentId ?? '';
    steps += 1;
  }
  return parts.filter(Boolean).join(' → ');
}
```

> `findFolderById` 已在文件顶部定义（第 32 行）。需在文件顶部 import `RecentWorkspaceEntry`（`import type { RecentWorkspaceEntry } from './workspaceSlice'` 或实际类型来源）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/app/stores/slices/__tests__/browserFoldersUtils.test.ts`
Expected: PASS。

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/browserFoldersUtils.ts ai-digital-life/frontend/src/app/stores/slices/__tests__/browserFoldersUtils.test.ts
git commit -m "feat(frontend): add semantic folder/workspace path label helpers"
```

---

### Task 2: store 拦截返回 {ok, pathLabel} — browserCreateBookmarkEntry + 只读预检

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `buildFolderPathLabel`/`buildWorkspacePathLabel`。
- Produces:
  - `browserCreateBookmarkEntry(input: { url; title; workspaceId?; folderId? }): { ok: boolean; pathLabel?: string }`
  - `checkBookmarkCollision(url: string, title: string, opts: { workspaceId?: string; folderId?: string }, state: BrowserBookmarkHelpersState, workspaces: RecentWorkspaceEntry[]): { ok: boolean; pathLabel?: string }`（只读纯函数，供 UI 预检复用）

- [ ] **Step 1: 写失败测试**

在 `browserBookmarkSlice.test.ts` 追加：

```ts
it('browserCreateBookmarkEntry returns {ok:false, pathLabel} on folder dedup collision', () => {
  // 预置 folder f1 已含 {tabId:'a', url:'https://e.com', title:'Title A'}
  const { get } = createMockStore();
  const slice = get() as unknown as BrowserBookmarkSlice;
  (get() as any).browserTabFolders = [
    { id: 'f1', name: '工具', createdAt: 0, tabs: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }] },
  ];
  (get() as any).recentWorkspaces = [];
  const result = slice.browserCreateBookmarkEntry({
    url: 'https://e.com',
    title: 'Title A',
    folderId: 'f1',
  });
  expect(result).toEqual({ ok: false, pathLabel: '工具' });
});

it('browserCreateBookmarkEntry returns {ok:true} when no collision', () => {
  const { get } = createMockStore();
  const slice = get() as unknown as BrowserBookmarkSlice;
  const result = slice.browserCreateBookmarkEntry({
    url: 'https://e.com',
    title: 'Title A',
  });
  expect(result).toEqual({ ok: true });
});
```

> 注：现有测试的 `createMockStore` 返回 `{ get }`；需按需扩展 mock state 字段（`browserTabFolders`/`recentWorkspaces`）。若 `BrowserBookmarkSlice` 接口类型不含 `recentWorkspaces`，用 `(get() as any)` 访问。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
Expected: FAIL（返回值是 `undefined`，非 `{ok,...}`）。

- [ ] **Step 3: 实现**

在 `browserBookmarkSlice.ts` 新增只读预检纯函数（模块级）：

```ts
export interface BookmarkCollisionCheck {
  ok: boolean;
  pathLabel?: string;
}

export function checkBookmarkCollision(
  url: string,
  title: string,
  opts: { workspaceId?: string; folderId?: string },
  state: BrowserBookmarkHelpersState,
  workspaces: RecentWorkspaceEntry[],
): BookmarkCollisionCheck {
  if (opts.folderId) {
    const folder = state.browserTabFolders.find((f) => f.id === opts.folderId);
    const collides = folder?.tabs?.some((item) => item.url === url && item.title === title);
    if (collides) {
      return {
        ok: false,
        pathLabel: buildFolderPathLabel(opts.folderId, state.browserTabFolders, workspaces),
      };
    }
  }
  if (opts.workspaceId) {
    const entries = state.browserWorkspaceBookmarks[opts.workspaceId] || [];
    if (entries.some((entry) => entry.url === url && entry.title === title)) {
      return {
        ok: false,
        pathLabel: buildWorkspacePathLabel(opts.workspaceId, workspaces),
      };
    }
  }
  return { ok: true };
}
```

`browserCreateBookmarkEntry` 改为：进入 `set` 前先预检；冲突则 return `{ ok:false, pathLabel }`（不执行 `set`）；不冲突则照常 `set` 并 return `{ ok: true }`。接口签名改为返回 `BookmarkCollisionCheck`：

```ts
browserCreateBookmarkEntry: (input: {
  url: string;
  title: string;
  workspaceId?: string;
  folderId?: string;
}) => BookmarkCollisionCheck;
```

> 保持 `set` 内的 folder/workspace 去重逻辑与 `foldersChanged`/`wsChanged`/tabIdUrlMap 写入不变（Task 3/8 已修复）。预检与 `set` 内判断应一致（同一 (url,title) 条件）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
Expected: PASS（新旧用例）。

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts
git commit -m "feat(frontend): return ok+pathLabel from browserCreateBookmarkEntry"
```

---

### Task 3: store 拦截返回 {ok, pathLabel} — browserUpdateSavedBookmark

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`

**Interfaces:**
- Consumes: Task 1 的路径工具、Task 2 的 `checkBookmarkCollision`。
- Produces: `browserUpdateSavedBookmark(tabId, { url; title }): { ok: boolean; pathLabel?: string }`（拦截时 pathLabel 为冲突位置路径）。

- [ ] **Step 1: 写失败测试**

在 `browserBookmarkSlice.test.ts` 追加：

```ts
it('browserUpdateSavedBookmark returns {ok:false, pathLabel} on collision', () => {
  const { get } = createMockStore();
  const slice = get() as unknown as BrowserBookmarkSlice;
  (get() as any).browserTabFolders = [
    {
      id: 'f1',
      name: '工具',
      createdAt: 0,
      tabs: [
        { tabId: 'a', url: 'https://e.com', title: 'Title A' },
        { tabId: 'b', url: 'https://e.com', title: 'Title B' },
      ],
    },
  ];
  (get() as any).recentWorkspaces = [];
  // 把 tab a 的标题改成 Title B → 与 tab b 碰撞
  const result = slice.browserUpdateSavedBookmark('a', { url: 'https://e.com', title: 'Title B' });
  expect(result).toEqual({ ok: false, pathLabel: '工具' });
  // 状态不变
  expect((get() as any).browserTabFolders[0].tabs[0].title).toBe('Title A');
});

it('browserUpdateSavedBookmark returns {ok:true} on normal update', () => {
  const { get } = createMockStore();
  const slice = get() as unknown as BrowserBookmarkSlice;
  (get() as any).browserTabFolders = [
    { id: 'f1', name: '工具', createdAt: 0, tabs: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }] },
  ];
  (get() as any).recentWorkspaces = [];
  const result = slice.browserUpdateSavedBookmark('a', { url: 'https://e.com', title: 'Title C' });
  expect(result).toEqual({ ok: true });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
Expected: FAIL（`result.ok` 为 undefined）。

- [ ] **Step 3: 实现**

`browserUpdateSavedBookmark` 现有实现（约 :458-530）：已有 `folderCollides`/`wsCollides` 检查返回 `ok=false`。改为在 `ok=false` 时计算并返回 `pathLabel`：
- folder 冲突：`buildFolderPathLabel(folder.id, state.browserTabFolders, workspaces)`。
- ws 冲突：`buildWorkspacePathLabel(wsId, workspaces)`。
- `workspaces` 从 `_get().recentWorkspaces` 读取。

接口签名改为返回 `{ ok: boolean; pathLabel?: string }`（非 `{ ok: boolean }`）。

> 保持现有 `set` 内逻辑与条件 write 不变；仅扩展返回值。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
Expected: PASS。

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts
git commit -m "feat(frontend): return ok+pathLabel from browserUpdateSavedBookmark"
```

---

### Task 4: store 拦截返回 {ok, pathLabel} — browserBookmarkTab

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `checkBookmarkCollision`。
- Produces: `browserBookmarkTab(tabId, folderId?, newFolderName?, workspaceId?): Promise<{ ok: boolean; pathLabel?: string }>`（现有调用方 `bookmarkNewTab` 消费）。

- [ ] **Step 1: 写失败测试**

在 `browserBookmarkSlice.test.ts` 追加：

```ts
it('browserBookmarkTab returns {ok:false, pathLabel} on folder dedup', async () => {
  const { get } = createMockStore();
  const slice = get() as unknown as BrowserBookmarkSlice;
  (get() as any).browserTabFolders = [
    { id: 'f1', name: '工具', createdAt: 0, tabs: [{ tabId: 'a', url: 'https://e.com', title: 'Title A' }] },
  ];
  (get() as any).recentWorkspaces = [];
  (get() as any).browserTabs = [{ id: 't1', workspaceId: 'w', title: 'Title A', url: 'https://e.com' }];
  const result = await slice.browserBookmarkTab('t1', 'f1');
  expect(result).toEqual({ ok: false, pathLabel: '工具' });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
Expected: FAIL（返回 undefined）。

- [ ] **Step 3: 实现**

`browserBookmarkTab`（约 :408）在 `set` 前用 `_get()` 预检（复用 `checkBookmarkCollision`，folderId/workspaceId 传入，url/title 取 `_get().browserTabs` 中 tabId 对应 tab）；冲突则 `return { ok:false, pathLabel }`（不执行 `set`）；否则照常 `set` 并 `return { ok: true }`。

> 注意：`browserBookmarkTab` 是 async（因 `formatNewFolderNameByLocale`），返回值 await 后为 `{ ok, pathLabel }`。`newFolderName` 场景（新建文件夹+收藏）无既有路径，预检无冲突，直接 `{ok:true}`。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
Expected: PASS。

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts
git commit -m "feat(frontend): return ok+pathLabel from browserBookmarkTab"
```

---

### Task 5: UI — toast 含路径 + 标题隔离（useBrowserDialogs）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserDialogs.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts`（`browserBookmarkTab` 加 `titleOverride?: string` 参数）
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/browser.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`

**Interfaces:**
- Consumes: Task 2-4 的 store 返回值 `{ ok, pathLabel }`；`formatT(t, key, { path })`；新 key `browserBookmarkDuplicateWithPath`；`checkBookmarkCollision(url, title, opts, state, workspaces, excludeTabId?)`（Task 2/4 导出）。
- Produces: 行为变化——
  - `handleEditTabConfirm`：`ok:false` → toast 含路径，不更新 live tab 标题，不关闭对话框；`ok:true` → `browserUpdateTab(tabId, { url })`（不传 title）+ save-and-open。
  - `handleCreateTabConfirm` save-only：`{ok:false}` → toast 含路径；`{ok:true}` → 无提示。
  - `handleCreateTabConfirm` save-and-open：先 `checkBookmarkCollision` **只读预检**；`{ok:false}` → toast 含路径并 return（不开标签）；`{ok:true}` → `browserOpenTab(url, undefined, ...)`（不传自定义标题）+ `bookmarkNewTab(workspaceId, folderId, title)`（**第 3 参 = 用户自定义标题**）。
  - `bookmarkNewTab(workspaceId?, folderId?, titleOverride?)`：透传 titleOverride 给 `browserBookmarkTab(tabId, folderId, undefined, workspaceId, titleOverride)`。
  - `browserBookmarkTab(tabId, folderId?, newFolderName?, workspaceId?, titleOverride?)`：`titleOverride` 提供时，预检与 `computeBookmarkTabOutcome` 的标题都用它（否则沿用 `tab.title || hostnameFromUrl(url) || url`）。

- [ ] **Step 1: 写失败测试**

在 `useBrowserDialogs.test.ts` 追加：

```ts
it('save-only collision shows toast with path and writes nothing', async () => {
  // mock store: browserCreateBookmarkEntry 返回 {ok:false, pathLabel:'工具'}
  // 调用 result.current.handleCreateTabConfirm('Title', 'https://e.com', 'save-only')
  // 断言 showToast 被调用且 message 含 '工具'；browserUpdateTab/开标签未调用
});

it('save-and-open collision shows toast with path and does not open tab', async () => {
  // mock: browserCreateBookmarkEntry 返回 {ok:false, pathLabel:'工作区A'}
  // handleCreateTabConfirm('Title', 'https://e.com', 'save-and-open')
  // 断言 showToast 含 '工作区A'；browserOpenTab 未调用
});

it('edit collision shows toast with path and does not call browserUpdateTab', () => {
  // mock: browserUpdateSavedBookmark 返回 {ok:false, pathLabel:'工具'}
  // 预置 editTabDialog 状态；调用 handleEditTabConfirm
  // 断言 showToast 含 '工具'；browserUpdateTab 未调用；对话框未关闭
});

it('edit success calls browserUpdateTab with url only (no title)', () => {
  // mock: browserUpdateSavedBookmark 返回 {ok:true}
  // handleEditTabConfirm('NewName', 'https://e.com', 'save-only')
  // 断言 browserUpdateTab 以 { url: 'https://e.com' } 调用（不含 title 字段）
});

it('save-and-open success opens tab without custom title', async () => {
  // mock: browserCreateBookmarkEntry 返回 {ok:true}
  // handleCreateTabConfirm('Title', 'https://e.com', 'save-and-open')
  // 断言 browserOpenTab 以 (url, undefined, ...) 调用（title 为 undefined）
});
```

> 测试按现有 `useBrowserDialogs.test.ts` 的 store-mock 模式（`useAppStore.setState` + afterEach restore）扩展。现有测试对 `prefetchPageMeta`/siteMetaCache 已有 mock，保持兼容。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/app/features/browser/__tests__/useBrowserDialogs.test.ts`
Expected: FAIL（toast 无路径 / browserUpdateTab 仍传 title / browserOpenTab 仍传 title）。

- [ ] **Step 3: 实现 useBrowserDialogs.ts**

`handleCreateTabConfirm`（约 :70-123）：

```ts
const handleCreateTabConfirm = useCallback(
  async (name: string, url: string, mode: 'save-only' | 'save-and-open' = 'save-and-open') => {
    const { workspaceId } = createTabDialog;
    const folderId = pendingFolderIdRef.current;
    pendingFolderIdRef.current = '';
    // ...（保留现有 prefetchPageMeta 标题解析分支，原样不变）...
    setCreateTabDialog({ open: false });
    const store = useAppStore.getState();
    if (mode === 'save-only') {
      const result = store.browserCreateBookmarkEntry({
        url,
        title,
        workspaceId: folderId ? undefined : workspaceId,
        folderId,
      });
      if (result.ok === false) {
        const msg = result.pathLabel
          ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', { path: result.pathLabel })
          : t.browserEditBookmarkDuplicate;
        showToast(msg, 'warning');
      }
      return;
    }
    // save-and-open：先只读预检冲突（不写状态）
    const state = useAppStore.getState();
    const precheck = checkBookmarkCollision(
      url,
      title,
      { workspaceId: folderId ? undefined : workspaceId, folderId },
      state,
      state.recentWorkspaces,
    );
    if (precheck.ok === false) {
      const msg = precheck.pathLabel
        ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', { path: precheck.pathLabel })
        : t.browserEditBookmarkDuplicate;
      showToast(msg, 'warning');
      return;
    }
    if (store.browserNavigateInPlace) {
      store.browserNavigateActiveTab(url, undefined);
    } else {
      browserOpenTab(url, undefined, folderId ? undefined : workspaceId, undefined);
    }
    // 收藏记录写"用户填的自定义标题"（标签标题仍由页面抓取，互不影响）
    bookmarkNewTab(workspaceId, folderId, title);
  },
  [browserOpenTab, createTabDialog, bookmarkNewTab],
);
```

> 说明（2026-08-14 最终评审修订）：
> - **save-and-open 用只读预检**：`checkBookmarkCollision(url, title, opts, state, state.recentWorkspaces)`（Task 2 导出的纯函数），不写状态；`ok:false` → toast + return，不开标签。
> - **标题双轨**：打开标签传 `undefined`（标签标题由页面抓取 = 网站真实标题）；**收藏记录显式写"用户填的自定义标题"**——`bookmarkNewTab(workspaceId, folderId, title)` 第 3 参为自定义标题，透传给 `browserBookmarkTab(tabId, folderId, undefined, workspaceId, titleOverride)` 的 `titleOverride`。这样书签树显示自定义标题、标签显示网站标题，两者互不影响。
> - **`browserBookmarkTab` 新增可选 `titleOverride?: string`**：预检与 `computeBookmarkTabOutcome` 的标题都优先用 `titleOverride`（有则用，否则沿用 `tab.title || hostnameFromUrl(url) || url`）。Task 4 的 tabId-aware 逻辑不变。
> - `browserOpenTab` 的 folderId 传 `undefined`（收藏写入统一由 `bookmarkNewTab`→`browserBookmarkTab` 负责）。
> - 集成测试确认：save-and-open 成功后 folder 内**只有一条**该 url 的收藏，且其 title 为自定义标题（非 hostname）。

`handleEditTabConfirm`（约 :142-172）：

```ts
const handleEditTabConfirm = useCallback(
  (name: string, url: string, mode: 'save-only' | 'save-and-open' = 'save-only') => {
    const { tabId } = editTabDialog;
    const trimmedUrl = url.trim();
    const trimmedName = name.trim();
    if (tabId) {
      const store = useAppStore.getState();
      const result = store.browserUpdateSavedBookmark(tabId, {
        url: trimmedUrl,
        title: trimmedName,
      });
      if (result.ok === false) {
        const msg = result.pathLabel
          ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', { path: result.pathLabel })
          : t.browserEditBookmarkDuplicate;
        showToast(msg, 'warning');
        return;
      }
      browserUpdateTab(tabId, { url: trimmedUrl || undefined });
    }
    if (mode === 'save-and-open') {
      const store = useAppStore.getState();
      if (store.browserNavigateInPlace) {
        store.browserNavigateActiveTab(trimmedUrl, undefined);
      } else {
        store.browserOpenTab(trimmedUrl, undefined);
      }
    }
    setEditTabDialog({ open: false, tabId: '', name: '', url: '' });
  },
  [editTabDialog, browserUpdateTab, showToast, t],
);
```

> `formatT` 需 import（`@i18n/formatT` 或 `@i18n`）。`t` 是 `Record<string, string>`，`formatT` 的 CopyDict 类型需类型断言（`t as CopyDict`）或改用 `t.browserBookmarkDuplicateWithPath.replace('{path}', result.pathLabel)` 规避类型问题——**实现时若 `formatT` 签名不接受 `Record<string,string>`，用 `String.replace('{path}', ...)` 替代**。

- [ ] **Step 4: i18n key**

`zh-CN/browser.ts` 与 `en-US/browser.ts` 同时新增：

| key | zh | en |
|-----|----|----|
| `browserBookmarkDuplicateWithPath` | `该位置已存在相同网址与标题的书签：{path}` | `A bookmark with the same URL and title already exists at: {path}` |

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/app/features/browser/__tests__/useBrowserDialogs.test.ts src/app/i18n/__tests__/keys.test.ts`
Expected: PASS。

Run: `npx tsc --noEmit`
Expected: 0 错误。

Run: `npx eslint .`
Expected: 0 errors。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/useBrowserDialogs.ts ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts ai-digital-life/frontend/src/app/i18n/en-US/browser.ts ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts
git commit -m "feat(frontend): bookmark duplicate toast with path and tab title isolation"
```

---

### Task 6: UI — 当前标签打开书签不再写自定义标题

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserTagActions.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserTagActions.test.ts`（若存在；不存在则新建）

**Interfaces:**
- Consumes: 无新依赖。
- Produces: `handleOpenTabInCurrentTab` 只更新 url（不写 title）。

- [ ] **Step 1: 写失败测试**

若 `useBrowserTagActions.test.ts` 不存在则创建：

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserTagActions } from '../useBrowserTagActions';

describe('handleOpenTabInCurrentTab', () => {
  it('updates active tab url only, not the bookmark title', () => {
    const browserUpdateTab = vi.fn();
    // mock useAppStore: browserTabs 含 tabId 't1' {url:'https://e.com', title:'自定义标题'}，
    // browserActiveTabId='active'
    const { result } = renderHook(() => useBrowserTagActions({
      browserOpenTab: vi.fn(),
      browserUpdateTab,
      showToast: vi.fn(),
    }));
    act(() => {
      result.current.handleOpenTabInCurrentTab('t1');
    });
    expect(browserUpdateTab).toHaveBeenCalledWith('active', { url: 'https://e.com' });
    // 不传 title
  });
});
```

> 需先读 `useBrowserTagActions.ts` 实际 props/依赖以写准确的 mock（其内部用 `useAppStore`）。若无法独立 mock，改用 `useAppStore.setState` 模式。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/app/features/browser/__tests__/useBrowserTagActions.test.ts`
Expected: FAIL（`browserUpdateTab` 收到 `{url, title}` 而非仅 `{url}`）。

- [ ] **Step 3: 实现**

`useBrowserTagActions.ts` `handleOpenTabInCurrentTab`（约 :125-135）：

```ts
const handleOpenTabInCurrentTab = useCallback(
  (tabId: string) => {
    const state = useAppStore.getState();
    const tab = state.browserTabs.find((t) => t.id === tabId);
    const activeTabId = state.browserActiveTabId;
    if (tab && activeTabId) {
      browserUpdateTab(activeTabId, { url: tab.url });
    }
  },
  [browserUpdateTab],
);
```

（移除 `title: tab.title`。）

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/app/features/browser/__tests__/useBrowserTagActions.test.ts`
Expected: PASS。

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/useBrowserTagActions.ts ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserTagActions.test.ts
git commit -m "fix(frontend): open bookmark in current tab without overwriting title"
```

---

### Task 7: 悬停 title 语义化（TreeNodeRow / FileTree / BrowserEntrySubEntries）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/file-tree/TreeNodeRow.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/file-tree/FileTree.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx`
- Create: `ai-digital-life/frontend/src/app/features/browser-tree/__tests__/BrowserEntrySubEntries.test.tsx`（若该目录无 test 目录则创建）

**Interfaces:**
- Consumes: Task 1 的 `buildFolderPathLabel`。
- Produces:
  - `TreeNodeRow` 新 prop `nodeTitle?: string`：`title={nodeTitle ?? nodePath}`。
  - `FileTree` 新 prop `getNodeTitle?: (node: T) => string | undefined`。
  - `BrowserEntrySubEntries` 提供 `getNodeTitle`：目录→`buildFolderPathLabel(folderId, tabFolders, workspaces)`；书签叶子→`"{父路径} / {名称}"`（父路径可解析）或 `node.name`；历史叶子→`node.name`。

- [ ] **Step 1: 写失败测试**

创建 `BrowserEntrySubEntries.test.tsx`（或追加到现有文件），测试 `getNodeTitle` 回调输出：

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserEntrySubEntries } from '../BrowserEntrySubEntries';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTreeNode } from '../types';

// 说明：BrowserEntrySubEntries 渲染依赖 FileTree；更稳妥的做法是把
// getNodeTitle 逻辑抽成纯函数 getBrowserNodeTitle(node, tabFolders, workspaces, parentPath?)
// 并单测该纯函数（推荐）。若抽纯函数，则：
// - getBrowserNodeTitle({kind:'directory', folderId:'sub', name:'子文件夹'}, folders, workspaces)
//   → '工具 → 子文件夹'
// - getBrowserNodeTitle({kind:'file', name:'百度', folderId:'sub'}, folders, workspaces)
//   → '工具 → 子文件夹 / 百度'
// - getBrowserNodeTitle({kind:'file', name:'历史条目', nodeType:'history'}, folders, workspaces)
//   → '历史条目'
```

> **推荐实现方式**：在 `BrowserEntrySubEntries.tsx` 内抽纯函数 `getBrowserNodeTitle(node, tabFolders, workspaces)` 并导出，单测该纯函数（无需渲染 FileTree）。计划以此为默认；若实现者遇到渲染层依赖问题，用纯函数方案。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/app/features/browser-tree` （或新建测试文件对应路径）
Expected: FAIL（`getBrowserNodeTitle` 未定义 / 输出不符）。

- [ ] **Step 3: 实现**

`TreeNodeRow.tsx`：props 接口加 `nodeTitle?: string`，解构后 `title={nodeTitle ?? nodePath}`。

`FileTree.tsx`：props 接口加 `getNodeTitle?: (node: T) => string | undefined`；`VirtualNodeComponent` 接收并在 `TreeNodeRow` 传 `nodeTitle={getNodeTitle?.(node)}`；`FileTree` 把 `getNodeTitle` 传给 `VirtualNodeComponent`。

`BrowserEntrySubEntries.tsx`：
- 新增导出的纯函数：

```ts
export function getBrowserNodeTitle(
  node: BrowserTreeNode,
  tabFolders: TabFolderState[],
  workspaces: RecentWorkspaceEntry[],
): string {
  if (node.kind === 'directory' && node.nodeType === 'folder' && node.folderId) {
    return buildFolderPathLabel(node.folderId, tabFolders, workspaces);
  }
  if (node.kind === 'file' && node.nodeType === 'history') {
    return node.name;
  }
  // 书签/标签叶子
  if (node.kind === 'file') {
    const parentFolderId = node.folderId;
    if (parentFolderId) {
      const parentPath = buildFolderPathLabel(parentFolderId, tabFolders, workspaces);
      if (parentPath) {
        return `${parentPath} / ${node.name}`;
      }
    }
    return node.name;
  }
  return node.name;
}
```

> 注意：`BrowserTreeNode` 叶子节点的 `folderId` 字段——树构建时叶子（`buildFolderNode` 内 tab/bookmark 节点）未设 `folderId`；其父级 folder 的 `folderId` 才是路径锚点。实现时 `getNodeTitle` 的叶子需要知道**父级 folderId**。**方案**：`BrowserEntrySubEntries` 的 `getNodeTitle` 闭包内捕获 `node.folderId`（当前父目录节点，即正在渲染其子项的那个 folder）作为父路径锚点，对叶子拼 `"父路径 / 名称"`。即 `getNodeTitle` 在 `BrowserEntrySubEntries` 内部定义，使用外层 `node.folderId`/`node.workspaceId`。
> 因此推荐：`getBrowserNodeTitle(node, parentFolderId, tabFolders, workspaces)`，parentFolderId 来自渲染上下文。
- `FileTree` 调用处传入：

```tsx
getNodeTitle={(childNode) =>
  getBrowserNodeTitle(
    childNode,
    node.folderId || node.workspaceId ? (node.folderId ?? '') : '',
    browserTabFolders,
    recentWorkspaces,
  )
}
```

> 实现者需确认 `BrowserEntrySubEntries` 能读取 `browserTabFolders`/`recentWorkspaces`（已有 `useAppStore` import，用 `useAppStore((s) => s.browserTabFolders)`/`useAppStore((s) => s.recentWorkspaces)`）。父路径锚点：叶子挂载在 folder 下用 `node.folderId`（外层当前目录节点）；挂在工作区根下用工作区名。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/app/features/browser-tree` + 文件树相关测试
Expected: PASS。

Run: `npx tsc --noEmit`
Expected: 0 错误。

Run: `npx eslint .`
Expected: 0 errors。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/file-tree/TreeNodeRow.tsx ai-digital-life/frontend/src/app/features/file-tree/FileTree.tsx ai-digital-life/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx ai-digital-life/frontend/src/app/features/browser-tree/__tests__/BrowserEntrySubEntries.test.tsx
git commit -m "feat(frontend): semantic hover title for browser tree nodes"
```

---

### Task 8: 全量验证与收尾

**Files:**
- 无（仅验证）。

- [ ] **Step 1: 全量前端测试**

Run: `npx vitest run`（在 `ai-digital-life/frontend` 目录，timeout 充足如 600000ms）
Expected: 全部 PASS（基线 1696 + 新增）。

> 若出现个别 timeout（如 siteMetaCleanup.test.ts 的 5s 并行加载 flake），单独重跑该文件确认；若隔离通过则属并行 flake 非回归。

- [ ] **Step 2: typecheck + lint**

Run: `npx tsc --noEmit`
Expected: 0 错误。

Run: `npx eslint .`
Expected: 0 errors。

- [ ] **Step 3: i18n parity 专项**

Run: `npx vitest run src/app/i18n/__tests__/keys.test.ts`
Expected: PASS（新 key 双端一致）。

- [ ] **Step 4: 最终 commit（如有遗漏）**

```bash
git add -A
git commit -m "chore(frontend): finalize bookmark toast and title isolation"
```

> 若 Task 1-7 已各自提交且无遗漏，本步可跳过。

---

## Self-Review

**Spec 覆盖：**
- 需求 1（toast 含路径）：路径工具（Task 1）→ store 返回值（Task 2-4）→ UI toast（Task 5）→ i18n（Task 5）✓
- 需求 2（标题隔离）：编辑不写 title（Task 5 4a）、当前标签打开不写 title（Task 6 4b）、保存并打开不传自定义 title（Task 5 4c）✓
- 需求 3（悬停语义化路径）：TreeNodeRow/FileTree prop（Task 7）→ BrowserEntrySubEntries 提供（Task 7）✓
- 测试：路径工具单测（Task 1）、store 返回值（Task 2-4）、dialog handler（Task 5）、tag actions（Task 6）、getBrowserNodeTitle（Task 7）、keys parity（Task 5/8）✓

**Placeholder 扫描：** 无 TBD/TODO；所有代码块含完整实现或明确"实现时核对"的指引。

**类型一致性：**
- `buildFolderPathLabel(folderId, folders, workspaces): string` / `buildWorkspacePathLabel(wsId, workspaces): string` 在 Task 1 定义、Task 2/3/7 消费，签名一致。
- `checkBookmarkCollision(url, title, opts, state, workspaces): {ok, pathLabel?}` 在 Task 2 定义、Task 3/4 复用。
- `{ ok: boolean; pathLabel?: string }` 在 Task 2 定义，Task 3/4/5 一致。
- `browserBookmarkTab` 返回 `Promise<{ok, pathLabel?}>`（async），Task 5 `bookmarkNewTab` 需 await——**实现注意**：`bookmarkNewTab` 当前是同步 `useCallback`，Task 5 中若需读取其返回值需改为 async 或调整；实际上 save-and-open 已用 `browserCreateBookmarkEntry` 预检（同步返回），`bookmarkNewTab` 的返回值在 Task 5 实现中**不需要**（预检已覆盖），仅保持其现有行为。

**已知风险（实现时核对）：**
- Task 5 save-and-open 双写（`browserCreateBookmarkEntry` 合成 tabId + `bookmarkNewTab` 真实 tabId）——需集成测试确认 folder 内仅一条该 url 收藏。若产生两条，改用"只读预检"（不写状态）+ 原 `bookmarkNewTab` 单写。
- Task 5 `formatT` 签名对 `Record<string,string>` 的兼容性——若类型报错，用 `String.replace('{path}', ...)`。
- Task 7 叶子 `folderId` 缺失——需在 `BrowserEntrySubEntries` 闭包内用父级 folderId/workspaceId 作锚点。
- Task 6 的 `useBrowserTagActions` 依赖（props 结构）需实现者先读源码确认。
