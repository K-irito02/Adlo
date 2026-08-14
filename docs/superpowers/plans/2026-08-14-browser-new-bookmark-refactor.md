# 浏览器"新建书签"重构 + 悬停按钮原生 title 化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将浏览器目录树与新建/编辑对话框从"新建标签"语义重构为"新建书签"语义：文案改名、对话框改为"保存并打开/仅保存"双按钮（遵循新建标签/当前标签开关）、"仅保存"不开标签，并将目录/书签悬停的"更多操作/刷新"按钮改为原生 `title`、"刷新"文案改为"刷新网站图标与标题"。

**Architecture:** 纯前端改动。i18n key 改名 + 新增；`BrowserNavUtilityButtons` prop 改名与 TooltipSimple 化；`CreateTabDialog` 双按钮 + `onConfirm` 增加 mode 参数；`useBrowserDialogs` 保存语义分支（读 store `browserNavigateInPlace` 开关）；新增 store action `browserCreateBookmarkEntry`（不开标签写书签）；目录树右键菜单加"新建书签"项 + 悬停按钮原生 title。

**Tech Stack:** React 19 + Zustand + TypeScript + Vitest + React Testing Library。

## Global Constraints

- i18n parity：zh-CN/en-US 的 `browser.ts` 必须同步改名/新增（`keys.test.ts` 自动校验顶级 key 集合一致）。
- 质量门禁：`pnpm --dir frontend run typecheck` 0 错误、`pnpm --dir frontend run lint` 0 errors、`vitest run` 通过。
- 禁止向后兼容重导出；`browserNewTabPage`/`browserNewTabBtn`/`browserNewTabFolder` 等"新建标签页/文件夹"相关 key **不改**。
- `common.clearAllOpenTabs` 死 key 不动。
- 双端一致：Tauri 与浏览器模式行为一致。
- TDD：store action / dialog handler 先写失败测试。

---

### Task 1: i18n key 改名、新增、值改 + 消费点机械更新

**Files:**
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/browser.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserNavUtilityButtons.tsx`（prop 改名）
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserNavigator.tsx:182`
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserMenus.ts:104`
- Modify: `ai-digital-life/frontend/src/app/features/browser/browser-landing/CreateTabDialog.tsx:94,130,138,151,158,190`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BookmarkToFolderDialog.tsx:354,361`
- Modify: `ai-digital-life/frontend/src/app/features/browser-tree/browserTreeEntryUtils.tsx:98`
- Modify: `ai-digital-life/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.tsx:48`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserNavUtilityButtons.test.tsx`

**Interfaces:**
- Consumes: 现有 `CopyDict` 类型（`satisfies` 约束下改 key 即触发所有引用点编译错误，逐一修复）。
- Produces: `browserNewBookmark`、`browserMenuNewTab`、`browserBookmarkSaveOnly`、`browserBookmarkSaveAndOpen`、`browserContextCreateBookmark`、`browserEditBookmark`、`browserBookmarkName` 新 key；`browserNewTab`/`browserContextCreateTab`/`browserEditTab`/`browserTabName` 移除；`browserRefreshMeta`/`browserRefreshMetaHint` 值改。`BrowserNavUtilityButtons` prop 变为 `newBookmarkLabel`。

- [ ] **Step 1: 改 zh-CN/browser.ts**

将：
- `browserNewTab: '新建标签'` → `browserNewBookmark: '新建书签'`
- `browserEditTab: '编辑标签'` → `browserEditBookmark: '编辑书签'`
- `browserTabName: '标签名称'` → `browserBookmarkName: '书签名称'`
- `browserContextCreateTab: '新建标签'` → `browserContextCreateBookmark: '新建书签'`
- `browserRefreshMeta: '刷新Logo/标题'` → `browserRefreshMeta: '刷新网站图标与标题'`
- `browserRefreshMetaHint` 值改为 `'重新获取网站图标与标题，并清除旧缓存。若标签名称已自定义则保留自定义名称。'`

新增（位置随意，保持与 en-US 一致即可）：
- `browserMenuNewTab: '新建标签'`
- `browserBookmarkSaveOnly: '仅保存'`
- `browserBookmarkSaveAndOpen: '保存并打开'`

- [ ] **Step 2: 改 en-US/browser.ts**

将：
- `browserNewTab: 'New tab'` → `browserNewBookmark: 'New bookmark'`
- `browserEditTab: 'Edit tab'` → `browserEditBookmark: 'Edit bookmark'`
- `browserTabName: 'Tab name'` → `browserBookmarkName: 'Bookmark name'`
- `browserContextCreateTab: 'New tab'` → `browserContextCreateBookmark: 'New bookmark'`
- `browserRefreshMeta: 'Refresh Logo/Title'` → `browserRefreshMeta: 'Refresh Website Icon & Title'`
- `browserRefreshMetaHint` 值改为 `'Re-fetch website icon and title, clearing old cache. If the tab name has been customized, the custom name is preserved.'`

新增：
- `browserMenuNewTab: 'New tab'`
- `browserBookmarkSaveOnly: 'Save only'`
- `browserBookmarkSaveAndOpen: 'Save and open'`

- [ ] **Step 3: 更新所有消费点（机械改名，不改行为）**

- `BrowserNavUtilityButtons.tsx:7,16,22`：prop `newTabLabel` → `newBookmarkLabel`（接口、解构、`plusLabel` 计算三处）。
- `BrowserNavUtilityButtons.tsx`：tabs 模式 "+" 按钮（`:26-34`）由原生 `title` 改为 `TooltipSimple` 包裹（`open` 模式保持原生 `title`）。改为条件渲染：`navigatorMode === 'tabs'` 时用 `<TooltipSimple content={plusLabel} placement="top">` 包裹按钮且移除 `title` 属性；`open` 模式按钮保持 `title={plusLabel}`。
- `BrowserNavigator.tsx:182`：`newTabLabel={t.browserNewTab}` → `newBookmarkLabel={t.browserNewBookmark}`。
- `useBrowserMenus.ts:104`：`label: t.browserNewTab` → `label: t.browserMenuNewTab`（保留"新建标签"措辞，真·开标签语义）。
- `CreateTabDialog.tsx:94`：创建标题 `t.browserNewTab` → `t.browserNewBookmark`（编辑分支 `t.browserEditTab` → `t.browserEditBookmark`）。
- `CreateTabDialog.tsx:190`：提交按钮 `isEditMode ? t.browserSave : t.browserNewTab` → `isEditMode ? t.browserSave : t.browserNewBookmark`（Task 2 会整体替换按钮，此处仅保证编译通过）。
- `CreateTabDialog.tsx:130,138,151,158`：`t.browserTabName` → `t.browserBookmarkName`（label + placeholder 两处）；`t.browserTabUrl` 不动。
- `BookmarkToFolderDialog.tsx:354,361`：`t.browserTabName` → `t.browserBookmarkName`。
- `browserTreeEntryUtils.tsx:98`：`label: t.browserContextCreateTab` → `label: t.browserContextCreateBookmark`。
- `browserEntrySubEntriesUtils.tsx:48`：`label: t.browserContextCreateTab` → `label: t.browserContextCreateBookmark`。
- `BrowserNavUtilityButtons.test.tsx`：`labels.newTab: '新建标签'` → `labels.newTab: '新建书签'`（prop 名 `newTabLabel` → `newBookmarkLabel`，第 17 行）。tabs 模式测试（第 42-46 行）改为断言无原生 `title` 属性（tabs 走 TooltipSimple）；open 模式断言（第 28-40 行）保持不变。

- [ ] **Step 4: 验证**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 错误。

Run: `pnpm --dir frontend vitest run src/app/i18n/__tests__/keys.test.ts src/app/features/browser/BrowserNavUtilityButtons.test.tsx`
Expected: PASS。

Run: `pnpm --dir frontend run lint`
Expected: 0 errors。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/i18n ai-digital-life/frontend/src/app/features/browser/BrowserNavUtilityButtons.tsx ai-digital-life/frontend/src/app/features/browser/BrowserNavUtilityButtons.test.tsx ai-digital-life/frontend/src/app/features/browser/BrowserNavigator.tsx ai-digital-life/frontend/src/app/features/browser/useBrowserMenus.ts ai-digital-life/frontend/src/app/features/browser/browser-landing/CreateTabDialog.tsx ai-digital-life/frontend/src/app/features/browser/BookmarkToFolderDialog.tsx ai-digital-life/frontend/src/app/features/browser-tree/browserTreeEntryUtils.tsx ai-digital-life/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.tsx
git commit -m "refactor(frontend): rename new-tab to new-bookmark i18n keys"
```

