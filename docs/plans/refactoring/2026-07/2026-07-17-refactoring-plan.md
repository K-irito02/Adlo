# 重构实施计划（综合）

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) to implement each Plan task-by-task. Each Plan (A-E) is an independent subsystem and can be executed in parallel. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 消除重构洞察报告中发现的全部 12 个问题，提升代码架构一致性与测试稳定性。

**说明：** 原始报告中的 3 个 unwrap/expect 发现（Critical #1 / High #3）经深入分析确认为**测试代码误报**——生产代码中无任何裸 `.unwrap()` 或 `.expect()` 调用。本计划不包含这几项的修复。

**架构方案：** 5 个独立子计划并行执行，互不依赖：

| 计划 | 对应原发现 | 子系统 | 工作量 |
|------|-----------|--------|--------|
| Plan A | Critical #2 + High #4 | 前端 Browser 层 | 中型 |
| Plan B | Medium #7 | 前端测试 | 中型 |
| Plan C | Medium #9 | 前端 i18n | 中型 |
| Plan D | High #5 + Medium #6 | 前端 + Rust | 大型 |
| Plan E | Low 项 | 前端 | 小型 |

**Tech Stack:** Rust (Tauri 2.x), TypeScript (React 19, Zustand 5), Vitest, i18n

---

## 全局约束

- 新创建的文件必须遵循现有代码风格（命名、导入路径 alias、类型约定）
- 前端文件使用 `@` path alias（`@stores/`、`@i18n/`、`@features/` 等）
- i18n 键使用 `camelCase` 命名，与现有风格一致
- Rust 代码使用 `Result<T, AppError>` 进行错误传播，禁止 `unwrap()`（测试代码除外）
- 浏览器模式（preview-bridge）和 Tauri 模式必须保持双端一致
- 所有改动必须通过质量门禁：`pnpm run lint` + `pnpm run typecheck` + `cargo test` 等

---

## 文件结构总览

```
# Plan A: 层违规修复 + BrowserPanel 拆分
frontend/src/
  shared/env.ts                                    # [新建] isTauriShell 等环境检测工具
  features/browser/
    BrowserPanel.tsx                               # [修改] 精简为编排层
    BrowserShell.tsx                               # [新建] 布局框架
    BrowserToolbarArea.tsx                         # [新建] 工具栏+URL+导航
    BrowserContentArea.tsx                         # [新建] 标签页+iframe
    useBrowserIframeState.ts                       # [修改] 改用 shared/env
    useBrowserMetaSubscription.ts                  # [修改] 同上
    useBrowserNavigation.ts                        # [修改] 同上
    useBrowserPanelMenuItems.ts                    # [修改] 同上
    useBrowserPool.ts                              # [修改] 同上
    useWebViewBounds.ts                            # [修改] 同上
    useWebViewLifecycle.ts                         # [修改] 同上
    useWebViewVisibility.ts                        # [修改] 同上

# Plan B: 不稳定测试修复
frontend/src/
  app/store.test.ts                                # [修改] 增加超时/优化
  features/git-visualization/
    GitVisualizationView.test.tsx                  # [修改] 移除伪造时钟
    charts/CalendarHeatmap.test.tsx                # [修改] mock motion
    charts/ClockHeatmap.test.tsx                   # [修改] 优化
  utils/__tests__/fetchPageMeta.test.ts            # [修改] 重构

# Plan C: i18n 硬编码提取
frontend/src/
  app/i18n/en-US/common.ts                         # [修改] 添加新键
  app/i18n/zh-CN/common.ts                         # [修改] 添加中文翻译
  app/i18n/en-US/workspace.ts                      # [修改] 添加新键
  app/i18n/zh-CN/workspace.ts                      # [修改] 添加中文翻译
  app/i18n/en-US/conversation.ts                   # [修改] 添加新键
  app/i18n/zh-CN/conversation.ts                   # [修改] 添加中文翻译
  app/i18n/en-US/file.ts                           # [修改] 添加新键
  app/i18n/zh-CN/file.ts                           # [修改] 添加中文翻译
  app/i18n/en-US/ci.ts                             # [修改] 添加新键
  app/i18n/zh-CN/ci.ts                             # [修改] 添加中文翻译
  app/regions/TitleBar.tsx                         # [修改]
  app/regions/WindowControls.tsx                   # [修改]
  app/regions/StatusBar.tsx                        # [修改]
  app/regions/LeftSidebar.tsx                      # [修改]
  app/regions/RightPanel.tsx                       # [修改]
  app/components/SessionManagement.tsx             # [修改] 大面积替换
  app/regions/center-pane/ComposerFooter.tsx       # [修改]
  app/components/EnvironmentControls.tsx           # [修改]
  app/regions/right-panel/FileNavigatorShell.tsx   # [修改]
  app/regions/right-panel/panels/communicate/GitHubCITree.tsx  # [修改]

# Plan D: CodeEditor + 大命令模块拆分
frontend/src/app/features/editor/
  CodeEditor.tsx                                   # [修改] 精简
  useCodeMirrorSetup.ts                            # [新建] CodeMirror 配置
  useEditorKeybindings.ts                          # [新建] 快捷键
  useEditorLint.ts                                 # [新建] Lint 集成
src-tauri/src/commands/
  task/
    mod.rs                                         # [新建] 路由层
    handlers.rs                                    # [新建] 业务逻辑（从 task.rs 抽取）
  agent/
    mod.rs                                         # [新建] 路由层
    handlers.rs                                    # [新建] 业务逻辑（从 agent.rs 抽取）
  conversation/
    mod.rs                                         # [新建] 路由层
    handlers.rs                                    # [新建] 业务逻辑（从 conversation.rs 抽取）
  task.rs                                          # [删除] 内容已移至 task/
  agent.rs                                         # [删除] 内容已移至 agent/
  conversation.rs                                  # [删除] 内容已移至 conversation/

# Plan E: Barrel + Hook 密度
frontend/src/shared/ipc/
  index.ts                                         # [修改] 精简 barrel
  workspace.ts                                     # [修改] 独立入口
  ...                                              # 其他域文件不动
frontend/src/app/regions/right-panel/
  hooks/index.ts                                   # [修改] 精简 barrel

# Plan F: Store 切片 + Chart 大文件
frontend/src/app/stores/
  StoreState.ts                                    # [修改] 提取浏览器类型
  slices/
    browserTypes.ts                                # [新建] 浏览器类型定义
    browserBookmarkSlice.ts                        # [修改] 合并 bookmarkHelpers
    browserBookmarkHelpers.ts                      # [删除] 内容合并到 bookmarkSlice
frontend/src/app/components/charts/
  shared/
    chartUtils.ts                                  # [新建] 共享图表工具函数
  heatmap-utils.ts                                 # [修改] 拆分为领域文件
  heatmap-data.ts                                  # [新建] 数据生成函数
  heatmap-layout.ts                                # [新建] 布局计算
  heatmap-colors.ts                                # [新建] 颜色映射
```

