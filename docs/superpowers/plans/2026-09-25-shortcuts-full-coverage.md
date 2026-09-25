# 快捷键全量纳入自定义 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将标题栏菜单、工具切换、缩放、文件右键菜单中的 11 个展示型快捷键变为真实可自定义命令（共 14 命令 / 5 组），并删除死功能项。

**Architecture:** 命令定义集中在 `defaultCommands.ts`；全局 10 个经扩展后的 `useKeyboardShortcuts` 派发（zoom 函数上提到共享 hook）；文件组 4 个经 FilesPanel 内 scoped hook 派发（读本地选中态）；所有展示处（菜单/tooltip/右键菜单）从 store keybinds 经 `formatKeybind` 派生。

**Tech Stack:** React 19 + TypeScript + Zustand + Vitest + ESLint (flat) + `tsc --noEmit`; pnpm (frontend) / Cargo workspace (rust untouched).

**Spec:** `docs/superpowers/specs/2026-09-25-shortcuts-full-coverage-design.md`

## Global Constraints

- 所有 UI 文本走 i18n key，禁止硬编码（含 aria-label/title/占位符）。
- 中英 `menu.ts` / `settings.ts` key 集必须保持一致（`CopyKey = keyof zhCN`）。
- 不新增 IPC / Tauri Command；纯前端偏好字段，双端一致。
- Conventional Commit：`type(scope): summary`。
- 每任务 TDD：先失败测试 → 实现 → 转绿 → commit；`tsc` + `eslint` 零警告。
- 测试命令（工作目录 `ai-digital-life/`）：`pnpm --dir frontend run test --run <path>`；类型检查与 lint 工作目录 `ai-digital-life/frontend/`：`npx tsc --noEmit`，`npx eslint <files>`。

---

### Task 1: 命令定义 + 分组 + i18n（地基）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/commands/defaultCommands.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/menu.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/menu.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/settings.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/settings.ts`
- Test: `ai-digital-life/frontend/src/shared/defaultPreferences.test.ts`（已存在，追加断言）

**Interfaces:**
- Produces: `CommandGroup = 'general' | 'navigation' | 'view' | 'zoom' | 'file'`；`DEFAULT_COMMANDS` 共 14 条；`DEFAULT_KEYBINDS` 自动派生（含 13 条，`file.toggle-line-numbers` 无默认键被排除）。

- [ ] **Step 1: Write the failing test.** 在 `defaultPreferences.test.ts` 末尾追加：

```ts
it('exposes 14 customizable commands with stable defaults', () => {
  expect(DEFAULT_KEYBINDS['view.terminal']).toBe('mod+shift+`');
  expect(DEFAULT_KEYBINDS['zoom.in']).toBe('mod+shift+plus');
  expect(DEFAULT_KEYBINDS['zoom.out']).toBe('mod+-');
  expect(DEFAULT_KEYBINDS['zoom.reset']).toBe('mod+0');
  expect(DEFAULT_KEYBINDS['file.copy-relative']).toBe('mod+shift+c');
  expect(DEFAULT_KEYBINDS['file.copy-full']).toBe('mod+alt+c');
  expect(DEFAULT_KEYBINDS['file.toggle-word-wrap']).toBe('alt+z');
  expect(DEFAULT_KEYBINDS['file.toggle-line-numbers']).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/shared/defaultPreferences.test.ts`（工作目录 `ai-digital-life/`）
Expected: FAIL（`view.terminal` 等键不存在）

- [ ] **Step 3: Write minimal implementation.** `defaultCommands.ts` 全文替换为：

```ts
import type { CopyKey } from '../i18n/types';

export type CommandGroup = 'general' | 'navigation' | 'view' | 'zoom' | 'file';

export interface CommandMeta {
  id: string;
  titleKey: CopyKey;
  group: CommandGroup;
  defaultKeybind?: string;
}