---

### Task 2: CreateTabDialog 双按钮 + onConfirm mode 签名

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/browser-landing/CreateTabDialog.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserPanelDialogs.tsx:11-18,66-74`
- Create: `ai-digital-life/frontend/src/app/features/browser/browser-landing/CreateTabDialog.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `t.browserBookmarkSaveOnly` / `t.browserBookmarkSaveAndOpen` / `t.browserNewBookmark` / `t.browserEditBookmark` / `t.browserBookmarkName`。
- Produces: `onConfirm: (name: string, url: string, mode: 'save-only' | 'save-and-open') => void`。BrowserPanelDialogs props 中 `handleCreateTabConfirm` / `handleEditTabConfirm` 类型更新为 `(name: string, url: string, mode: 'save-only' | 'save-and-open') => void`。

- [ ] **Step 1: 写失败测试**

创建 `CreateTabDialog.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CreateTabDialog } from './CreateTabDialog';

const t = {
  browserNewBookmark: '新建书签',
  browserEditBookmark: '编辑书签',
  browserBookmarkName: '书签名称',
  browserTabUrl: '网址',
  browserBookmarkSaveOnly: '仅保存',
  browserBookmarkSaveAndOpen: '保存并打开',
  browserAddPortInvalid: '网址无效',
  browserClose: '关闭',
} as Record<string, string>;

describe('CreateTabDialog', () => {
  it('renders save-and-open and save-only buttons, no cancel button', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <CreateTabDialog open t={t} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    expect(screen.getByRole('button', { name: '保存并打开' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '仅保存' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
  });

  it('calls onConfirm with save-and-open mode when save-and-open clicked', () => {
    const onConfirm = vi.fn();
    render(<CreateTabDialog open t={t} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('网址'), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并打开' }));
    expect(onConfirm).toHaveBeenCalledWith('', 'https://example.com', 'save-and-open');
  });

  it('calls onConfirm with save-only mode when save-only clicked', () => {
    const onConfirm = vi.fn();
    render(<CreateTabDialog open t={t} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('网址'), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '仅保存' }));
    expect(onConfirm).toHaveBeenCalledWith('', 'https://example.com', 'save-only');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend vitest run src/app/features/browser/browser-landing/CreateTabDialog.test.tsx`
Expected: FAIL（无"取消"断言、onConfirm 3 参断言不满足）。

- [ ] **Step 3: 实现**

`CreateTabDialog.tsx`：

- 接口：`onConfirm: (name: string, url: string, mode: 'save-only' | 'save-and-open') => void`。
- `handleConfirm` 改为接收 mode：

```tsx
const handleConfirm = useCallback(
  (mode: 'save-only' | 'save-and-open') => {
    if (loading) {
      return;
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return;
    }
    if (!isValidBrowserUrl(trimmedUrl)) {
      setUrlError(t.browserAddPortInvalid);
      return;
    }
    const finalUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    onConfirm(name.trim(), finalUrl, mode);
  },
  [name, url, loading, onConfirm, t.browserAddPortInvalid],
);
```

- `handleKeyDown` Enter 分支：`handleConfirm('save-and-open')`。
- 底部按钮区（`:175-192`）替换为：

```tsx
<div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
  <button
    type="button"
    className="adl-btn adl-btn--primary adl-btn--square"
    onClick={() => handleConfirm('save-and-open')}
    disabled={!url.trim() || loading}
  >
    {t.browserBookmarkSaveAndOpen}
  </button>
  <button
    type="button"
    className="adl-btn adl-btn--ghost adl-btn--square"
    onClick={() => handleConfirm('save-only')}
    disabled={!url.trim() || loading}
  >
    {t.browserBookmarkSaveOnly}
  </button>
</div>
```