---

## Plan A: 层违规修复 + BrowserPanel 拆分

### A1: 创建 `shared/env.ts`

**Files:**
- Create: `frontend/src/shared/env.ts`

- [ ] **Step 1: 编写测试**

```ts
// frontend/src/shared/env.test.ts
import { describe, it, expect } from 'vitest';
import { isTauriShell } from './env';

describe('isTauriShell', () => {
  it('returns false in plain browser (non-Tauri)', () => {
    expect(isTauriShell()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/shared/env.test.ts`
Expected: FAIL — `env.ts` 不存在或 `isTauriShell` 未导出

- [ ] **Step 3: 实现 `env.ts`**

```ts
// frontend/src/shared/env.ts
/** 检查是否运行在 Tauri 桌面环境中。 */
export function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export type RuntimeEnv = 'tauri' | 'browser';

export function getRuntimeEnv(): RuntimeEnv {
  return isTauriShell() ? 'tauri' : 'browser';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/shared/env.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/shared/env.ts frontend/src/shared/env.test.ts
git commit -m "feat(shared): add env detection utility"
```

---

### A2: 重构 8 个 Browser Hook 的 `isTauriShell` 导入

**Files:**
- Modify: `features/browser/useBrowserIframeState.ts`
- Modify: `features/browser/useBrowserMetaSubscription.ts`
- Modify: `features/browser/useBrowserNavigation.ts`
- Modify: `features/browser/useBrowserPool.ts`
- Modify: `features/browser/useWebViewBounds.ts`
- Modify: `features/browser/useWebViewLifecycle.ts`
- Modify: `features/browser/useWebViewVisibility.ts`

**Interfaces:**
- Consumes: `isTauriShell()` from `shared/env`
- Replaces: `import { isTauriShell } from '@tauri-bridge'`

每个文件只改 import 行，例如：

```ts
// before:
import { isTauriShell } from '@tauri-bridge';

// after:
import { isTauriShell } from '@shared/env';
```

- [ ] **Step 1: 批量修改 6 个 hook 文件的导入**

对以下文件执行相同替换：
- `useBrowserIframeState.ts:3`
- `useBrowserMetaSubscription.ts:2`
- `useBrowserNavigation.ts:2`
- `useBrowserPool.ts:2`
- `useWebViewBounds.ts:2`
- `useWebViewLifecycle.ts:2`
- `useWebViewVisibility.ts:2`

将 `'@tauri-bridge'` 替换为 `'@shared/env'`。

- [ ] **Step 2: 修复 `useBrowserPanelMenuItems.ts` 的动态导入**

```ts
// before (line 86):
const { invoke } = await import('@tauri-apps/api/core');

// after:
import { isTauriShell } from '@shared/env';
// ... keep dynamic import but only in tauri mode
if (isTauriShell()) {
  const { invoke } = await import('@tauri-apps/api/core');
  // ... rest of tauri-specific code
}
```

- [ ] **Step 3: 修复 `useBrowserPool.test.ts` 的 mock 路径**

```ts
// before (line 5):
vi.mock('../../../tauri-bridge', () => ({

// after:
vi.mock('../../../shared/env', () => ({
  isTauriShell: () => false,
}));
```

- [ ] **Step 4: 运行类型检查确认无错误**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 errors

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/
git commit -m "fix(browser): replace @tauri-bridge imports with shared/env"
```

---

### A3: 拆分 BrowserPanel.tsx

**Files:**
- Create: `features/browser/BrowserShell.tsx`
- Create: `features/browser/BrowserToolbarArea.tsx`
- Create: `features/browser/BrowserContentArea.tsx`
- Modify: `features/browser/BrowserPanel.tsx`

**Interfaces:**
- Consumes: `BrowserPanelProps` from `@regions/right-panel/types`
- Consumes: All existing hooks (`useBrowserTabs`, `useBrowserWebView`, etc.)
- Produces: `BrowserShellProps { isVisible: boolean }`
- Produces: `BrowserToolbarAreaProps { onNavigate: (url: string) => void; ... }`
- Produces: `BrowserContentAreaProps { isVisible: boolean; ... }`

> **注意：** `BrowserPanel.tsx` 是一个大型组件，必须分步提取。不要一蹴而就——提交时机应跟随每一步的测试验证。

- [ ] **Step 1: 编写 BrowserPanel 的现有行为测试**

```tsx
// frontend/src/app/features/browser/BrowserPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserPanel } from './BrowserPanel';

// 基本渲染测试——验证拆分后仍能正常渲染
it('renders without crashing', () => {
  const { container } = render(<BrowserPanel isVisible={true} />);
  expect(container).toBeTruthy();
});
```

- [ ] **Step 2: 运行测试确认基线通过**

Run: `pnpm --dir frontend run test -- src/app/features/browser/BrowserPanel.test.tsx`
Expected: PASS（或跳过，如果依赖太多需要 mock）

- [ ] **Step 3: 提取 `BrowserToolbarArea`**

从 `BrowserPanel.tsx` 中提取工具栏区域（导航按钮、URL 输入框、刷新/停止）：

```tsx
// frontend/src/app/features/browser/BrowserToolbarArea.tsx
import { useBrowserNavigation } from './useBrowserNavigation';
import { useBrowserUrlState } from './useBrowserUrlState';
import { useBrowserZoomState } from './useBrowserZoomState';
import { useBrowserPanelAddressSubmit } from './useBrowserPanelAddressSubmit';
import { BrowserNavigator } from './BrowserNavigator';