export const DEFAULT_COMMANDS: CommandMeta[] = [
  {
    id: 'workspace.new',
    titleKey: 'commandWorkspaceNew',
    group: 'navigation',
    defaultKeybind: 'mod+n',
  },
  {
    id: 'workspace.open',
    titleKey: 'commandWorkspaceOpen',
    group: 'navigation',
    defaultKeybind: 'mod+o',
  },
  {
    id: 'settings.open',
    titleKey: 'commandSettingsOpen',
    group: 'general',
    defaultKeybind: 'mod+shift+comma',
  },
  {
    id: 'view.files',
    titleKey: 'menuOpenFilePanel',
    group: 'view',
    defaultKeybind: 'mod+shift+e',
  },
  {
    id: 'view.changes',
    titleKey: 'menuOpenChangesPanel',
    group: 'view',
    defaultKeybind: 'mod+shift+g',
  },
  {
    id: 'view.browser',
    titleKey: 'menuOpenBrowserPanel',
    group: 'view',
    defaultKeybind: 'mod+shift+b',
  },
  {
    id: 'view.terminal',
    titleKey: 'menuOpenTerminalPanel',
    group: 'view',
    defaultKeybind: 'mod+shift+`',
  },
  {
    id: 'zoom.in',
    titleKey: 'menuZoomIn',
    group: 'zoom',
    defaultKeybind: 'mod+shift+plus',
  },
  {
    id: 'zoom.out',
    titleKey: 'menuZoomOut',
    group: 'zoom',
    defaultKeybind: 'mod+-',
  },
  {
    id: 'zoom.reset',
    titleKey: 'menuResetZoom',
    group: 'zoom',
    defaultKeybind: 'mod+0',
  },
  {
    id: 'file.copy-relative',
    titleKey: 'fileCopyRelativePath',
    group: 'file',
    defaultKeybind: 'mod+shift+c',
  },
  {
    id: 'file.copy-full',
    titleKey: 'fileCopyFullPath',
    group: 'file',
    defaultKeybind: 'mod+alt+c',
  },
  {
    id: 'file.toggle-word-wrap',
    titleKey: 'fileWordWrap',
    group: 'file',
    defaultKeybind: 'alt+z',
  },
  {
    id: 'file.toggle-line-numbers',
    titleKey: 'fileLineNumbers',
    group: 'file',
  },
];
```

`titleKey` 复用依据（均已存在，无需新建）：`menuOpen*Panel` 见本任务 menu.ts 改动；
`fileCopyRelativePath / fileCopyFullPath / fileLineNumbers / fileWordWrap` 在
`i18n/zh-CN/file.ts:78-81` 与 `en-US/file.ts:78-81` 均存在。

`zh-CN/menu.ts` 改动：新增 `menuOpenFilePanel: '打开 · 文件面板'`、
`menuOpenChangesPanel: '打开 · 变更面板'`、`menuOpenBrowserPanel: '打开 · 浏览器面板'`、
`menuOpenTerminalPanel: '打开 · 终端面板'`；删除 `menuNewBrowser`、`menuOpenEditorWindow`、
`menuDiffView`、`menuBrowserView`、`menuFileView`、`menuTerminalView`、`menuCommandPalette`
（`menuNewTerminal` 保留，终端新建会话按钮在用）。`en-US/menu.ts` 做镜像改动：
`'Open File Panel'`、`'Open Changes Panel'`、`'Open Browser Panel'`、`'Open Terminal Panel'`，
删除同样 7 个 key。

`zh-CN/settings.ts` 快捷键区追加：`settingsShortcutsGroupView: '视图'`、
`settingsShortcutsGroupZoom: '缩放'`、`settingsShortcutsGroupFile: '文件'`；
`en-US/settings.ts` 追加：`'View'`、`'Zoom'`、`'File'`。

- [ ] **Step 4: Run test to verify it passes.**

Run: `pnpm --dir frontend run test --run src/shared/defaultPreferences.test.ts`（工作目录 `ai-digital-life/`）
Expected: PASS

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/commands/defaultCommands.ts ai-digital-life/frontend/src/app/i18n/zh-CN/menu.ts ai-digital-life/frontend/src/app/i18n/en-US/menu.ts ai-digital-life/frontend/src/app/i18n/zh-CN/settings.ts ai-digital-life/frontend/src/app/i18n/en-US/settings.ts ai-digital-life/frontend/src/shared/defaultPreferences.test.ts
git commit -m "feat(shortcuts): add view/zoom/file commands and menu i18n"
```

---

### Task 2: 全局派发扩展（view/zoom）+ 导出命令匹配器

**Files:**
- Modify: `ai-digital-life/frontend/src/app/hooks/useKeyboardShortcuts.ts`
- Test: Create `ai-digital-life/frontend/src/app/hooks/useKeyboardShortcuts.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `DEFAULT_COMMANDS` / `CommandMeta`。
- Produces: 导出的 `findMatchingCommand(event, commands, keybinds)`（供 Task 8 scoped hook 复用）；
  扩展后的 `ActionCallbacks`（新增 7 个回调，见 Step 3）。

- [ ] **Step 1: Write the failing test.** 新建 `useKeyboardShortcuts.test.ts`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppStore } from '../stores/slicedStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { findMatchingCommand } from './useKeyboardShortcuts';
import { DEFAULT_COMMANDS } from '../commands/defaultCommands';

function dispatchKey(key: string, opts: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useKeyboardShortcuts extended dispatch', () => {
  it('dispatches view.terminal on Ctrl+Shift+`', () => {
    const onOpenTerminalView = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({
        openCreateWorkspaceDialog: vi.fn(),
        openWorkspace: vi.fn(),
        openSettings: vi.fn(),
        openFilesView: vi.fn(),
        openChangesView: vi.fn(),
        openBrowserView: vi.fn(),
        openTerminalView: onOpenTerminalView,
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        resetZoom: vi.fn(),
      }),
    );
    dispatchKey('`', { ctrlKey: true, shiftKey: true });
    expect(onOpenTerminalView).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('dispatches zoom.in on Ctrl+Shift+= (plus key)', () => {
    const zoomIn = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({
        openCreateWorkspaceDialog: vi.fn(),
        openWorkspace: vi.fn(),
        openSettings: vi.fn(),
        openFilesView: vi.fn(),
        openChangesView: vi.fn(),
        openBrowserView: vi.fn(),
        openTerminalView: vi.fn(),
        zoomIn,
        zoomOut: vi.fn(),
        resetZoom: vi.fn(),
      }),
    );
    dispatchKey('+', { ctrlKey: true, shiftKey: true });
    expect(zoomIn).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('findMatchingCommand is exported and reusable', () => {
    const match = findMatchingCommand(
      new KeyboardEvent('keydown', { key: '0', ctrlKey: true }),
      DEFAULT_COMMANDS,
      {},
    );
    expect(match?.id).toBe('zoom.reset');
  });
});
```

注意：`useKeyboardShortcuts` 内部经 `useAppStore` 读 keybinds，默认 fallback
`EMPTY_KEYBINDS` 即走 `defaultKeybind`，无需预置 store。

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/app/hooks/useKeyboardShortcuts.test.ts`
Expected: FAIL（文件不存在 / 回调类型缺失 / `findMatchingCommand` 未导出）

- [ ] **Step 3: Write minimal implementation.** 对 `useKeyboardShortcuts.ts` 做三处改动
（其余 1-6 行、19-50 行 `findMatchingCommand` 函数体、`useKeyboardShortcuts` effect 体不动）：