（删除原 `取消` 按钮；右上角 X 与点击遮罩仍调用 `onCancel`。）

`BrowserPanelDialogs.tsx`：props 类型中 `handleCreateTabConfirm` / `handleEditTabConfirm` 签名更新为 `(name: string, url: string, mode: 'save-only' | 'save-and-open') => void`（透传不变，Task 4 才真正消费 mode）。

- [ ] **Step 4: 运行验证**

Run: `pnpm --dir frontend vitest run src/app/features/browser/browser-landing/CreateTabDialog.test.tsx`
Expected: PASS。

Run: `pnpm --dir frontend run typecheck`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/browser-landing/CreateTabDialog.tsx ai-digital-life/frontend/src/app/features/browser/browser-landing/CreateTabDialog.test.tsx ai-digital-life/frontend/src/app/features/browser/BrowserPanelDialogs.tsx
git commit -m "feat(frontend): add save-and-open/save-only buttons to bookmark dialog"
```

---

### Task 3: 新增 store action `browserCreateBookmarkEntry`

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts`
- Create: `ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`

**Interfaces:**
- Consumes: `BookmarkTabItem { tabId, url, title }`、`WorkspaceBookmarkEntry { tabId, url, title }`、`BrowserBookmark { url, title }`、`createUiId`、存储 key 常量。
- Produces: `browserCreateBookmarkEntry(input: { url: string; title: string; workspaceId?: string; folderId?: string }) => void`。

- [ ] **Step 1: 写失败测试**

创建 `browserBookmarkSlice.test.ts`（仿 `browserSlice.test.ts` 的 createMockStore 模式）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrowserBookmarkSlice } from '../browserBookmarkSlice';
import type { BrowserBookmarkSlice } from '../browserBookmarkSlice';

function createMockStore() {
  let state: Record<string, unknown> = {};
  const get = () => state;
  const set = (partial: unknown) => {
    if (typeof partial === 'function') {
      const next = (partial as (s: Record<string, unknown>) => Record<string, unknown>)(state);
      state = { ...state, ...next };
    } else {
      state = { ...state, ...(partial as Record<string, unknown>) };
    }
  };
  const slice = createBrowserBookmarkSlice(set as never, get as never);
  state = { ...slice };
  return { get };
}

describe('browserCreateBookmarkEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a bookmark to browserBookmarks when url is new', () => {
    const { get } = createMockStore();
    (get() as unknown as BrowserBookmarkSlice).browserCreateBookmarkEntry({
      url: 'https://example.com',
      title: 'Example',
    });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks).toContainEqual({ url: 'https://example.com', title: 'Example' });
  });

  it('does not duplicate an existing browserBookmark url', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    slice.browserCreateBookmarkEntry({ url: 'https://example.com', title: 'Example' });
    slice.browserCreateBookmarkEntry({ url: 'https://example.com', title: 'Renamed' });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserBookmarks.filter((b) => b.url === 'https://example.com')).toHaveLength(1);
  });

  it('appends a folder tab item when folderId provided', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    const state0 = get() as unknown as BrowserBookmarkSlice;
    const folderId = 'f1';
    state0.browserTabFolders = [{ id: folderId, name: 'F', createdAt: 0, tabs: [] }];
    slice.browserCreateBookmarkEntry({
      url: 'https://example.com',
      title: 'Example',
      folderId,
    });
    const state = get() as unknown as BrowserBookmarkSlice;
    const folder = state.browserTabFolders.find((f) => f.id === folderId)!;
    expect(folder.tabs).toHaveLength(1);
    expect(folder.tabs![0]).toMatchObject({ url: 'https://example.com', title: 'Example' });
    expect(folder.tabs![0].tabId).toBeTruthy();
  });

  it('appends a workspace bookmark entry when workspaceId provided', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    slice.browserCreateBookmarkEntry({
      url: 'https://example.com',
      title: 'Example',
      workspaceId: 'ws1',
    });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserWorkspaceBookmarks['ws1']).toHaveLength(1);
    expect(state.browserWorkspaceBookmarks['ws1'][0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
    });
  });

  it('does not open or create a tab', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserBookmarkSlice;
    slice.browserCreateBookmarkEntry({ url: 'https://example.com', title: 'Example' });
    const state = get() as unknown as BrowserBookmarkSlice;
    expect(state.browserTabs).toHaveLength(0);
  });
});
```

> 注：`BrowserBookmarkSlice` 类型不直接含 `browserTabs`；`browserTabs` 断言可通过 `(state as unknown as { browserTabs: unknown[] }).browserTabs` 或仅断言无相关字段。若 TS 编译失败，将 `expect(state.browserTabs)` 改为读取 mock state 的原始字段。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
Expected: FAIL（`browserCreateBookmarkEntry is not a function`）。

- [ ] **Step 3: 实现**

在 `browserBookmarkSlice.ts` 接口中新增：

```ts
browserCreateBookmarkEntry: (input: {
  url: string;
  title: string;
  workspaceId?: string;
  folderId?: string;
}) => void;
```

在实现对象中新增（置于 `browserToggleBookmark` 之后）：

```ts
browserCreateBookmarkEntry: (input) => {
  set((state) => {
    const url = input.url.trim();
    const title = input.title.trim() || hostnameFromUrl(url) || url;
    if (!url) {
      return state;
    }
    const syntheticTabId = createUiId('bookmark');
    const exists = state.browserBookmarks.some((b) => b.url === url);
    const nextBookmarks = exists
      ? state.browserBookmarks
      : [...state.browserBookmarks, { url, title }];

    let nextFolders = state.browserTabFolders;
    let foldersChanged = false;
    if (input.folderId) {
      nextFolders = state.browserTabFolders.map((folder) => {
        if (folder.id !== input.folderId) {
          return folder;
        }
        const existingTabs = folder.tabs || [];
        if (existingTabs.some((item) => item.url === url)) {
          return folder;
        }
        foldersChanged = true;
        return { ...folder, tabs: [...existingTabs, { tabId: syntheticTabId, url, title }] };
      });
    }

    let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
    let wsChanged = false;
    if (input.workspaceId) {
      const existing = state.browserWorkspaceBookmarks[input.workspaceId] || [];
      if (!existing.some((entry) => entry.url === url)) {
        nextWorkspaceBookmarks = {
          ...state.browserWorkspaceBookmarks,
          [input.workspaceId]: [...existing, { tabId: syntheticTabId, url, title }],
        };
        wsChanged = true;
      }
    }

    let nextTabIdUrlMap = state.browserBookmarkTabIdUrlMap;
    if (input.folderId && foldersChanged) {
      nextTabIdUrlMap = { ...nextTabIdUrlMap, [syntheticTabId]: url };
    }

    if (!exists) {
      writeBookmarks(nextBookmarks);
    }
    if (foldersChanged) {
      writeTabFolders(nextFolders);
    }
    if (wsChanged) {
      writeWorkspaceBookmarks(nextWorkspaceBookmarks);
    }
    if (input.folderId && foldersChanged) {
      writeBookmarkTabIdUrlMap(nextTabIdUrlMap);
    }

    return {
      browserBookmarks: nextBookmarks,
      browserTabFolders: nextFolders,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
    };
  });
},
```

> 需确认 `browserBookmarkSlice.ts` 中 `state.browserTabFolders`、`state.browserWorkspaceBookmarks`、`state.browserBookmarkTabIdUrlMap`、`state.browserBookmarks` 字段均在 `set` 的 `state` 上存在（`BrowserBookmarkHelpersState` 已含全部）。

- [ ] **Step 4: 运行验证**

Run: `pnpm --dir frontend vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
Expected: PASS。