interface BrowserToolbarAreaProps {
  tabId: string;
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export function BrowserToolbarArea(props: BrowserToolbarAreaProps) {
  // 从 `BrowserPanel.tsx` 粘贴工具栏相关的 JSX 和逻辑
  // ...（粘贴原有的 ~150 行工具栏代码）
}
```

- [ ] **Step 4: 提取 `BrowserContentArea`**

```tsx
// frontend/src/app/features/browser/BrowserContentArea.tsx
import { useBrowserTabs } from './useBrowserTabs';
import { useBrowserWebView } from './useBrowserWebView';
import { useBrowserIframeState } from './useBrowserIframeState';
import { BrowserIframeStack } from './BrowserIframeStack';

interface BrowserContentAreaProps {
  isVisible: boolean;
  activeTabId: string | undefined;
}

export function BrowserContentArea(props: BrowserContentAreaProps) {
  // 从 `BrowserPanel.tsx` 粘贴内容区域相关的 JSX 和逻辑
  // ...（粘贴原有的 ~150 行内容区代码）
}
```

- [ ] **Step 5: 提取 `BrowserShell`**

```tsx
// frontend/src/app/features/browser/BrowserShell.tsx
import { BrowserToolbarArea } from './BrowserToolbarArea';
import { BrowserContentArea } from './BrowserContentArea';

interface BrowserShellProps {
  isVisible: boolean;
}

export function BrowserShell({ isVisible }: BrowserShellProps) {
  // 从 `BrowserPanel.tsx` 粘贴布局代码
  return (
    <div className="adl-browser-panel">
      <BrowserToolbarArea ... />
      <BrowserContentArea isVisible={isVisible} ... />
    </div>
  );
}
```

- [ ] **Step 6: 精简 `BrowserPanel.tsx`**

```tsx
// BrowserPanel.tsx（精简后）
import { useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserTabs } from './useBrowserTabs';
import { useBrowserWebView } from './useBrowserWebView';
import { useBrowserSearch } from './useBrowserSearch';
import { useBrowserTreeActions } from './useBrowserTreeActions';
import { useBrowserNavigation } from './useBrowserNavigation';
import { useBrowserUrlState } from './useBrowserUrlState';
import { useBrowserMenus } from './useBrowserMenus';
import { useBrowserThemeSync } from './useBrowserThemeSync';
import { useBrowserPanelEffects } from './useBrowserPanelEffects';
import { useBrowserDialogs } from './useBrowserDialogs';
import { useBrowserToast } from './useBrowserToast';
import { useBrowserPanelHandlers } from './useBrowserPanelHandlers';
import { useBrowserPanelMetaWiring } from './useBrowserPanelMetaWiring';
import { BrowserShell } from './BrowserShell';
import type { BrowserPanelProps } from '@regions/right-panel/types';
import { useTCopy } from '@i18n/useTCopy';

export function BrowserPanel(props: BrowserPanelProps) {
  const { t } = useTCopy();
  useBrowserThemeSync();

  const isBrowserVisible = props.isVisible ?? false;

  // ... 保留原有的状态选择和 hooks 组合 ...

  return <BrowserShell isVisible={isBrowserVisible} />;
}
```

- [ ] **Step 7: 运行测试确认拆分后正常**

Run: `pnpm --dir frontend run test -- src/app/features/browser/ -r verbose`
Run: `pnpm --dir frontend run typecheck`
Expected: 所有已有测试通过，0 类型错误

- [ ] **Step 8: 提交**

```bash
git add frontend/src/app/features/browser/BrowserShell.tsx \
       frontend/src/app/features/browser/BrowserToolbarArea.tsx \
       frontend/src/app/features/browser/BrowserContentArea.tsx \
       frontend/src/app/features/browser/BrowserPanel.tsx
git commit -m "refactor(browser): split BrowserPanel into focused sub-components"
```

---

## Plan B: 修复不稳定测试

### B1: 修复 `store.test.ts` 超时

- [ ] **Step 1: 分析根因**

`store.test.ts` 的 2 个测试调用 `loadLocale(locale)`，后者执行动态 `import()` 加载 25 个 locale 模块。在并行测试负载下，模块转换 + 磁盘 I/O 可能超过 5s 默认超时。

- [ ] **Step 2: 增加测试超时 + 使用 `vi.isFakeTimers` 保护**

```ts
// store.test.ts
import { describe, expect, it } from 'vitest';
import { loadLocale } from './i18n/i18nLoader';

describe('store utility functions', () => {
  describe('sessionFallbackTitle', () => {
    it('returns English fallback for en-US', { timeout: 10000 }, async () => {
      const dict = await loadLocale('en-US');
      const result = dict.sessionFallback;
      expect(result).toBe('Single Agent Session');
    });

    it('returns Chinese fallback for zh-CN', { timeout: 10000 }, async () => {
      const dict = await loadLocale('zh-CN');
      const result = dict.sessionFallback;
      expect(result).toBe('单 Agent 会话');
    });
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/app/store.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/store.test.ts
git commit -m "fix(test): increase store.test.ts timeout for dynamic imports"
```

---

### B2: 修复 `GitVisualizationView.test.tsx` 超时

**根因：** `vi.useFakeTimers()` + 4 个热力图的动画生命周期创建了不可解析的定时器链。

- [ ] **Step 1: 移除 `vi.useFakeTimers()`**

```tsx
// GitVisualizationView.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { GitVisualizationView } from './GitVisualizationView';

// mock motion/react
vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => {
      const R = require('react');
      const { children, ...rest } = p;
      return R.createElement('div', { className: rest.className, key: rest.key }, children);
    }}),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => true,  // 关键：禁用动画
  };
});

// mock 其他依赖...

beforeEach(() => {
  // ❌ 移除 vi.useFakeTimers()
});

afterEach(() => {
  cleanup();
});