```ts
export interface ActionCallbacks {
  openCreateWorkspaceDialog: () => void;
  openWorkspace: () => void;
  openSettings: () => void;
  openFilesView: () => void;
  openChangesView: () => void;
  openBrowserView: () => void;
  openTerminalView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

const COMMAND_HANDLERS: Record<string, (callbacks: ActionCallbacks) => void> = {
  'workspace.new': (cb) => cb.openCreateWorkspaceDialog(),
  'workspace.open': (cb) => cb.openWorkspace(),
  'settings.open': (cb) => cb.openSettings(),
  'view.files': (cb) => cb.openFilesView(),
  'view.changes': (cb) => cb.openChangesView(),
  'view.browser': (cb) => cb.openBrowserView(),
  'view.terminal': (cb) => cb.openTerminalView(),
  'zoom.in': (cb) => cb.zoomIn(),
  'zoom.out': (cb) => cb.zoomOut(),
  'zoom.reset': (cb) => cb.resetZoom(),
};
```

并将 `function findMatchingCommand(` 改为 `export function findMatchingCommand(`。

- [ ] **Step 4: Run test to verify it passes.**

Run: `pnpm --dir frontend run test --run src/app/hooks/useKeyboardShortcuts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/hooks/useKeyboardShortcuts.ts ai-digital-life/frontend/src/app/hooks/useKeyboardShortcuts.test.ts
git commit -m "feat(shortcuts): dispatch view/zoom commands globally"
```

---

### Task 3: zoom 上提为共享 hook，TitleBar 行为不变接入

**Files:**
- Create: `ai-digital-life/frontend/src/app/hooks/useAppZoom.ts`
- Modify: `ai-digital-life/frontend/src/app/regions/TitleBar.tsx`（删除本地 zoomBy/resetZoom，改用 hook）
- Test: Create `ai-digital-life/frontend/src/app/hooks/useAppZoom.test.ts`

**Interfaces:**
- Produces: `useAppZoom(): { zoomBy: (delta: number) => void; resetZoom: () => void }`
 （与 TitleBar 原本地实现逐行同语义）。

- [ ] **Step 1: Write the failing test.** 新建 `useAppZoom.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppZoom } from './useAppZoom';

describe('useAppZoom', () => {
  it('zooms in/out around 1 and clamps to [0.5, 2], reset restores 1', () => {
    document.documentElement.style.zoom = '1';
    const { result, unmount } = renderHook(() => useAppZoom());
    act(() => result.current.zoomBy(0.1));
    expect(document.documentElement.style.zoom).toBe('1.1');
    act(() => result.current.zoomBy(-0.1));
    expect(document.documentElement.style.zoom).toBe('1');
    act(() => result.current.zoomBy(10));
    expect(document.documentElement.style.zoom).toBe('2');
    act(() => result.current.resetZoom());
    expect(document.documentElement.style.zoom).toBe('1');
    unmount();
    document.documentElement.style.zoom = '1';
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/app/hooks/useAppZoom.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation.** 新建 `useAppZoom.ts`
（逐行搬运 `TitleBar.tsx:91-99` 原实现）：

```ts
import { useCallback } from 'react';

export function useAppZoom(): {
  zoomBy: (delta: number) => void;
  resetZoom: () => void;
} {
  const zoomBy = useCallback((delta: number) => {
    const current = parseFloat(getComputedStyle(document.documentElement).zoom || '1');
    const next = Math.max(0.5, Math.min(2, (Number.isFinite(current) ? current : 1) + delta));
    document.documentElement.style.zoom = String(next);
  }, []);
  const resetZoom = useCallback(() => {
    document.documentElement.style.zoom = '1';
  }, []);
  return { zoomBy, resetZoom };
}
```

TitleBar.tsx 改动：删除本地 `zoomBy`/`resetZoom` 的 `useCallback` 定义
（原 91-99 行），改用 `const { zoomBy, resetZoom } = useAppZoom();`，
并在文件顶部相对导入区追加 `import { useAppZoom } from '../hooks/useAppZoom';`。
`useViewMenuItems(t, zoomBy, resetZoom, ...)` 调用行不动。

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm --dir frontend run test --run src/app/hooks/useAppZoom.test.ts src/app/regions/TitleBar.test.tsx`
Expected: PASS（TitleBar 既有行为不变）

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/hooks/useAppZoom.ts ai-digital-life/frontend/src/app/hooks/useAppZoom.test.ts ai-digital-life/frontend/src/app/regions/TitleBar.tsx
git commit -m "refactor(zoom): share useAppZoom between TitleBar and shortcuts"
```

---

### Task 4: App 接线 + 删除命令面板 prop 链

**Files:**
- Modify: `ai-digital-life/frontend/src/app/App.tsx`
- Modify: `ai-digital-life/frontend/src/app/regions/TitleBar.tsx`（props）
- Modify: `ai-digital-life/frontend/src/app/regions/TitleBar.test.tsx`（去掉 mock）
- Test: `ai-digital-life/frontend/src/app/regions/TitleBar.test.tsx`（追加：菜单面板项可达性不断言action，仅快照结构免测；本任务以既有套件转绿为准）

**Interfaces:**
- Consumes: Task 2 的扩展 `ActionCallbacks`、Task 3 的 `useAppZoom`。

- [ ] **Step 1: Write the failing test.** 在 `TitleBar.test.tsx` 追加：

```tsx
it('does not accept onOpenCommandPalette prop (dead palette removed)', () => {
  const props = renderTitleBar();
  expect('onOpenCommandPalette' in props).toBe(false);
});
```

（`renderTitleBar` 的默认 props 对象同步删除 `onOpenCommandPalette: vi.fn(),` 一行，
使本断言先失败。）

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/app/regions/TitleBar.test.tsx`
Expected: FAIL（prop 仍存在 / TitleBarProps 仍声明）

- [ ] **Step 3: Write minimal implementation.**