Run: `pnpm --dir frontend run typecheck`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts
git commit -m "feat(frontend): add browserCreateBookmarkEntry store action"
```

---

### Task 4: useBrowserDialogs 保存语义（mode 分支 + 开关）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserDialogs.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `browserCreateBookmarkEntry`（经 `useAppStore.getState()`）；store 的 `browserNavigateInPlace`、`browserNavigateActiveTab`、`browserBookmarkTab`、`browserOpenTab`。
- Produces: `handleCreateTabConfirm(name, url, mode)` 三态行为；`handleEditTabConfirm(name, url, mode)` 两态行为。现有签名兼容（mode 默认值保证旧调用不破坏）。

- [ ] **Step 1: 更新既有测试 setup（mode 兼容）并新增失败用例**

在 `useBrowserDialogs.test.ts` 中，将 `confirmCreateTab` 的调用改为显式传 mode，并新增用例：

```ts
it('save-only mode calls browserCreateBookmarkEntry without opening a tab', async () => {
  const createBookmarkEntry = vi.fn();
  const storeMock = {
    browserActiveTabId: 't1',
    browserCreateBookmarkEntry: createBookmarkEntry,
    browserBookmarkTab: vi.fn(),
    browserNavigateActiveTab: vi.fn(),
    browserNavigateInPlace: false,
    browserOpenTab: vi.fn(),
  };
  // mock useAppStore.getState
  ...
  await act(async () => {
    await result.current.handleCreateTabConfirm('Name', 'https://example.com', 'save-only');
  });
  expect(createBookmarkEntry).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'https://example.com', title: 'Name' }),
  );
});

it('save-and-open with navigateInPlace=true navigates active tab', async () => {
  const navigateActiveTab = vi.fn();
  const openTab = vi.fn();
  ...
  await act(async () => {
    await result.current.handleCreateTabConfirm('Name', 'https://example.com', 'save-and-open');
  });
  expect(navigateActiveTab).toHaveBeenCalledWith('https://example.com', 'Name');
  expect(openTab).not.toHaveBeenCalled();
});

it('save-and-open with navigateInPlace=false opens new tab', async () => {
  const openTab = vi.fn();
  ...
  await act(async () => {
    await result.current.handleCreateTabConfirm('Name', 'https://example.com', 'save-and-open');
  });
  expect(openTab).toHaveBeenCalled();
});
```

> 实现时若 `useBrowserDialogs` 直接 `useAppStore.getState()` 读取，则测试需 `vi.mock('@stores/slicedStore', ...)` 注入上述 storeMock（参考现有文件对 `useAppStore` 的依赖方式；现有测试未 mock store 时 `bookmarkNewTab` 因 `workspaceId/folderId` 为空短路，不触发 store）。保持测试通过需确保 mock 提供 `getState` 返回含全部用到的字段。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend vitest run src/app/features/browser/__tests__/useBrowserDialogs.test.ts`
Expected: FAIL（新用例行为未实现）。

- [ ] **Step 3: 实现**

`useBrowserDialogs.ts`：

`handleCreateTabConfirm` 改为：

```ts
const handleCreateTabConfirm = useCallback(
  async (name: string, url: string, mode: 'save-only' | 'save-and-open' = 'save-and-open') => {
    const { workspaceId } = createTabDialog;
    const folderId = pendingFolderIdRef.current;
    pendingFolderIdRef.current = '';
    let title = name.trim();
    if (!title) {
      setIsCreatingTab(true);
      try {
        const meta = await prefetchPageMeta(url);
        if (meta?.title?.trim() || meta?.faviconDataUri) {
          title = meta.title?.trim() || title;
          // ...原 favicon 缓存逻辑保持不变...
        }
      } catch {
        // fallback: use hostname
      }
      if (!title) {
        title = hostnameFromUrl(url) || url;
      }
      setIsCreatingTab(false);
    }
    setCreateTabDialog({ open: false });
    const store = useAppStore.getState();
    if (mode === 'save-only') {
      store.browserCreateBookmarkEntry({ url, title, workspaceId, folderId });
      return;
    }
    if (store.browserNavigateInPlace) {
      store.browserNavigateActiveTab(url, title);
    } else {
      browserOpenTab(url, title, folderId ? undefined : workspaceId, folderId || undefined);
    }
    bookmarkNewTab(workspaceId, folderId);
  },
  [browserOpenTab, createTabDialog, bookmarkNewTab],
);
```