describe('GitVisualizationView', () => {
  it('renders 7 chart cards', { timeout: 10000 }, () => {
    const { container } = render(<GitVisualizationView />);
    const cards = container.querySelectorAll('.adl-git-vis__card');
    expect(cards.length).toBe(7);
  });

  it('renders scroll container', { timeout: 10000 }, () => {
    const { container } = render(<GitVisualizationView />);
    const scrollContainer = container.querySelector('.adl-git-vis__container');
    expect(scrollContainer).toBeTruthy();
  });

  it('renders mock data note', { timeout: 10000 }, () => {
    const { container } = render(<GitVisualizationView />);
    const note = container.querySelector('.adl-git-vis__note');
    expect(note).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- "GitVisualizationView" -r verbose`
Expected: PASS (3 tests)

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx
git commit -m "fix(test): remove useFakeTimers from GitVisualizationView test"
```

---

### B3: 修复 `CalendarHeatmap.test.tsx` 超时

**根因：** 未 mock `motion/react`，导致 364 个单元格的动画生命周期在测试负载下超时。

- [ ] **Step 1: 添加 `motion/react` mock**

```tsx
// CalendarHeatmap.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CalendarHeatmap } from './CalendarHeatmap';

// mock motion 需要放在所有 import 之前
vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => {
      const { children, ...rest } = p;
      return React.createElement('div', { className: rest.className, key: rest.key }, children);
    }}),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => true,
  };
});

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: { gitVisContribution: 'contribution', gitVisContributions: 'contributions' },
    locale: 'en-US',
    formatT: vi.fn(),
  }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (args: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 600, height: 200 }),
}));

describe('CalendarHeatmap', () => {
  it('renders SVG', { timeout: 10000 }, () => {
    const { container } = render(<CalendarHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- "CalendarHeatmap" -r verbose`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx
git commit -m "fix(test): mock motion/react in CalendarHeatmap test"
```

---

### B4: 修复 `fetchPageMeta.test.ts` 超时

- [ ] **Step 1: 分析根因**

`vi.useFakeTimers()` 在动态 `import()` 之前激活，可能与 Vite 的模块加载机制冲突。解决方案：在 `import()` 之后才激活 fake timers。

- [ ] **Step 2: 重构测试——延迟 fakeTimers 激活**

```ts
// fetchPageMeta.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const localStorageStore: Record<string, string> = {};
beforeEach(() => {
  Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => { localStorageStore[key] = value; },
    removeItem: (key: string) => { delete localStorageStore[key]; },
    clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); },
  });
  // ❌ 不在这里激活 fakeTimers
});

afterEach(() => {
  vi.useRealTimers();
});