App.tsx 改动（共 4 处）：
1. 删除 `handleOpenCommandPalette` 的 `useCallback` 定义（原 121-123 行）。
2. `useKeyboardShortcuts({...})` 调用扩为 10 回调：保留原 3 个，追加
   `openFilesView: () => setActiveRightTool('files')`、
   `openChangesView: () => setActiveRightTool('changes')`、
   `openBrowserView: () => setActiveRightTool('browser')`、
   `openTerminalView: () => setActiveRightTool('terminal')`、
   `zoomIn: () => zoomBy(0.1)`、`zoomOut: () => zoomBy(-0.1)`、`resetZoom`
  （`zoomBy/resetZoom` 来自顶层 `const { zoomBy, resetZoom } = useAppZoom();`，
   需在 App 顶部 import 并调用；`setActiveRightTool` 已在 App 订阅）。
3. `<TitleBar ...>` 移除 `onOpenCommandPalette={handleOpenCommandPalette}` 属性。
4. 顶部 import 区追加 `import { useAppZoom } from './hooks/useAppZoom';`。

TitleBar.tsx 改动：`TitleBarProps` 删除 `onOpenCommandPalette: () => void;`；
解构参数删除同名项；`<HamburgerMenu ... onOpenCommandPalette={onOpenCommandPalette} />`
删除该属性（HamburgerMenu 自身 prop 清理见 Task 6）。

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm --dir frontend run test --run src/app/regions/TitleBar.test.tsx src/app/hooks/useKeyboardShortcuts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/App.tsx ai-digital-life/frontend/src/app/regions/TitleBar.tsx ai-digital-life/frontend/src/app/regions/TitleBar.test.tsx
git commit -m "feat(shortcuts): wire view/zoom dispatch in App, drop palette prop"
```

---

### Task 5: 菜单重组 + 显示派生（titleBarMenus）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/titleBarMenus.ts`
- Modify: `ai-digital-life/frontend/src/app/regions/TitleBar.tsx`（builder 调用传 keybinds + 快捷键行 action）
- Test: Create `ai-digital-life/frontend/src/app/regions/titleBarMenus.test.ts`

**Interfaces:**
- Consumes: Task 1 命令/菜单 i18n；store keybinds（调用方传入，`Record<string, string | undefined>`）；
  `formatKeybind`（`../../../shared/keybinds`，相对路径与 `useKeyboardShortcuts.ts` 一致，
  titleBarMenus 位于 `regions/`，故为 `../../shared/keybinds`）。
- Produces: 重组后的三组 builder（签名含 keybinds，shortcut 全派生）。

- [ ] **Step 1: Write the failing test.** 新建 `titleBarMenus.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { useFileMenuItems, useViewMenuItems, useHelpMenuItems } from './titleBarMenus';
import { zhCN } from '../i18n/zh-CN';

const t = zhCN;

describe('titleBarMenus derived shortcuts', () => {
  it('file menu contains only new/open/exit (panels moved to view)', () => {
    const items = useFileMenuItems(t, {}, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(items.map((i) => i.id)).toEqual(['new-ws', 'open-folder', 'sep-1', 'exit']);
  });

  it('view menu hosts the four open-panel rows with derived shortcuts', () => {
    const items = useViewMenuItems(t, {}, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    const ids = items.filter((i) => !i.separator).map((i) => i.id);
    expect(ids).toEqual([
      'open-files-panel',
      'open-changes-panel',
      'open-browser-panel',
      'open-terminal-panel',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'settings',
    ]);
    expect(items.find((i) => i.id === 'open-terminal-panel')?.shortcut).toBe('Ctrl+Shift+`');
    expect(items.find((i) => i.id === 'settings')?.shortcut).toBe('Ctrl+Shift+,');
  });

  it('help menu drops palette, keeps shortcuts row without chord text', () => {
    const items = useHelpMenuItems(t, {}, vi.fn());
    expect(items.map((i) => i.id)).toEqual(['shortcuts', 'license']);
    expect(items.find((i) => i.id === 'shortcuts')?.shortcut).toBeUndefined();
  });

  it('reflects user-customized keybinds', () => {
    const items = useViewMenuItems(t, { 'zoom.reset': 'mod+r' }, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(items.find((i) => i.id === 'zoom-reset')?.shortcut).toBe('Ctrl+R');
  });
});
```

（`zhCN` 聚合导出：`i18n/zh-CN/index.ts` 导出 `zhCN`；`CopyDict` 兼容——builder 参数为
`CopyDict`，`zhCN` 满足。测试跑在 Win32 平台假设下：vitest 默认 navigator.platform 非 Mac，
`formatKeybind` 走 `Ctrl` 分支；若 CI 平台为 Mac，此两处期望改为 `⌘` 形式——首选在文件顶部
`Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })` 锁定。）

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/app/regions/titleBarMenus.test.ts`
Expected: FAIL（模块签名/结构不符）

- [ ] **Step 3: Write minimal implementation.** `titleBarMenus.ts` 重写（保留 `MenuItem` 接口）：

```ts
import type { CopyDict } from '../i18n/types';
import type { ToolId } from '../stores/types';
import { formatKeybind } from '../../shared/keybinds';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  action?: () => void;
  disabled?: boolean;
}

type Keybinds = Record<string, string | undefined>;

function displayShortcut(keybinds: Keybinds, id: string, fallback: string): string | undefined {
  const raw = keybinds[id];
  if (raw === 'none') {
    return undefined;
  }
  return formatKeybind(raw ?? fallback);
}

export function useFileMenuItems(
  t: CopyDict,
  keybinds: Keybinds,
  onTriggerCreateWorkspace: () => void,
  onOpenFolder: () => void,
  handleClose: () => void,
): MenuItem[] {
  return [
    {
      id: 'new-ws',
      label: t.menuNewWorkspace,
      shortcut: displayShortcut(keybinds, 'workspace.new', 'mod+n'),
      action: onTriggerCreateWorkspace,
    },
    {
      id: 'open-folder',
      label: t.menuOpenFolder,
      shortcut: displayShortcut(keybinds, 'workspace.open', 'mod+o'),
      action: onOpenFolder,
    },
    { id: 'sep-1', label: '', separator: true },
    {
      id: 'exit',
      label: t.menuExit,
      // OS 级：窗口管理器直接消费 Alt+F4，应用监听不到，保留字面量展示。
      shortcut: 'Alt+F4',
      action: handleClose,
    },
  ];
}
```