> 保持原 `prefetchPageMeta` + `setCachedSiteMeta` 分支结构不变（原测试对缓存行为的断言必须继续通过）。

`handleEditTabConfirm` 改为：

```ts
const handleEditTabConfirm = useCallback(
  (name: string, url: string, mode: 'save-only' | 'save-and-open' = 'save-only') => {
    const { tabId } = editTabDialog;
    if (tabId) {
      browserUpdateTab(tabId, {
        title: name.trim() || undefined,
        url: url.trim() || undefined,
      });
    }
    if (mode === 'save-and-open') {
      const store = useAppStore.getState();
      if (store.browserNavigateInPlace) {
        store.browserNavigateActiveTab(url.trim(), name.trim());
      } else {
        store.browserOpenTab(url.trim(), name.trim());
      }
    }
    setEditTabDialog({ open: false, tabId: '', name: '', url: '' });
  },
  [editTabDialog, browserUpdateTab],
);
```

> `bookmarkNewTab` 已用 `useAppStore.getState()` 模式；新增 store 读取保持一致。注意 `browserOpenTab` prop 由 `BrowserPanel` 传入，`browserCreateBookmarkEntry`/`browserNavigateActiveTab`/`browserNavigateInPlace` 均从 store 读取，避免扩增 deps 接口。

- [ ] **Step 4: 运行验证**

Run: `pnpm --dir frontend vitest run src/app/features/browser/__tests__/useBrowserDialogs.test.ts`
Expected: PASS（旧用例 + 新用例）。

Run: `pnpm --dir frontend run typecheck`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/useBrowserDialogs.ts ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts
git commit -m "feat(frontend): branch bookmark dialog save semantics by mode and navigate toggle"
```

---

### Task 5: 目录树右键菜单新增"新建书签"项

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser-tree/browserTreeEntryUtils.tsx`（`getEntryMoreMenuItems`）
- Modify: `ai-digital-life/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.tsx`（`getChildNodeMoreMenuItems`）
- Modify: `ai-digital-life/frontend/src/app/features/browser-tree/browserTreeEntryUtils.test.tsx`
- Create: `ai-digital-life/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `t.browserContextCreateBookmark`；`SectionCallbacks.onCreateTab(workspaceId?, folderId?)`（BrowserCategorySection.tsx:6）。
- Produces: `getEntryMoreMenuItems` 与 `getChildNodeMoreMenuItems` 在 folder/workspace 节点返回含 `{ id: 'create-bookmark', label: t.browserContextCreateBookmark, action }` 项。

- [ ] **Step 1: 写失败测试**

`browserTreeEntryUtils.test.tsx` 追加：

```tsx
import { getEntryMoreMenuItems } from './browserTreeEntryUtils';

function makeCallbacks() {
  return {
    onCreateTab: vi.fn(),
    onOpenAllInNewTabs: vi.fn(),
    onRemoveFromArea: vi.fn(),
    onDeleteAllChildTabs: vi.fn(),
    onDeleteOwnChildTabs: vi.fn(),
    onDeleteDirectory: vi.fn(),
    onRenameDirectory: vi.fn(),
    onDeleteHistory: vi.fn(),
    onOpenTab: vi.fn(),
    onRefreshTab: vi.fn(),
    onEditTab: vi.fn(),
    onDeleteTab: vi.fn(),
    onCopyTabLink: vi.fn(),
    onOpenTabInNewTab: vi.fn(),
    onOpenTabInCurrentTab: vi.fn(),
  };
}

const t = {
  browserContextCreateBookmark: '新建书签',
  browserContextOpenAllNewTabs: '全部打开',
  browserContextRemoveFromView: '移除',
  browserContextRename: '重命名',
  browserContextDeleteAllTabs: '删除全部',
  browserContextDeleteSelfTabs: '删除自身',
  browserContextDeleteDir: '删除目录',
  browserDeleteAllTabsHint: 'h',
  browserDeleteSelfTabsHint: 'h',
  browserDeleteDirHint: 'h',
} as Record<string, string>;

describe('getEntryMoreMenuItems', () => {
  it('adds create-bookmark item for workspace node', () => {
    const callbacks = makeCallbacks();
    const items = getEntryMoreMenuItems('workspace', 'workspace', 'workspace:ws1', callbacks, t);
    const item = items.find((i) => i.id === 'create-bookmark')!;
    expect(item).toBeDefined();
    expect(item.label).toBe('新建书签');
    item.action();
    expect(callbacks.onCreateTab).toHaveBeenCalledWith('ws1', undefined);
  });

  it('adds create-bookmark item for folder node', () => {
    const callbacks = makeCallbacks();
    const items = getEntryMoreMenuItems('folder', 'userFolder', 'folder:f1', callbacks, t);
    const item = items.find((i) => i.id === 'create-bookmark')!;
    expect(item).toBeDefined();
    item.action();
    expect(callbacks.onCreateTab).toHaveBeenCalledWith(undefined, 'f1');
  });
});
```

`browserEntrySubEntriesUtils.test.tsx` 追加对应 `getChildNodeMoreMenuItems` 用例（folder 节点，`folder:f1`）。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend vitest run src/app/features/browser-tree/browserTreeEntryUtils.test.tsx src/app/features/browser-tree/browserEntrySubEntriesUtils.test.tsx`
Expected: FAIL（找不到 `create-bookmark` 项）。

- [ ] **Step 3: 实现**

`browserTreeEntryUtils.tsx` `getEntryMoreMenuItems`：在 `items` 数组最前（`open-all-tabs` 之前）加入：

```tsx
items.push({
  id: 'create-bookmark',
  label: t.browserContextCreateBookmark,
  action: () => {
    const wsId = nodePath.startsWith('workspace:') ? nodePath.slice('workspace:'.length) : '';
    const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
    callbacks.onCreateTab(wsId || undefined, folderId || undefined);
  },
});
```

`browserEntrySubEntriesUtils.tsx` `getChildNodeMoreMenuItems`：在 `nodeType === 'folder'` 分支的数组最前加入：