describe('favicon cache persistence', () => {
  it('should persist and restore favicon cache across module reloads', { timeout: 10000 }, async () => {
    const mod1 = await import('../fetchPageMeta');
    // 在动态 import 之后激活 fakeTimers
    vi.useFakeTimers();

    mod1.setCachedFavicon('https://example.com', 'https://example.com/favicon.ico');
    vi.advanceTimersByTime(500);
    const stored = localStorage.getItem('adl-ui:browser-favicon-cache');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed['https://example.com/']).toBe('https://example.com/favicon.ico');

    vi.useRealTimers();
  });

  it('should not persist pinned entries that would exceed 200 limit', { timeout: 10000 }, async () => {
    const mod = await import('../fetchPageMeta');
    vi.useFakeTimers();

    for (let i = 0; i < 250; i++) {
      mod.setCachedFavicon(`https://site${i}.com`, `https://site${i}.com/favicon.ico`);
    }
    vi.advanceTimersByTime(500);
    const stored = localStorage.getItem('adl-ui:browser-favicon-cache');
    const parsed = JSON.parse(stored!);
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(200);

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- "fetchPageMeta" -r verbose`
Expected: PASS (2 tests)

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/utils/__tests__/fetchPageMeta.test.ts
git commit -m "fix(test): delay useFakeTimers after dynamic import in fetchPageMeta test"
```

---

### B5: 修复 `ClockHeatmap.test.tsx` 超时

- [ ] **Step 1: 增加 `useReducedMotion: () => true` 并提高超时**

```tsx
// ClockHeatmap.test.tsx
vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => {
      const R = require('react');
      const { children, ...rest } = p;
      return R.createElement('div', { className: rest.className, key: rest.key }, children);
    }}),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => true,  // 关键修改：禁用动画
  };
});

describe('ClockHeatmap', () => {
  it('renders SVG', { timeout: 10000 }, () => {
    const { container } = render(<ClockHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- "ClockHeatmap" -r verbose`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/features/git-visualization/charts/ClockHeatmap.test.tsx
git commit -m "fix(test): disable animation in ClockHeatmap test mock"
```

---

## Plan C: i18n 硬编码字符串提取

### C1: 添加缺失的 i18n 键

- [ ] **Step 1: 在 `en-US/common.ts` 中添加新键**

```ts
// 在 en-US/common.ts 的适当位置添加
export const common = {
  // ... 现有内容

  // --- 新增 aria-label 键 ---
  appMenu: 'Application menu',
  panelControls: 'Panel controls',
  windowControls: 'Window controls',
  conversationStatus: 'Conversation status',
  sidebarNavigator: 'Workspace and session navigator',
  toolPanel: 'Workspace tool panel',
  resizeFileNavigator: 'Resize file navigator',
  options: 'Options',
  remove: 'Remove',
  voice: 'Voice',
  // --- 新增 end ---
} as const;
```

- [ ] **Step 2: 在 `zh-CN/common.ts` 中添加中文翻译**

```ts
// 在 zh-CN/common.ts 的适当位置添加
export const common = {
  // ... 现有内容

  appMenu: '应用菜单',
  panelControls: '面板控制',
  windowControls: '窗口控制',
  conversationStatus: '对话状态',
  sidebarNavigator: '工作区和会话导航',
  toolPanel: '工作区工具面板',
  resizeFileNavigator: '调整文件导航器宽度',
  options: '选项',
  remove: '移除',
  voice: '语音',
} as const;
```

- [ ] **Step 3: 在 `en-US/workspace.ts` 中添加新键**

```ts
// workspace.ts
export const workspace = {
  // ... 现有内容

  // --- 新增 ---
  sessionManagement: 'Session management',
  toggleWorkspaces: 'Toggle workspaces',
  toggleSessions: 'Toggle sessions',
  addWorkspace: 'Add workspace',
  createSession: 'Create session',
  workspaceEmptyList: 'No workspaces yet',
  sessionEmptyList: 'No sessions yet',
  // --- 新增 end ---
} as const;
```

- [ ] **Step 4: 在 `zh-CN/workspace.ts` 中添加中文翻译**

```ts
// zh-CN/workspace.ts
export const workspace = {
  // ... 现有内容

  sessionManagement: '会话管理',
  toggleWorkspaces: '切换工作区',
  toggleSessions: '切换会话',
  addWorkspace: '添加工作区',
  createSession: '创建会话',
  workspaceEmptyList: '暂无工作区',
  sessionEmptyList: '暂无会话',
} as const;
```

- [ ] **Step 5: 在 `en-US/conversation.ts` 中添加新键**

```ts
// conversation.ts
export const conversation = {
  // ... 现有内容

  composer: 'Message composer',
} as const;
```

- [ ] **Step 6: 在 `zh-CN/conversation.ts` 中添加中文翻译**

```ts
// zh-CN/conversation.ts
export const conversation = {
  // ... 现有内容

  composer: '消息编辑器',
} as const;
```

- [ ] **Step 7: 在 `en-US/file.ts` 中添加新键**

```ts
// file.ts
export const file = {
  // ... 现有内容

  searchOptions: 'Search options',
} as const;
```

- [ ] **Step 8: 在 `zh-CN/file.ts` 中添加中文翻译**

```ts
// zh-CN/file.ts
export const file = {
  // ... 现有内容

  searchOptions: '搜索选项',
} as const;
```

- [ ] **Step 9: 在 `en-US/ci.ts` 中添加新键**

```ts
// ci.ts
export const ci = {
  // ... 现有内容

  ciNavigatorTitle: 'GitHub CI',
} as const;
```

- [ ] **Step 10: 在 `zh-CN/ci.ts` 中添加中文翻译**

```ts
// zh-CN/ci.ts
export const ci = {
  // ... 现有内容

  ciNavigatorTitle: 'GitHub CI',
} as const;
```

- [ ] **Step 11: 运行类型检查确认 i18n 键类型安全**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 errors（TypeScript `satisfies` 约束保证键名一致）

- [ ] **Step 12: 提交**

```bash
git add frontend/src/app/i18n/en-US/common.ts \
       frontend/src/app/i18n/en-US/workspace.ts \
       frontend/src/app/i18n/en-US/conversation.ts \
       frontend/src/app/i18n/en-US/file.ts \
       frontend/src/app/i18n/en-US/ci.ts \
       frontend/src/app/i18n/zh-CN/common.ts \
       frontend/src/app/i18n/zh-CN/workspace.ts \
       frontend/src/app/i18n/zh-CN/conversation.ts \
       frontend/src/app/i18n/zh-CN/file.ts \
       frontend/src/app/i18n/zh-CN/ci.ts
git commit -m "feat(i18n): add missing locale keys for aria-labels and display text"
```

---

### C2: 替换各组件中的硬编码字符串

- [ ] **Step 1: 替换 `TitleBar.tsx` 中的硬编码 aria-label**

```tsx
// TitleBar.tsx ~line 143
// before:
<nav aria-label="Application menu">
// after:
<nav aria-label={t.appMenu}>
```

```tsx
// ~line 208
// before:
<div role="group" aria-label="Panel controls">
// after:
<div role="group" aria-label={t.panelControls}>
```

- [ ] **Step 2: 替换 `WindowControls.tsx` 中的硬编码 aria-label**

```tsx
// WindowControls.tsx ~line 61
// before:
<div role="group" aria-label="Window controls">
// after:
<div role="group" aria-label={t.windowControls}>
```

- [ ] **Step 3: 替换 `StatusBar.tsx` 中的硬编码 aria-label**

```tsx
// StatusBar.tsx ~line 142
// before:
aria-label={inline ? 'Conversation status' : undefined}
// after:
aria-label={inline ? t.conversationStatus : undefined}
```

- [ ] **Step 4: 替换 `LeftSidebar.tsx` 中的硬编码 aria-label**

```tsx
// LeftSidebar.tsx ~line 122
// before:
<aside aria-label="Workspace and session navigator">
// after:
<aside aria-label={t.sidebarNavigator}>
```

- [ ] **Step 5: 替换 `RightPanel.tsx` 中的硬编码 aria-label**

```tsx
// RightPanel.tsx ~line 233
// before:
<aside aria-label="Workspace tool panel">
// after:
<aside aria-label={t.toolPanel}>
```

- [ ] **Step 6: 替换 `ComposerFooter.tsx` 中的硬编码字符串**

```tsx
// ComposerFooter.tsx ~line 88
// before:
<footer aria-label="Message composer">
// after:
<footer aria-label={t.composer}>

// ~line 94
// before:
aria-label="Remove"
// after:
aria-label={t.remove}

// ~line 145-146
// before:
content="Voice" 和 aria-label="Voice"
// after:
content={t.voice} 和 aria-label={t.voice}
```

- [ ] **Step 7: 替换 `EnvironmentControls.tsx` 中的硬编码字符串**

```tsx
// EnvironmentControls.tsx
// ~line 24-26 — THEME_OPTIONS 的 label 字段改为运行时计算：
const themeOptions = useMemo(() => [
  { value: 'light', label: t.themeLight },
  { value: 'dark', label: t.themeDark },
  { value: 'system', label: t.themeSystem },
], [t]);

// ~line 101
// before:
aria-label="Options"
// after:
aria-label={t.options}

// ~line 160 — 使用已存在的 envControlsAria
// before:
aria-label="Environment controls"
// after:
aria-label={t.envControlsAria}

// ~line 169 — 使用已存在的 changeLanguageAria
// before:
aria-label="Change language"
// after:
aria-label={t.changeLanguageAria}
```

- [ ] **Step 8: 替换 `FileNavigatorShell.tsx` 中的硬编码字符串**

```tsx
// FileNavigatorShell.tsx ~line 340
// before:
aria-label="Search options"
// after:
aria-label={formatT(t, 'searchOptions')}

// ~line 449
// before:
label="Resize file navigator"
// after:
label={t.resizeFileNavigator}
```

- [ ] **Step 9: 替换 `GitHubCITree.tsx` 中的硬编码字符串**

```tsx
// GitHubCITree.tsx ~line 248
// before:
aria-label="GitHub CI"
// after:
aria-label={t.ciNavigatorTitle}
```

- [ ] **Step 10: 重构 `SessionManagement.tsx`——引入 useTCopy 并替换所有硬编码字符串**

```tsx
// SessionManagement.tsx 顶部
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';

export function SessionManagement() {
  const { t, formatT } = useTCopy();
  // ... 现有逻辑

  // 替换 TooltipSimple 中的硬编码字符串：
  // content="Pinned" → content={t.sessionMenuPin}（已有）
  // content="Pin" → content={t.pin}（已有）
  // content="More options" → content={t.moreActions}（已有）
  // content="New workspace" → content={t.quickNewWorkspace}（已有）
  // content="New session" → content={t.newSession}（已有）

  // 替换 aria-labels：
  // aria-label="Session management" → aria-label={t.sessionManagement}
  // aria-label="Toggle workspaces" → aria-label={t.toggleWorkspaces}
  // aria-label="Toggle sessions" → aria-label={t.toggleSessions}

  // 替换显示文本：
  // <span>Workspaces</span> → <span>{t.workspaces}</span>
  // <span>Sessions</span> → <span>{t.sessions}</span>
  // No workspaces yet → {t.workspaceEmptyList}
  // No sessions yet → {t.sessionEmptyList}

  // 替换 formatTimestamp 中的硬编码相对时间字符串
  // 'just now' → formatT('relativeTimeJustNow')（已有）
  // '{n}m ago' → formatT('relativeTimeMinutesAgo', { n: diffMin })（已有）
  // '{n}h ago' → formatT('relativeTimeHoursAgo', { n: diffHr })（已有）
}
```

- [ ] **Step 11: 运行类型检查**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 errors

- [ ] **Step 12: 运行 lint**

Run: `pnpm --dir frontend run lint`
Expected: 0 new warnings

- [ ] **Step 13: 提交**

```bash
git add frontend/src/app/regions/TitleBar.tsx \
       frontend/src/app/regions/WindowControls.tsx \
       frontend/src/app/regions/StatusBar.tsx \
       frontend/src/app/regions/LeftSidebar.tsx \
       frontend/src/app/regions/RightPanel.tsx \
       frontend/src/app/regions/center-pane/ComposerFooter.tsx \
       frontend/src/app/components/EnvironmentControls.tsx \
       frontend/src/app/regions/right-panel/FileNavigatorShell.tsx \
       frontend/src/app/regions/right-panel/panels/communicate/GitHubCITree.tsx \
       frontend/src/app/components/SessionManagement.tsx
git commit -m "fix(i18n): replace hardcoded strings with i18n keys in 10 components"
```

---

## Plan D: CodeEditor + 大命令模块拆分

### D1: 拆分 CodeEditor

- [ ] **Step 1: 编写 `useCodeMirrorSetup.ts`**

提取 CodeMirror 实例的创建和配置逻辑：

```ts
// frontend/src/app/features/editor/useCodeMirrorSetup.ts
import { useMemo } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
// ... 其他导入

interface UseCodeMirrorSetupOptions {
  doc: string;
  extensions: Extension[];
  theme?: 'light' | 'dark';
  readonly?: boolean;
  onChange?: (value: string) => void;
}

export function useCodeMirrorSetup({
  doc,
  extensions,
  theme,
  readonly = false,
  onChange,
}: UseCodeMirrorSetupOptions) {
  return useMemo(() => {
    const allExtensions = [
      basicSetup,
      ...extensions,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange?.(update.state.doc.toString());
        }
      }),
      ...(theme === 'dark' ? [oneDark] : []),
      ...(readonly ? [EditorView.editable.of(false)] : []),
    ];

    return new EditorView({
      state: EditorState.create({ doc, extensions: allExtensions }),
    });
  }, [doc, extensions, theme, readonly, onChange]);
}
```

- [ ] **Step 2: 编写 `useEditorKeybindings.ts`**

```ts
// frontend/src/app/features/editor/useEditorKeybindings.ts
import { useMemo } from 'react';
import { keymap } from '@codemirror/view';
import type { KeyBinding } from '@codemirror/view';