`useViewMenuItems(t, keybinds, zoomBy, resetZoom, onOpenSettings, setActiveRightTool)` 返回：

```ts
[
  { id: 'open-files-panel', label: t.menuOpenFilePanel, shortcut: displayShortcut(keybinds, 'view.files', 'mod+shift+e'), action: () => setActiveRightTool('files') },
  { id: 'open-changes-panel', label: t.menuOpenChangesPanel, shortcut: displayShortcut(keybinds, 'view.changes', 'mod+shift+g'), action: () => setActiveRightTool('changes') },
  { id: 'open-browser-panel', label: t.menuOpenBrowserPanel, shortcut: displayShortcut(keybinds, 'view.browser', 'mod+shift+b'), action: () => setActiveRightTool('browser') },
  { id: 'open-terminal-panel', label: t.menuOpenTerminalPanel, shortcut: displayShortcut(keybinds, 'view.terminal', 'mod+shift+`'), action: () => setActiveRightTool('terminal') },
  { id: 'sep-1', label: '', separator: true },
  { id: 'zoom-in', label: t.menuZoomIn, shortcut: displayShortcut(keybinds, 'zoom.in', 'mod+shift+plus'), action: () => zoomBy(0.1) },
  { id: 'zoom-out', label: t.menuZoomOut, shortcut: displayShortcut(keybinds, 'zoom.out', 'mod+-'), action: () => zoomBy(-0.1) },
  { id: 'zoom-reset', label: t.menuResetZoom, shortcut: displayShortcut(keybinds, 'zoom.reset', 'mod+0'), action: resetZoom },
  { id: 'sep-2', label: '', separator: true },
  { id: 'settings', label: t.menuSettings, shortcut: displayShortcut(keybinds, 'settings.open', 'mod+shift+comma'), action: onOpenSettings },
]
```

`useHelpMenuItems(t, keybinds, onOpenShortcuts)` 返回：

```ts
[
  { id: 'shortcuts', label: t.menuShortcuts, action: onOpenShortcuts },
  { id: 'license', label: t.menuLicense, action: () => {} },
]
```

（`shortcuts` 行无 shortcut——和弦模型不支持，不展示；`license` 保持现状。注意
`useFileMenuItems` 参数表删除了末尾 `setActiveRightTool`，调用方同步更新。）

TitleBar.tsx 调用处更新（原 102-108 行附近）：

```tsx
const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds ?? {});
const openShortcutsSettings = useCallback(() => {
  const state = useAppStore.getState();
  state.setActiveRightTool('settings');
  state.setActiveSettingsGroup('shortcuts');
}, []);
const fileItems = useFileMenuItems(t, keybinds, onTriggerCreateWorkspace, onOpenFolder, handleClose);
const viewItems = useViewMenuItems(t, keybinds, zoomBy, resetZoom, onOpenSettings, setActiveRightTool);
const helpItems = useHelpMenuItems(t, keybinds, openShortcutsSettings);
```

（`setActiveSettingsGroup` 存在性已核验：`stores/slices/uiSlice.ts:159`。）

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm --dir frontend run test --run src/app/regions/titleBarMenus.test.ts src/app/regions/TitleBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/regions/titleBarMenus.ts ai-digital-life/frontend/src/app/regions/titleBarMenus.test.ts ai-digital-life/frontend/src/app/regions/TitleBar.tsx
git commit -m "feat(menu): restructure file/view/help menus with derived shortcuts"
```

---

### Task 6: Hamburger 去命令面板分类

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/HamburgerMenu.tsx`
- Test: `ai-digital-life/frontend/src/app/regions/TitleBar.test.tsx`（Task 4 已改；本任务追加分类断言）—
  更直接：复用 `HamburgerMenu` 行为经 TitleBar 渲染，追加测试于 `TitleBar.test.tsx`。

**Interfaces:**
- Consumes: Task 5 的三组 items（不再含 palette）。
- Produces: `CategoryItem.id = 'file' | 'view' | 'help'`；`HamburgerMenu` props 删除 `onOpenCommandPalette`。

- [ ] **Step 1: Write the failing test.** 在 `TitleBar.test.tsx` 追加：

```tsx
it('hamburger menu has exactly file/view/help categories (no command entry)', () => {
  renderTitleBar();
  fireEvent.click(screen.getByRole('button', { name: 'appMenu' }));
  const items = screen.getAllByRole('menuitem');
  const labels = items.map((el) => el.textContent);
  expect(labels).toEqual(['menuFile', 'menuView', 'menuHelp']);
});
```

（mockT 代理返回 key 名，故文本即 `menuFile` 等；`appMenu` key 存在性：TitleBar 用
`t.appMenu` 做 aria-label，若该 key 不存在则本测试先失败——执行者首选核验
`grep -rn "appMenu" src/app/i18n/`，缺失则改用容器类断言
`document.querySelectorAll('.adl-hamburger__item')` 长度为 3。）

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/app/regions/TitleBar.test.tsx`
Expected: FAIL（仍有 4 个分类）