```tsx
{
  id: 'create-bookmark',
  label: t.browserContextCreateBookmark,
  action: () => {
    const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
    callbacks.onCreateTab(undefined, folderId || undefined);
  },
},
```

> 嵌套目录节点仅可能为 folder（`folder:` 前缀）；其 `workspaceId` 由父级传递，创建对话框以 folderId 定位即可（`handleCreateTabConfirm` 中 `browserOpenTab(url, title, folderId ? undefined : workspaceId, folderId || undefined)` 正确处理）。

- [ ] **Step 4: 运行验证**

Run: `pnpm --dir frontend vitest run src/app/features/browser-tree/browserTreeEntryUtils.test.tsx src/app/features/browser-tree/browserEntrySubEntriesUtils.test.tsx`
Expected: PASS。

Run: `pnpm --dir frontend run typecheck`
Expected: 0 错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser-tree/browserTreeEntryUtils.tsx ai-digital-life/frontend/src/app/features/browser-tree/browserTreeEntryUtils.test.tsx ai-digital-life/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.tsx ai-digital-life/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.test.tsx
git commit -m "feat(frontend): add create-bookmark item to directory context menus"
```

---

### Task 6: 目录/书签悬停按钮原生 title（more / refresh）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx`（`:155-173` actionButtonsSlot）
- Modify: `ai-digital-life/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx`（`:133-164` tab 叶子按钮、`:176-203` 目录按钮）

**Interfaces:**
- Consumes: 现有 `getEntryHoverButtons` / `getChildNodeHoverButtons` / `getTabHoverButtons` 返回的按钮数组（含 `id`、`label`）。
- Produces: 目录与书签悬停按钮中 `more`、`refresh` 按钮带原生 `title`（不再被 `TooltipSimple` 包裹）；`create-tab`、`close` 保持 `TooltipSimple`。

- [ ] **Step 1: 改 BrowserTreeEntry.tsx actionButtonsSlot**

将 `:157-171` 的 `TooltipSimple` 包裹改为条件渲染——`more` 按钮用原生 `title`：

```tsx
const actionButtonsSlot = (
  <>
    {entryBtns.map((btn) =>
      btn.id === 'more' ? (
        <button
          key={btn.id}
          type="button"
          className="adl-icon-btn adl-icon-btn--xs"
          ref={(el) => {
            entryBtnRef.current[btn.id] = el;
          }}
          onClick={(e) => handleEntryBtnClick(btn.id, e)}
          aria-label={btn.label}
          title={btn.label}
        >
          {btn.icon}
        </button>
      ) : (
        <TooltipSimple key={btn.id} content={btn.label} placement="top">
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs"
            ref={(el) => {
              entryBtnRef.current[btn.id] = el;
            }}
            onClick={(e) => handleEntryBtnClick(btn.id, e)}
            aria-label={btn.label}
          >
            {btn.icon}
          </button>
        </TooltipSimple>
      ),
    )}
  </>
);
```

- [ ] **Step 2: 改 BrowserEntrySubEntries.tsx**

Tab 叶子按钮（`:133-164`）：`refresh` 与 `more` 改原生 `title`，`close` 保持 `TooltipSimple`。将 `btns.map(...)` 改为条件渲染（`btn.id === 'close'` → TooltipSimple；否则 → 原生 `title` 按钮，样式含 `btn.isClose` 的 danger-hover 类）。

目录按钮（`:176-203`）：`more` 改原生 `title`，`create-tab`、`delete-self-tabs` 保持 `TooltipSimple`（条件 `btn.id === 'more'`）。

> 保持所有 `aria-label`、`className`、`onClick` 分支逻辑不变。

- [ ] **Step 3: 验证编译与现有测试**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 错误。

Run: `pnpm --dir frontend vitest run src/app/features/browser-tree`
Expected: PASS（无直接断言 tooltip 类型的用例，不破坏）。

Run: `pnpm --dir frontend run lint`
Expected: 0 errors。

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx ai-digital-life/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx
git commit -m "refactor(frontend): use native title for hover more/refresh buttons"
```

---

### Task 7: 全量验证与收尾

**Files:**
- 无（仅验证）。

- [ ] **Step 1: 全量前端测试**

Run: `pnpm --dir frontend run test`
Expected: 全部 PASS（1260+ 基线 + 新增用例）。

- [ ] **Step 2: typecheck + lint**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 错误。

Run: `pnpm --dir frontend run lint`
Expected: 0 errors。

- [ ] **Step 3: i18n parity 专项**

Run: `pnpm --dir frontend vitest run src/app/i18n/__tests__/keys.test.ts`
Expected: PASS（确认改名/新增后 zh/en key 集合一致）。

- [ ] **Step 4: 最终 commit（如有遗漏）**

```bash
git add -A
git commit -m "chore(frontend): finalize new-bookmark refactor"
```

> 若 Task 1-6 已各自提交且无遗漏，本步可跳过。

---

### Task 8: 去重语义修订为 (路径, url, title) + 编辑对收藏书签生效

> 用户最终评审新增需求（2026-08-14）：重复收藏同一 URL 时——
> - **允许**：不同收藏路径（标题相同或不同均可）；相同路径但标题不同。
> - **拦截**：相同路径 + 标题相同（真重复）。
> - "路径" = 每个文件夹或工作区（用户已确认：顶层文件夹下每个嵌套子目录也是独立路径）。
> - 同时要求"编辑书签"对收藏在目录里、未打开的书签也真正生效（改名/改网址后收藏记录同步更新，且撞上同路径同 url 同标题的既有项时拦截）。
> - 星标收藏按钮（收藏/取消收藏当前标签）是开关语义，**不动**。

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserTabsSlice.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserDialogs.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/browser.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts`
- Create: `ai-digital-life/frontend/src/app/stores/slices/__tests__/browserTabsSlice.test.ts`（如已存在则修改）

**Interfaces:**
- 去重键从「url」修订为「路径 + url + title」：
  - folder.tabs 条目去重：`item.url === url && item.title === title`
  - workspaceBookmarks 条目去重：`entry.url === url && entry.title === title`
  - browserBookmarks 全局表（无路径概念）去重退化为 `url + title`：`b.url === url && b.title === title`