interface UseEditorKeybindingsOptions {
  onSave?: () => void;
  onFormat?: () => void;
}

export function useEditorKeybindings({ onSave, onFormat }: UseEditorKeybindingsOptions) {
  return useMemo(() => {
    const bindings: KeyBinding[] = [];
    if (onSave) {
      bindings.push({ key: 'Mod-s', run: () => { onSave(); return true; } });
    }
    if (onFormat) {
      bindings.push({ key: 'Mod-Shift-f', run: () => { onFormat(); return true; } });
    }
    return keymap.of(bindings);
  }, [onSave, onFormat]);
}
```

- [ ] **Step 3: 编写 `useEditorLint.ts`**

```ts
// frontend/src/app/features/editor/useEditorLint.ts
import { useMemo } from 'react';
import { linter, type Diagnostic } from '@codemirror/lint';
import { lintGutter } from '@codemirror/lint';

interface UseEditorLintOptions {
  source: (doc: string) => Diagnostic[];
}

export function useEditorLint({ source }: UseEditorLintOptions) {
  return useMemo(() => {
    return [lintGutter(), linter((view) => source(view.state.doc.toString()))];
  }, [source]);
}
```

- [ ] **Step 4: 精简 `CodeEditor.tsx`**

```tsx
// CodeEditor.tsx（精简后）
import { useRef, useEffect } from 'react';
import { useCodeMirrorSetup } from './useCodeMirrorSetup';
import { useEditorKeybindings } from './useEditorKeybindings';
import { useEditorLint } from './useEditorLint';