- [ ] **Step 3: Write minimal implementation.** `HamburgerMenu.tsx` 改动：
1. `CategoryItem` 的 `id` 改为 `'file' | 'view' | 'help'`，删除 `action?: () => void;` 字段。
2. props 类型与解构删除 `onOpenCommandPalette`。
3. `categories` useMemo 删除 `{ id: 'command', ... }` 一项及依赖项中的 `onOpenCommandPalette`。
4. 键盘处理 `Enter` 分支删除（`cat.action` 不复存在，仅保留方向键/Escape/Tab逻辑）。
5. 主按钮 `onClick` 分支：`if (cat.action)` 整段删除（分类均有 submenu，
   点击行为由 hover/ArrowRight 展开承接——与现状 file/view/help 一致）。

- [ ] **Step 4: Run test to verify it passes.**

Run: `pnpm --dir frontend run test --run src/app/regions/TitleBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/regions/HamburgerMenu.tsx ai-digital-life/frontend/src/app/regions/TitleBar.test.tsx
git commit -m "feat(menu): remove dead command-palette entry from hamburger"
```

---

### Task 7: 工具切换 tooltip 派生显示

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/ToolSwitcher.tsx`
- Test: 已存在？先 `glob src/app/regions/right-panel/ToolSwitcher.test.tsx`——存在则改，不存在则新建同名文件。

**Interfaces:**
- Consumes: Task 1 命令 id；store keybinds；`formatKeybind`（本文件用 `@` 别名：
  `import { formatKeybind } from '@shared/keybinds';`——执行者先核验别名映射，
  `ToolSwitcher.tsx` 现有 `@icons/@components/@stores/@i18n` 别名可用，
  若 `@shared` 无映射则改用相对路径 `../../../shared/keybinds`）。

- [ ] **Step 1: Write the failing test.**（文件不存在则新建）断言：
  tooltip 内容含派生快捷键（默认 keybinds 下 terminal 为 `Ctrl+Shift+``），
  且自定义后变化：

```tsx
it('derives tab shortcut hints from user keybinds', () => {
  useAppStore.setState({
    appInfo: { ...(useAppStore.getState().appInfo as object), config: {
      ...(useAppStore.getState().appInfo?.config as object),
      keybinds: { 'view.terminal': 'mod+t' },
    } } as never,
  });
  render(<TestProvider><ToolSwitcher ... /></TestProvider>);
  expect(screen.getByText('toolTerminal')).toBeDefined();
});
```

（ToolSwitcher props：`activeTool/badges/idBase/onSelect/rightPanelExpanded/
onToggleRightPanelExpanded`；tooltip 经 `TooltipSimple content` 渲染——执行者以实际
Tooltip DOM 结构为准调整断言，核心是快捷键文本来自 store 而非静态常量。
`TAB_META` 静态 `shortcut` 字段删除后本测试先失败。）

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/app/regions/right-panel/ToolSwitcher.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation.** `TAB_META` 的 `shortcut: string` 改为
`commandId: string`（files→`view.files`、changes→`view.changes`、browser→`view.browser`、
terminal→`view.terminal`、settings→`settings.open`）；组件内
`const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds ?? {});`
tooltip 改为：

```tsx
const hint = formatKeybind(keybinds[tab.commandId] ?? DEFAULT_KEYBINDS[tab.commandId]);
<TooltipSimple content={hint ? `${label} · ${hint}` : label} placement="top">
```

（`DEFAULT_KEYBINDS` import 自 `@shared/defaultPreferences` 或相对路径，
与别名核验结果一致。`keybinds[id] === 'none'` 时 `formatKeybind` 返回 `''`，
自动退化为纯 label。）

- [ ] **Step 4: Run test to verify it passes.**

Run: `pnpm --dir frontend run test --run src/app/regions/right-panel/ToolSwitcher.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/regions/right-panel/ToolSwitcher.tsx ai-digital-life/frontend/src/app/regions/right-panel/ToolSwitcher.test.tsx
git commit -m "feat(switcher): derive tab shortcut hints from keybinds"
```

---

### Task 8: 文件组 scoped hook + 右键菜单派生