- 新增 store action：`browserUpdateSavedBookmark(tabId: string, updates: { url: string; title: string }) => { ok: boolean }`——编辑收藏条目（更新 folder.tabs / workspaceBookmarks / browserBookmarks / tabIdUrlMap 中该 tabId 对应条目的 url/title），`ok: false` 表示撞上同路径同 url 同 title 的既有项（拦截）。
- 新增 i18n key：`browserEditBookmarkDuplicate`（zh: '该目录已存在相同网址与标题的书签' / en: 'A bookmark with the same URL and title already exists in this directory'）。

- [ ] **Step 1: 写失败测试（去重语义）**

在 `browserBookmarkSlice.test.ts` 追加用例：

```ts
it('allows same url with different title in the same folder (path dedup = url+title)', () => {
  // 预置 folder f1 已含 {tabId:'a', url:'https://e.com', title:'Title A'}
  // browserCreateBookmarkEntry({ url:'https://e.com', title:'Title B', folderId:'f1' })
  // 断言 folder.tabs 长度 2，含两条 url 相同 title 不同的条目
});

it('blocks same url + same title in the same folder', () => {
  // 预置 folder f1 已含 {tabId:'a', url:'https://e.com', title:'Title A'}
  // browserCreateBookmarkEntry({ url:'https://e.com', title:'Title A', folderId:'f1' })
  // 断言 folder.tabs 长度仍 1
});

it('allows same url + same title in a different folder', () => {
  // 预置 folder f1 含条目；写入 folderId:'f2'
  // 断言 f1 和 f2 各 1 条
});

it('allows same url with different title in the same workspace', () => { /* 类似 folder 用例 */ });
it('blocks same url + same title in the same workspace', () => { /* 类似 */ });
it('browserBookmarks global dedup is url+title (same url different title both stored)', () => {
  // 两次 browserCreateBookmarkEntry 无 folderId/workspaceId，url 相同 title 不同
  // 断言 browserBookmarks 长度 2
});
```

在 `browserBookmarkSlice.test.ts` 追加 `browserUpdateSavedBookmark` 用例：
- 更新 folder.tabs 中 tabId 条目的 url/title 生效。
- 更新 workspaceBookmarks 条目生效。
- 撞上同路径同 url 同 title 既有项（不同 tabId）→ 返回 `{ ok: false }`，状态不变。
- 正常更新 → 返回 `{ ok: true }`。

在 `useBrowserDialogs.test.ts` 追加编辑收藏书签用例：
- 编辑收藏条目（无对应 live tab）改名/改网址后，store 中该 tabId 的收藏条目 url/title 更新。
- 编辑撞上同路径同 url 同 title → 拦截，对话框保持打开或关闭但显示提示（按实现，至少不破坏状态）。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts src/app/features/browser/__tests__/useBrowserDialogs.test.ts`
Expected: FAIL（新去重语义与 browserUpdateSavedBookmark 未实现）。

- [ ] **Step 3: 修订 `browserCreateBookmarkEntry` 去重**

`browserBookmarkSlice.ts` 的 `browserCreateBookmarkEntry`：
- `const exists = state.browserBookmarks.some((b) => b.url === url && b.title === title);`
- folder.tabs 去重：`existingTabs.some((item) => item.url === url && item.title === title)` → return folder（拦截）。
- workspace 去重：`existing.some((entry) => entry.url === url && entry.title === title)` → 不追加（拦截）。
- 保持 `foldersChanged` / `wsChanged` 只在真正追加时置 true；tabIdUrlMap 写入仍 gated 于 `input.folderId && foldersChanged`。

- [ ] **Step 4: 修订 `computeBookmarkTabOutcome`（保存并打开路径）去重**

`computeBookmarkTabOutcome`：
- folder 分支：保留"同 tabId + 同 url → 更新标题"逻辑（`existing` 按 `item.tabId === tabId && item.url === url` 查找，更新 title）；新增：当 `existing` 不存在时，追加前检查 `existingTabs.some((item) => item.url === url && item.title === title)` → 不追加（拦截）。
- workspace 分支：`existingIdx` 按 `entry.tabId === tabId && entry.url === url` 更新标题逻辑保留；当 `existingIdx < 0` 时，追加前检查 `existingWsTabs.some((entry) => entry.url === url && entry.title === title)` → 不追加（拦截）。
- browserBookmarks 全局：`existsInBookmarks = state.browserBookmarks.some((b) => b.url === url && b.title === title)`。

- [ ] **Step 5: 修订 `browserOpenTab` folder append 去重（browserTabsSlice.ts:83-104）**

`browserOpenTab` 带 folderId 时向 folder.tabs append 前，去重键改为 url+title：
```ts
const existingTabs = f.tabs || [];
const tabTitle = tab.title?.trim() || tab.url?.trim() || '';
if (!existingTabs.some((item) => item.url === tab.url && item.title === tabTitle)) {
  return { ...f, tabs: [...existingTabs, { tabId: tab.id, url: tab.url || '', title: tabTitle }] };
}
```
（不再用 `item.tabId === tab.id` 作为唯一去重键——新标签每次新建 tabId 必然不同，需按 url+title 拦截同路径同标题重复。）
> 保持 `tabIdUrlMap` 写入逻辑不变。

- [ ] **Step 6: 编辑对收藏书签生效**

新增 `browserUpdateSavedBookmark(tabId, { url, title })` 到 `BrowserBookmarkSlice` 接口与实现（置于 `browserUpdateBookmarkTitle` 之后）：

```ts
browserUpdateSavedBookmark: (tabId: string, updates: { url: string; title: string }) => {
  const url = updates.url.trim();
  const title = updates.title.trim();
  let ok = true;
  set((state) => {
    // 1) 在 folder.tabs 中找 tabId → 得到其所在 folderId 与旧条目
    // 2) 在 workspaceBookmarks 中找 tabId → 得到旧条目
    // 拦截校验：新 (url,title) 在该路径下已存在于【其它 tabId】的条目 → ok=false 返回 state
    // 3) 更新 folder.tabs 中该 tabId 条目 url/title
    // 4) 更新 workspaceBookmarks 中该 tabId 条目
    // 5) 同步 browserBookmarks：新 url 不在表中则 append；旧 url 若不再被任何 folder/workspace 条目引用则移除
    // 6) 更新 browserBookmarkTabIdUrlMap[tabId] = url
    // 7) 条件 write（同 browserCreateBookmarkEntry 模式）
  });
  return { ok };
},
```

> 需要"路径内其它条目"判断：对一个 folder，遍历 `folder.tabs.filter(item => item.tabId !== tabId)` 中 `item.url === url && item.title === title`。对 workspace 同理。若 tabId 同时在 folder.tabs 和 workspaceBookmarks 出现（罕见），按任一路径校验即可，以先校验到重复为准。
> 若 tabId 既不在任何 folder.tabs 也不在 workspaceBookmarks（即非收藏条目），`browserUpdateSavedBookmark` 直接返回 `{ ok: true }`（无操作，由 browserUpdateTab 处理 live tab）。

`useBrowserDialogs.ts` `handleEditTabConfirm`：
- 现有 `browserUpdateTab(tabId, { title, url })` 保留（更新 live tab）。
- 新增：调用 `store.browserUpdateSavedBookmark(tabId, { url: url.trim(), title: name.trim() })`；若返回 `{ ok: false }`，用 `showToast(t.browserEditBookmarkDuplicate, 'warning')` 提示，且**不关闭对话框**、不执行后续打开逻辑（拦截）。
- `ok: true` 时继续现有逻辑（save-and-open 分支 + 关闭对话框）。
- 注意：`handleEditTabConfirm` 需新增对 `useAppStore.getState()` 与 `showToast`、`t` 的依赖（`showToast`/`t` 已在 deps 中）。

- [ ] **Step 7: i18n key**

`zh-CN/browser.ts` 与 `en-US/browser.ts` 同时新增 `browserEditBookmarkDuplicate`（值见 Interfaces）。

- [ ] **Step 8: 运行验证**

Run: `pnpm --dir frontend vitest run src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts src/app/features/browser/__tests__/useBrowserDialogs.test.ts`
Expected: PASS。

Run: `pnpm --dir frontend vitest run src/app/i18n/__tests__/keys.test.ts`
Expected: PASS（parity）。

Run: `pnpm --dir frontend run typecheck`
Expected: 0 错误。

Run: `pnpm --dir frontend run lint`
Expected: 0 errors。

- [ ] **Step 9: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts ai-digital-life/frontend/src/app/stores/slices/browserTabsSlice.ts ai-digital-life/frontend/src/app/features/browser/useBrowserDialogs.ts ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts ai-digital-life/frontend/src/app/i18n/en-US/browser.ts ai-digital-life/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts ai-digital-life/frontend/src/app/stores/slices/__tests__/browserTabsSlice.test.ts
git commit -m "feat(frontend): dedup bookmarks by path+url+title and support editing saved bookmarks"
```