export function CodeEditor(props: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const keymapExt = useEditorKeybindings({ onSave: props.onSave });
  const lintExt = useEditorLint({ source: props.lintSource });

  const view = useCodeMirrorSetup({
    doc: props.value,
    extensions: [keymapExt, ...lintExt, ...props.extraExtensions],
    theme: props.theme,
    readonly: props.readonly,
    onChange: props.onChange,
  });

  useEffect(() => {
    if (containerRef.current && view) {
      containerRef.current.appendChild(view.dom);
      viewRef.current = view;
    }
    return () => {
      view?.destroy();
    };
  }, [view]);

  return <div ref={containerRef} className="adl-code-editor" />;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --dir frontend run typecheck`
Run: `pnpm --dir frontend run test -- "CodeEditor" -r verbose`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/features/editor/useCodeMirrorSetup.ts \
       frontend/src/app/features/editor/useEditorKeybindings.ts \
       frontend/src/app/features/editor/useEditorLint.ts \
       frontend/src/app/features/editor/CodeEditor.tsx
git commit -m "refactor(editor): extract CodeMirror setup, keybindings, lint into focused hooks"
```

---

### D2: 拆分 `commands/task.rs`

- [ ] **Step 1: 创建 `commands/task/mod.rs`**

```rust
// src-tauri/src/commands/task/mod.rs
pub mod handlers;

use tauri::State;
use crate::state::AppState;

#[tauri::command]
pub async fn list_tasks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<TaskRecord>, AppError> {
    handlers::list_tasks(&state, &workspace_id).await
}

#[tauri::command]
pub async fn create_task(
    state: State<'_, AppState>,
    workspace_id: String,
    title: String,
) -> Result<TaskRecord, AppError> {
    handlers::create_task(&state, &workspace_id, &title).await
}

// ... 从 task.rs 复制其余命令函数到 mod.rs
```

- [ ] **Step 2: 创建 `commands/task/handlers.rs`**

```rust
// src-tauri/src/commands/task/handlers.rs
use adl_errors::AppError;
use crate::state::AppState;

pub async fn list_tasks(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<TaskRecord>, AppError> {
    // 从 task.rs 复制业务逻辑
    state.db.list_entities::<TaskRecord>(/* ... */)
}

pub async fn create_task(
    state: &AppState,
    workspace_id: &str,
    title: &str,
) -> Result<TaskRecord, AppError> {
    // 从 task.rs 复制业务逻辑
}
```

- [ ] **Step 3: 更新 `commands/mod.rs` 注册**

```rust
// src-tauri/src/commands/mod.rs
pub mod task;
pub mod agent;
pub mod conversation;
// ... 其他模块
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test --workspace
```
Expected: 所有 534 测试通过

- [ ] **Step 5: 删除旧的 `task.rs` 并提交**

```bash
git rm src-tauri/src/commands/task.rs
git add src-tauri/src/commands/task/mod.rs \
        src-tauri/src/commands/task/handlers.rs \
        src-tauri/src/commands/mod.rs
git commit -m "refactor(commands): split task.rs into mod.rs + handlers.rs"
```

---

### D3: 拆分 `commands/agent.rs`

> 与 D2 相同模式。

- [ ] **Step 1: 创建 `commands/agent/mod.rs`**（路由层）
- [ ] **Step 2: 创建 `commands/agent/handlers.rs`**（业务逻辑）
- [ ] **Step 3: 更新 `commands/mod.rs`**
- [ ] **Step 4: 运行测试**
- [ ] **Step 5: 删除旧文件并提交**

```bash
git rm src-tauri/src/commands/agent.rs
git add src-tauri/src/commands/agent/mod.rs \
        src-tauri/src/commands/agent/handlers.rs \
        src-tauri/src/commands/mod.rs
git commit -m "refactor(commands): split agent.rs into mod.rs + handlers.rs"
```

---

### D4: 拆分 `commands/conversation.rs`

> 与 D2 相同模式。

- [ ] **Step 1: 创建 `commands/conversation/mod.rs`**
- [ ] **Step 2: 创建 `commands/conversation/handlers.rs`**
- [ ] **Step 3: 更新 `commands/mod.rs`**
- [ ] **Step 4: 运行测试**
- [ ] **Step 5: 删除旧文件并提交**

```bash
git rm src-tauri/src/commands/conversation.rs
git add src-tauri/src/commands/conversation/mod.rs \
        src-tauri/src/commands/conversation/handlers.rs \
        src-tauri/src/commands/mod.rs
git commit -m "refactor(commands): split conversation.rs into mod.rs + handlers.rs"
```

---

## Plan E: Barrel 文件 + Hook 密度（低优先级）

### E1: 拆分 IPC Barrel

- [ ] **Step 1: 分析 `shared/ipc/index.ts` 的导入模式**

当前 barrel 使用 25 个 `export * from './<domain>'` 语句。每个 import 拉取整个域文件的所有导出。

- [ ] **Step 2: 按用途分组 barrel**

```ts
// shared/ipc/index.ts（精简后）
// 只保留最常用的域文件
export * from './shared';
export * from './app';
export * from './workspace';
export * from './conversation';
export * from './browser';
export * from './patch';
export * from './command';
// 低频使用的域文件改为直接导入
```

- [ ] **Step 3: 检查所有直接引用 barrel 的导入点**

```bash
# 查找所有从 @shared/ipc 或 shared/ipc/index 的导入
Select-String -Path "frontend/src" -Pattern "from '@shared/ipc'|from '\.\./shared/ipc'" -Recurse
```

- [ ] **Step 4: 为低频使用的域添加直接的深度导入路径**

例如，`export * from './session_fork'` 被移除后，引用方改为：
```ts
// before:
import { forkSession } from '@shared/ipc';
// after:
import { forkSession } from '@shared/ipc/session_fork';
```

- [ ] **Step 5: 运行类型检查和测试**

```bash
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/shared/ipc/
git commit -m "perf(ipc): reduce barrel size, add deep import paths for low-frequency domains"
```

---

### E2: 审查高 Hook 密度组件

- [ ] **Step 1: 分析 `BrowserLandingPage.tsx` 的 16 个 hook**

```bash
# 列出所有 hook 调用
Select-String -Path "frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx" -Pattern "use[A-Z]\w+\(|use[A-Z]\w+<" | Measure-Object
```

- [ ] **Step 2: 对 `BrowserLandingPage.tsx` 进行审查**

寻找可以合并的 `useEffect`——例如连续的 `useEffect` 监听相同依赖的可以合并：

```tsx
// before — 两个独立的 effect 监听 locale:
useEffect(() => { updateLocaleStrings(locale); }, [locale]);
useEffect(() => { fetchLocalizedData(locale); }, [locale]);

// after — 合并为一个 effect:
useEffect(() => {
  updateLocaleStrings(locale);
  fetchLocalizedData(locale);
}, [locale]);
```

- [ ] **Step 3: 审查 `fileTree.tsx`（14 hooks）**

寻找可缓存的 `useMemo`——如果某个计算非常轻量（简单 map/filter），移除 `useMemo` 包装。

- [ ] **Step 4: 运行测试确认无回归**

```bash
pnpm --dir frontend run test -- "BrowserLandingPage|fileTree"
pnpm --dir frontend run lint
```

- [ ] **Step 5: 提交**

```bash
git commit -m "perf(components): reduce hook count in BrowserLandingPage and fileTree"
```

---

## Plan F: Store 切片 + Chart 大文件（低优先级）

### F1: StoreState.ts 类型拆分

**根因：** `StoreState.ts`（366 行）包含所有切片类型的联合，随着切片增加变得难以维护。浏览器相关切片跨 6 个文件（1,521 行）。

- [ ] **Step 1: 提取浏览器类型到独立文件**

```ts
// frontend/src/app/stores/slices/browserTypes.ts
// 从 StoreState.ts 中提取所有浏览器相关的类型定义

export interface BrowserTabState {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  // ... 其他浏览器特定字段
}

export interface BrowserBookmarkState {
  // ...
}

// 从 StoreState.ts 中删除这些类型，改为 re-export
```

```ts
// StoreState.ts
// before: 大量内联的浏览器类型定义
// after:
import type { BrowserTabState, BrowserBookmarkState } from './slices/browserTypes';
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 errors

- [ ] **Step 3: 审查浏览器 6 切片是否可以合并**

当前浏览器逻辑分散在：
- `browserSlice.ts`（273 行）— 核心
- `browserTabsSlice.ts`（216 行）— 标签页
- `browserBookmarkSlice.ts`（242 行）— 书签
- `browserBookmarkHelpers.ts`（256 行）— 书签辅助
- `browserFoldersSlice.ts`（250 行）— 文件夹
- `browserFoldersDeletion.ts`（284 行）— 删除逻辑

将 `browserBookmarkHelpers.ts` 合并到 `browserBookmarkSlice.ts`（它们是同一个领域的概念）。

```ts
// browserBookmarkSlice.ts — 合并后
// 将 browserBookmarkHelpers.ts 的内容移入此文件
// 删除 browserBookmarkHelpers.ts
```

- [ ] **Step 4: 运行测试**

Run: `pnpm --dir frontend run test -- "browser" -r verbose`
Expected: 所有浏览器相关测试通过

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/StoreState.ts \
       frontend/src/app/stores/slices/browserTypes.ts \
       frontend/src/app/stores/slices/browserBookmarkSlice.ts
git rm frontend/src/app/stores/slices/browserBookmarkHelpers.ts
git commit -m "refactor(stores): extract browser types, merge bookmark helpers into slice"
```

### F2: Chart 大文件分析

**根因：** Chart 组件占据最大文件列表前 7 位（最大 852 行）。其中一些可能可以共享基类。

- [ ] **Step 1: 评估是否可以提取共享图表基类**

```bash
# 分析 chart 文件中的重复代码模式
Select-String -Path "frontend/src/app/components/charts" -Pattern "function (getColor|formatAxis|calculateDomain|createTooltip)" | Group-Object Pattern
```

- [ ] **Step 2: 若发现 3 处以上重复工具函数，提取到共享文件**

```ts
// frontend/src/app/components/charts/shared/chartUtils.ts
// 从 bar-chart.tsx, line.tsx, time-series-chart-shell.tsx 等文件提取重复的：
// - 颜色映射函数
// - 坐标轴格式化
// - 域计算
// - Tooltip 创建
```

- [ ] **Step 3: 审查 `heatmap-utils.ts`（852 行）是否可以拆分**

`heatmap-utils.ts` 包含：
- 数据生成函数（`generateCommitData`, `generateHoursData`）
- 布局计算（`layoutCalendar`, `layoutClock`）
- 颜色映射（`getHeatmapColor`, `getClockHeatmapColor`）
- 日期工具（`getWeekNumber`, `getDayOfYear`）

按功能拆分为 `heatmap-data.ts`、`heatmap-layout.ts`、`heatmap-colors.ts`。

- [ ] **Step 4: 运行测试确认无回归**

Run: `pnpm --dir frontend run test -- "Heatmap|chart" -r verbose`
Run: `pnpm --dir frontend run typecheck`

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/components/charts/
git commit -m "refactor(charts): extract shared utils, split heatmap-utils by concern"
```

---

## 执行顺序建议

### 快速胜利（1-2 天）：

| 顺序 | 计划 | 预计工时 | 原因 |
|------|------|---------|------|
| 1 | **Plan B** 修复不稳定测试 | 2-4小时 | 消除 CI 噪声，提高测试可信度 |
| 2 | **Plan C** 提取 i18n 字符串 | 3-5小时 | 简单替换，立即提升国际化完整性 |
| 3 | **Plan E + F** Barrel + Hook + Store | 4-6小时 | 低风险优化，可并行执行 |

### 架构改进（3-5 天）：

| 顺序 | 计划 | 预计工时 | 原因 |
|------|------|---------|------|
| 4 | **Plan A1+A2** 层违规修复 | 2-3小时 | 恢复架构完整性 |
| 5 | **Plan A3** BrowserPanel 拆分 | 4-6小时 | 减少合并冲突，提升可维护性 |
| 6 | **Plan D1** CodeEditor 拆分 | 3-4小时 | 降低组件复杂度 |
| 7 | **Plan D2-D4** 命令模块拆分 | 4-6小时 | 对齐已有 agent_pipeline 模式 |

---

## 不需要实施的项目

以下 3 个原始发现经深入分析确认为**误报**，无需修复：

| 原始发现 | 误报原因 |
|----------|---------|
| **Critical #1**: `agent-runtime/src/lib.rs` 141 个 unwrap | 初始扫描误匹配。实际：0 个在生产代码，1 个在测试代码 |
| **High #3**: `storage/src/crud.rs` 45 个 unwrap/expect | 同上。实际：0 个在生产代码，30 个在测试代码（测试辅助函数中预期） |
| **High #3**: `workspace/src/git.rs` 27 个 unwrap | 同上。实际：0 个在生产代码，29 个在测试代码 |

> 这些文件的生产代码**正确使用了 `Result<T, AppError>` 传播模式**，裸 `unwrap()` / `expect()` 仅出现在 `#[cfg(test)]` 模块中，这是 Rust 测试的标准做法。

---

## 验证步骤

每个 Plan 完成后，运行完整的质量门禁：

```bash
# Rust 端
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test --workspace

# 前端
cd frontend
pnpm run typecheck
pnpm run lint
pnpm run test

# 如果全部通过：
git push
```