**Files:**
- Create: `ai-digital-life/frontend/src/app/regions/right-panel/panels/useFilesPanelShortcuts.ts`
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/FilesPanel.tsx`
  （外层容器加 `panelRef`；`fileMenuItems` shortcut 派生；调用 hook）
- Test: Create `ai-digital-life/frontend/src/app/regions/right-panel/panels/useFilesPanelShortcuts.test.ts`

**Interfaces:**
- Consumes: Task 2 导出的 `findMatchingCommand`；
  `DEFAULT_COMMANDS` 中 `group === 'file'` 的 4 条。
- Produces: `useFilesPanelShortcuts(args)`，args 含
  `{ panelRef, selectedFilePath, selectedAbsolutePath, editorOptions, handleCopyPath, keybinds }`。

- [ ] **Step 1: Write the failing test.** 新建 hook 测试（renderHook + 真实 div 容器）：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useFilesPanelShortcuts } from './useFilesPanelShortcuts';

function dispatchKey(key: string, opts: KeyboardEventInit = {}, target: Element): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useFilesPanelShortcuts', () => {
  it('copies relative path on Ctrl+Shift+C inside panel with selection', () => {
    const handleCopyPath = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { result, unmount } = renderHook(() => {
      const panelRef = useRef<HTMLDivElement | null>(null);
      (panelRef as { current: HTMLDivElement | null }).current = container;
      return useFilesPanelShortcuts({
        panelRef,
        selectedFilePath: 'a/b.ts',
        selectedAbsolutePath: '/root/a/b.ts',
        editorOptions: { wordWrapEnabled: false, setWordWrapEnabled: vi.fn(), lineNumbersEnabled: true, setLineNumbersEnabled: vi.fn() },
        handleCopyPath,
        keybinds: {},
      });
    });
    void result;
    dispatchKey('C', { ctrlKey: true, shiftKey: true }, container);
    expect(handleCopyPath).toHaveBeenCalledWith('a/b.ts');
    unmount();
    container.remove();
  });

  it('ignores presses outside the panel and without selection', () => {
    const handleCopyPath = vi.fn();
    const container = document.createElement('div');
    const outside = document.createElement('div');
    document.body.appendChild(container);
    document.body.appendChild(outside);
    const { unmount } = renderHook(() => {
      const panelRef = useRef<HTMLDivElement | null>(null);
      (panelRef as { current: HTMLDivElement | null }).current = container;
      return useFilesPanelShortcuts({
        panelRef,
        selectedFilePath: undefined,
        selectedAbsolutePath: undefined,
        editorOptions: { wordWrapEnabled: false, setWordWrapEnabled: vi.fn(), lineNumbersEnabled: true, setLineNumbersEnabled: vi.fn() },
        handleCopyPath,
        keybinds: {},
      });
    });
    dispatchKey('C', { ctrlKey: true, shiftKey: true }, container);
    dispatchKey('C', { ctrlKey: true, shiftKey: true }, outside);
    expect(handleCopyPath).not.toHaveBeenCalled();
    unmount();
    container.remove();
    outside.remove();
  });

  it('toggles word wrap on Alt+Z inside panel', () => {
    const setWordWrapEnabled = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { unmount } = renderHook(() => {
      const panelRef = useRef<HTMLDivElement | null>(null);
      (panelRef as { current: HTMLDivElement | null }).current = container;
      return useFilesPanelShortcuts({
        panelRef,
        selectedFilePath: undefined,
        selectedAbsolutePath: undefined,
        editorOptions: { wordWrapEnabled: false, setWordWrapEnabled, lineNumbersEnabled: true, setLineNumbersEnabled: vi.fn() },
        handleCopyPath: vi.fn(),
        keybinds: {},
      });
    });
    dispatchKey('z', { altKey: true }, container);
    expect(setWordWrapEnabled).toHaveBeenCalledTimes(1);
    unmount();
    container.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/app/regions/right-panel/panels/useFilesPanelShortcuts.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation.** 新建 `useFilesPanelShortcuts.ts`
（相对导入：`../../../hooks/useKeyboardShortcuts` 取 `findMatchingCommand`；
`../../../commands/defaultCommands` 取 `DEFAULT_COMMANDS`；
`../../../../shared/keybinds` 无需——匹配器内部处理）：

```ts
import { useEffect, type RefObject } from 'react';
import { DEFAULT_COMMANDS } from '../../../commands/defaultCommands';
import { findMatchingCommand } from '../../../hooks/useKeyboardShortcuts';

const FILE_COMMAND_IDS = new Set(
  DEFAULT_COMMANDS.filter((c) => c.group === 'file').map((c) => c.id),
);

export interface FilesPanelShortcutDeps {
  panelRef: RefObject<HTMLDivElement | null>;
  selectedFilePath?: string;
  selectedAbsolutePath?: string;
  editorOptions: {
    wordWrapEnabled: boolean;
    setWordWrapEnabled: (v: boolean | ((p: boolean) => boolean)) => void;
    lineNumbersEnabled: boolean;
    setLineNumbersEnabled: (v: boolean | ((p: boolean) => boolean)) => void;
  };
  handleCopyPath: (value?: string) => void;
  keybinds: Record<string, string | undefined>;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function useFilesPanelShortcuts(deps: FilesPanelShortcutDeps): void {
  const { panelRef, selectedFilePath, selectedAbsolutePath, editorOptions, handleCopyPath, keybinds } = deps;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || !(event.target instanceof Node) || !panel.contains(event.target)) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      const match = findMatchingCommand(event, DEFAULT_COMMANDS, keybinds);
      if (!match || !FILE_COMMAND_IDS.has(match.id)) {
        return;
      }
      event.preventDefault();
      switch (match.id) {
        case 'file.copy-relative':
          if (selectedFilePath) handleCopyPath(selectedFilePath);
          break;
        case 'file.copy-full':
          if (selectedAbsolutePath) handleCopyPath(selectedAbsolutePath);
          break;
        case 'file.toggle-word-wrap':
          editorOptions.setWordWrapEnabled((v) => !v);
          break;
        case 'file.toggle-line-numbers':
          editorOptions.setLineNumbersEnabled((v) => !v);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panelRef, selectedFilePath, selectedAbsolutePath, editorOptions, handleCopyPath, keybinds]);
}
```

FilesPanel.tsx 改动（3 处）：
1. 外层 `<div className="adl-tool-panel adl-tool-panel--files">` 加 `ref={panelRef}`，
   并在 `editorShellRef` 附近声明 `const panelRef = useRef<HTMLDivElement | null>(null);`。
2. `fileMenuItems` 的 `shortcut` 改派生（组件已 import `useAppStore`）：
   在 useMemo 前加 `const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds ?? {});`
   `copy-relative` 行：`shortcut: keybinds['file.copy-relative'] === 'none' ? undefined : formatKeybind(keybinds['file.copy-relative'] ?? 'mod+shift+c')`
   `copy-full` 行同理（fallback `'mod+alt+c'`）；`word-wrap` 行：
   `shortcut: keybinds['file.toggle-word-wrap'] === 'none' ? undefined : formatKeybind(keybinds['file.toggle-word-wrap'] ?? 'alt+z')`
   （替代原 `t.fileWordWrapShortcut`；`line-numbers` 行不动——无 shortcut）。
   useMemo 依赖追加 `keybinds`；文件顶部按现有别名风格追加
   `import { formatKeybind } from '@shared/keybinds';`（若 `@shared` 无映射则用相对路径
   `../../../shared/keybinds`——执行者以 `tsconfig.json` paths 为准）。
3. 在 `fileMenuItems` useMemo 之后调用：

```tsx
useFilesPanelShortcuts({
  panelRef,
  selectedFilePath,
  selectedAbsolutePath,
  editorOptions,
  handleCopyPath,
  keybinds,
});
```

（`handleCopyPath` 定义在 152 行，`fileMenuItems` 在 436 行之后——调用点置于两者之后；
hook 遵守条件调用禁令：直接顶层调用。）

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm --dir frontend run test --run src/app/regions/right-panel/panels/useFilesPanelShortcuts.test.ts src/app/regions/right-panel/panels/FilesPanel.test.tsx`
Expected: PASS（FilesPanel 测试文件若不存在则只跑 hook 测试——执行者先 `glob` 确认）

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/regions/right-panel/panels/useFilesPanelShortcuts.ts ai-digital-life/frontend/src/app/regions/right-panel/panels/useFilesPanelShortcuts.test.ts ai-digital-life/frontend/src/app/regions/right-panel/panels/FilesPanel.tsx
git commit -m "feat(shortcuts): scoped file-panel keybinds with derived hints"
```

---

### Task 9: 设置页 5 分组适配 + 全量验证

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/settings/KeybindSettings.tsx`
  （`GROUP_ORDER` += view/zoom/file；`GROUP_LABEL_KEY` += 三个新分组 key）