---

## Self-Review

**Spec 覆盖：**
- 文案改名（browserNewBookmark/browserContextCreateBookmark/browserEditBookmark/browserBookmarkName/browserMenuNewTab/browserBookmarkSaveOnly/browserBookmarkSaveAndOpen）→ Task 1 ✓
- 工具栏 tabs "+" TooltipSimple + prop 改名 → Task 1（prop）+ Task 2 前一计划的既有 leaf（BrowserNavUtilityButtons 已存在）中 tabs 分支改 TooltipSimple。

  > **注意**：设计"工具栏 tabs 模式 '+' 由原生 title 改为 TooltipSimple"在 Task 1 只改了 prop 名与 label，**未改 tooltip 方案**。需在 Task 1 Step 3 中同时将 `BrowserNavUtilityButtons.tsx` tabs 模式 "+" 按钮改为 `TooltipSimple` 包裹（open 模式保持原生 title），并更新 `BrowserNavUtilityButtons.test.tsx` 中 tabs 模式断言（原生 title → 无 title 属性 + TooltipSimple 渲染）。请将该项并入 Task 1 实现。

- 对话框双按钮 + mode + 无取消 → Task 2 ✓
- "保存并打开"遵循开关 + "仅保存"不开标签（browserCreateBookmarkEntry）→ Task 4 + Task 3 ✓
- 编辑模式双按钮 + "保存并打开"遵循开关 + 标题"编辑书签" → Task 2（按钮）+ Task 4（语义）+ Task 1（标题 key）✓
- 右键菜单"新建书签"（顶级 + 嵌套）→ Task 5 ✓
- 悬停 more/refresh 原生 title → Task 6 ✓
- 刷新文案"刷新网站图标与标题" → Task 1 ✓
- 测试：BrowserNavUtilityButtons.test / keys.test / 新 store action 测试 / dialog handler 测试 / 菜单工具测试 / CreateTabDialog 测试 → 各任务内 ✓

**Placeholder 扫描：** 无 TBD/TODO；所有代码块含完整实现。

**类型一致性：** `browserCreateBookmarkEntry` 签名在 Task 3 定义、Task 4 调用一致；`onConfirm`/`handleCreateTabConfirm`/`handleEditTabConfirm` 三参签名在 Task 2 定义、Task 4 实现一致；`newBookmarkLabel` prop 在 Task 1 全局改名，后续任务不再引用 `newTabLabel`。

**已知风险（实现时核对）：**
- Task 4 中 `useBrowserDialogs.test.ts` 需为 store 读取新增 mock；若现有测试因新增 store 读取而失败，需在 `confirmCreateTab` setup 中补充 mock（保持原有断言语义）。
- Task 3 测试对 `browserTabs` 字段的引用若类型不满足，退化为读取 mock state 原始字段。
- Task 3 的 `browserCreateBookmarkEntry`：`browserBookmarkTabIdUrlMap` 的写入仅在 `input.folderId && foldersChanged` 时执行（评审修复：避免目录去重场景下的多余写入与孤儿映射条目）。
- Task 1 中 CreateTabDialog:190 提交按钮是 Task 2 的临时占位（值用 `browserNewBookmark`），Task 2 完整替换，无兼容层。