- Modify: `ai-digital-life/frontend/src/app/components/settings/KeybindSettings.test.tsx`
  （组数 2→5；行级重置数 3→14；组级重置数 2→5）
- Test: 同文件

**Interfaces:**
- Consumes: Task 1 的 `CommandGroup` / 分组 i18n。组件其余逻辑（sticky 顶栏、三路搜索、
  行级/组级/顶级重置、ConfirmDialog）零改动——新命令自动纳入（`DEFAULT_COMMANDS` 驱动、
  冲突检测遍历）。

- [ ] **Step 1: Write the failing test.** 更新三处断言：
  `'renders only groups...'` 中 `expect(groupCards.length).toBe(2)` → `toBe(5)`；
  `'renders group headers outside...'` 中 `expect(groups.length).toBe(2)` → `toBe(5)`；
  `'renders a group-level reset button per block'` 中 `toBe(2)` → `toBe(5)`；
  `'renders a per-row reset button...'` 中 `toBe(3)` → `toBe(14)`。

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/app/components/settings/KeybindSettings.test.tsx`
Expected: FAIL（4 处数量断言）

- [ ] **Step 3: Write minimal implementation.** `KeybindSettings.tsx` 两处：

```ts
const GROUP_ORDER: CommandGroup[] = ['general', 'navigation', 'view', 'zoom', 'file'];

const GROUP_LABEL_KEY: Record<CommandGroup, CopyKey> = {
  general: 'settingsShortcutsGroupGeneral',
  navigation: 'settingsShortcutsGroupNavigation',
  view: 'settingsShortcutsGroupView',
  zoom: 'settingsShortcutsGroupZoom',
  file: 'settingsShortcutsGroupFile',
};
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm --dir frontend run test --run src/app/components/settings/KeybindSettings.test.tsx src/app/hooks/useKeyCapture.test.ts src/app/hooks/useKeyboardShortcuts.test.ts src/shared/defaultPreferences.test.ts src/app/regions/TitleBar.test.tsx src/app/regions/titleBarMenus.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: 全量质量门 + Commit.**

```bash
npx tsc --noEmit
npx eslint src/app/commands/defaultCommands.ts src/app/hooks/useKeyboardShortcuts.ts src/app/hooks/useAppZoom.ts src/app/regions/titleBarMenus.ts src/app/regions/HamburgerMenu.tsx src/app/regions/TitleBar.tsx src/app/regions/right-panel/ToolSwitcher.tsx src/app/regions/right-panel/panels/FilesPanel.tsx src/app/regions/right-panel/panels/useFilesPanelShortcuts.ts src/app/components/settings/KeybindSettings.tsx src/app/i18n/zh-CN/menu.ts src/app/i18n/en-US/menu.ts src/app/i18n/zh-CN/settings.ts src/app/i18n/en-US/settings.ts
```

（工作目录 `ai-digital-life/frontend/`；要求零错误零警告，有存量警告需证明与本变更无关。）
随后：

```bash
git add -A && git status --short
git commit -m "feat(shortcuts): expose 5 groups in settings UI"
```

（`git add -A` 前必须人工检查 `git status` 无无关文件；若有则改用显式文件列表。）

---

### Task 10: 回归扫尾（i18n 全套件 + 受影响面复测）

**Files:** 无产品代码改动；仅修复本计划引入的回归（若有）。

- [ ] **Step 1: 运行 i18n 与周边套件。**

Run: `pnpm --dir frontend run test --run src/app/i18n src/app/components/settings src/app/regions src/app/hooks/useKeyCapture.test.ts src/app/features/terminal/__tests__/TerminalShellSelector.test.tsx`（工作目录 `ai-digital-life/`）
Expected: PASS（`menuNewTerminal` 保留故终端套件不受影响；`menuCommandPalette` 删除若有他处引用，
测试失败即按报错定位补改——候选：`grep -rn menuCommandPalette src/` 应仅剩 0 处）

- [ ] **Step 2: 最终 `tsc` + `eslint` 全量（frontend）。**

Run（工作目录 `ai-digital-life/frontend/`）: `npx tsc --noEmit && npx eslint .`
Expected: 零错误；error 即修，warning 需确认非本变更引入。

- [ ] **Step 3: Commit 回归修复（若有；无则空提交禁止，直接结束）。**
