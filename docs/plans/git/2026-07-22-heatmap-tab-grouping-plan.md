# Heatmap Tab Grouping 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 将 Git 可视化面板的 4 个热力图卡片合并为一张带下滑线导航切换的卡片，并缩短全部 8 个图表标题。

**架构:** 新增 `HeatmapCardGroup` 组件，内部根据 `uiSlice.activeHeatmapTab` 条件渲染对应热力图。active tab 状态持久化到 localStorage，遵循 `showGitVisualization` 现有模式。

**技术栈:** React 19, TypeScript, Zustand, CSS Custom Properties, Vitest

## 全局约束

- 遵循项目 BEM CSS 命名约定（`.adl-git-vis__*`）
- 使用 `var(--...)` CSS 自定义属性（设计令牌）
- i18n key 遵循现有 `gitVis*` 命名模式
- 所有文本通过 `useTCopy` + i18n key 实现，禁止硬编码

---

### Task 1: Zustand uiSlice — 新增 activeHeatmapTab 状态

**Files:**
- Modify: `frontend/src/app/stores/slices/uiSliceTypes.ts`
- Modify: `frontend/src/app/stores/slices/uiSlice.ts`

**Interfaces:**
- Consumes: 现有 `readJson`/`writeJson` 工具函数
- Produces: `UISlice.activeHeatmapTab: HeatmapTab`, `UISlice.setActiveHeatmapTab(tab)`, `ACTIVE_HEATMAP_TAB_KEY` 常量

- [ ] **Step 1: uiSliceTypes.ts — 添加类型和常量**

在 `SHOW_GIT_VISUALIZATION_KEY` 后新增 key 常量，在 `showGitVisualization` 后新增类型字段和 action：

```typescript
// 在 SHOW_GIT_VISUALIZATION_KEY 后
export const ACTIVE_HEATMAP_TAB_KEY = 'adl-ui:active-heatmap-tab';

export type HeatmapTab = 'calendar' | 'clock' | 'activity' | 'module';

// 在 showGitVisualization 后
  activeHeatmapTab: HeatmapTab;

// 在 setShowGitVisualization 后
  setActiveHeatmapTab: (tab: HeatmapTab) => void;
```

- [ ] **Step 2: uiSlice.ts — 导入 ACTIVE_HEATMAP_TAB_KEY**

```typescript
import {
  CHANGES_PREVIEW_ENABLED_KEY,
  SHOW_GIT_VISUALIZATION_KEY,
  ACTIVE_HEATMAP_TAB_KEY, // 新增
  ...
} from './uiSliceTypes';
```

- [ ] **Step 3: uiSlice.ts — hydration 中加入 activeHeatmapTab 读取**

在 hydration 函数中读取：

```typescript
const showGitVisualization = readFlag(SHOW_GIT_VISUALIZATION_KEY, false);
const activeHeatmapTab = readJson<HeatmapTab>(ACTIVE_HEATMAP_TAB_KEY, 'calendar');
```

在 set 调用中新增：

```typescript
set({
  ...
  showGitVisualization,
  activeHeatmapTab,
  expandedSessionWorkspaces,
  ...
});
```

- [ ] **Step 4: uiSlice.ts — 添加 setActiveHeatmapTab action**

```typescript
setActiveHeatmapTab: (tab) => {
  writeJson(ACTIVE_HEATMAP_TAB_KEY, tab);
  set({ activeHeatmapTab: tab });
},
```

- [ ] **Step 5: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

---

### Task 2: i18n — 更新标题 + 新增热力图标签 key

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `frontend/src/app/i18n/en-US/changes.ts`

**Interfaces:**
- Consumes: 现有 i18n 结构
- Produces: 更新后的标题和 4 个新标签 key

- [ ] **Step 1: zh-CN/changes.ts — 更新标题、新增标签 key**

```typescript
  // 更新
  gitVisCalendarHeatmap: '提交日历',
  gitVisClockHeatmap: '提交时段',
  gitVisContributorModule: '贡献者模块',
  gitVisCodeLineEvo: '代码行演变',
  gitVisContributorActivity: '贡献活跃度',
  gitVisFileSunburst: '文件旭日图',
  // 在 gitVisBranchGraph 前新增
  gitVisHeatmapTabCalendar: '日历',
  gitVisHeatmapTabClock: '时段',
  gitVisHeatmapTabActivity: '活跃度',
  gitVisHeatmapTabModule: '模块',
```

- [ ] **Step 2: en-US/changes.ts — 更新标题、新增标签 key**

```typescript
  // 更新
  gitVisCalendarHeatmap: 'Commit Calendar',
  gitVisClockHeatmap: 'Commit Hours',
  gitVisContributorModule: 'Contributor Module',
  gitVisFileSunburst: 'File Sunburst',
  // 在 gitVisBranchGraph 前新增
  gitVisHeatmapTabCalendar: 'Calendar',
  gitVisHeatmapTabClock: 'Hours',
  gitVisHeatmapTabActivity: 'Activity',
  gitVisHeatmapTabModule: 'Module',
```

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

---

### Task 3: CSS — 新增热力图导航样式

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css`

**Interfaces:**
- Consumes: `.adl-git-vis__card` 现有卡片容器
- Produces: `.adl-git-vis__heatmap-nav`, `.adl-git-vis__heatmap-tab`, `.adl-git-vis__heatmap-tab--active`, `.adl-git-vis__heatmap-tab-indicator`

- [ ] **Step 1: 在 git-visualization.css 末尾添加导航样式**

在 Branch Graph 样式后添加：

```css
/* ── Heatmap Tab Navigation ── */
.adl-git-vis__heatmap-nav {
  display: flex;
  gap: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 var(--space-1);
  margin-bottom: var(--space-2);
}

.adl-git-vis__heatmap-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  padding: 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.15s;
  white-space: nowrap;
}

.adl-git-vis__heatmap-tab:hover {
  color: var(--text-primary);
}

.adl-git-vis__heatmap-tab--active {
  color: var(--accent);
}

.adl-git-vis__heatmap-tab::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--accent);
  transform: scaleX(0);
  transition: transform 0.2s ease;
}

.adl-git-vis__heatmap-tab:hover::after {
  transform: scaleX(1);
}

.adl-git-vis__heatmap-tab--active::after {
  transform: scaleX(1);
}
```

- [ ] **Step 2: 验证 CSS 语法**

手动检查：所有选择器以 `.adl-git-vis__` 开头，使用 `var(--...)` 令牌

---

### Task 4: HeatmapCardGroup 组件

**Files:**
- Create: `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx`

**Interfaces:**
- Consumes: `useTCopy` (i18n), `useShallow` + store (activeHeatmapTab, setActiveHeatmapTab), 4 个热力图组件
- Produces: `<HeatmapCardGroup />` 自包含卡片组件

- [ ] **Step 1: 创建 HeatmapCardGroup.tsx**

```tsx
import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useShallow } from '@stores/selectors';
import { CalendarHeatmap } from './charts/CalendarHeatmap';
import { ClockHeatmap } from './charts/ClockHeatmap';
import { ContributorActivityHeatmap } from './charts/ContributorActivityHeatmap';
import { ContributorModuleHeatmap } from './charts/ContributorModuleHeatmap';

type HeatmapTab = 'calendar' | 'clock' | 'activity' | 'module';

const TABS: { id: HeatmapTab; titleKey: string }[] = [
  { id: 'calendar', titleKey: 'gitVisHeatmapTabCalendar' },
  { id: 'clock', titleKey: 'gitVisHeatmapTabClock' },
  { id: 'activity', titleKey: 'gitVisHeatmapTabActivity' },
  { id: 'module', titleKey: 'gitVisHeatmapTabModule' },
];

const HEATMAP_COMPONENTS: Record<HeatmapTab, React.ComponentType> = {
  calendar: CalendarHeatmap,
  clock: ClockHeatmap,
  activity: ContributorActivityHeatmap,
  module: ContributorModuleHeatmap,
};

const TITLE_KEYS: Record<HeatmapTab, string> = {
  calendar: 'gitVisCalendarHeatmap',
  clock: 'gitVisClockHeatmap',
  activity: 'gitVisContributorActivity',
  module: 'gitVisContributorModule',
};

const DESC_KEYS: Record<HeatmapTab, string> = {
  calendar: 'gitVisCalendarHeatmapDesc',
  clock: 'gitVisClockHeatmapDesc',
  activity: 'gitVisContributorActivityDesc',
  module: 'gitVisContributorModuleDesc',
};

export const HeatmapCardGroup = React.memo(function HeatmapCardGroup() {
  const { t } = useTCopy();
  const { activeHeatmapTab, setActiveHeatmapTab } = useShallow((s) => ({
    activeHeatmapTab: s.activeHeatmapTab,
    setActiveHeatmapTab: s.setActiveHeatmapTab,
  }));

  const ActiveChart = HEATMAP_COMPONENTS[activeHeatmapTab];

  return (
    <div className="adl-git-vis__card">
      <div className="adl-git-vis__card-header">
        <h3 className="adl-git-vis__card-title">{t[TITLE_KEYS[activeHeatmapTab]]}</h3>
      </div>
      <nav className="adl-git-vis__heatmap-nav" role="tablist" aria-label={t.gitVisHeatmapTabCalendar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            className={`adl-git-vis__heatmap-tab${activeHeatmapTab === tab.id ? ' adl-git-vis__heatmap-tab--active' : ''}`}
            aria-selected={activeHeatmapTab === tab.id}
            onClick={() => setActiveHeatmapTab(tab.id)}
          >
            {t[tab.titleKey]}
          </button>
        ))}
      </nav>
      <div className="adl-git-vis__chart" role="tabpanel">
        <ActiveChart />
      </div>
      <p className="adl-git-vis__card-desc">{t[DESC_KEYS[activeHeatmapTab]]}</p>
    </div>
  );
});
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

---

### Task 5: 更新 GitVisualizationView — 替换热力图卡片

**Files:**
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx`

**Interfaces:**
- Consumes: `HeatmapCardGroup` (Task 4)
- Produces: 更新后的视图，卡片数从 8 减为 5

- [ ] **Step 1: 修改 GitVisualizationView.tsx**

移除 4 个热力图 ChartCard 的导入和使用，引入 HeatmapCardGroup：

```tsx
import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { HeatmapCardGroup } from './HeatmapCardGroup';
import { CodeLineEvo } from './charts/CodeLineEvo';
import { CommitTimeline } from './charts/CommitTimeline';
import { FileSunburst } from './charts/FileSunburst';
import { BranchGraph } from './charts/BranchGraph';
```

替换 JSX 中 4 个热力图 ChartCard 为 `<HeatmapCardGroup />`：

```tsx
return (
  <div className="adl-git-vis__container">
    <HeatmapCardGroup />
    <ChartCard title={t.gitVisCodeLineEvo} desc={t.gitVisCodeLineEvoDesc}>
      <CodeLineEvo />
    </ChartCard>
    <ChartCard title={t.gitVisCommitTimeline} desc={t.gitVisCommitTimelineDesc}>
      <CommitTimeline />
    </ChartCard>
    <ChartCard title={t.gitVisFileSunburst} desc={t.gitVisFileSunburstDesc}>
      <FileSunburst />
    </ChartCard>
    <ChartCard title={t.gitVisBranchGraph} desc={t.gitVisBranchGraphDesc}>
      <BranchGraph />
    </ChartCard>
    <p className="adl-git-vis__note">{t.gitVisMockDataNote}</p>
  </div>
);
```

注意删除不再使用的 import：CalendarHeatmap, ClockHeatmap, ContributorActivityHeatmap, ContributorModuleHeatmap

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

---

### Task 6: 测试

**Files:**
- Create: `frontend/src/app/features/git-visualization/HeatmapCardGroup.test.tsx`
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx`

**Interfaces:**
- Consumes: HeatmapCardGroup, GitVisualizationView 组件

- [ ] **Step 1: 创建 HeatmapCardGroup.test.tsx**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { HeatmapCardGroup } from './HeatmapCardGroup';

// Mock motion (same as GitVisualizationView.test.tsx)
function createMotionValue(initial = 0) {
  const listeners: Record<string, ((v: unknown) => void)[]> = {};
  return {
    get: () => initial,
    set: (v: unknown) => { listeners.change?.forEach((fn) => fn(v)); },
    stop: () => {},
    on: (event: string, fn: (v: unknown) => void) => {
      (listeners[event] ??= []).push(fn);
      return () => { listeners[event] = listeners[event]?.filter((f) => f !== fn); };
    },
  };
}

vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: () => function MotionTag({ children, ...rest }: Record<string, unknown>) {
      const React = require('react');
      return React.createElement('div', { className: rest.className }, children);
    },
  }),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(val: T) => createMotionValue(val as number),
  useTransform: () => createMotionValue(0),
  useSpring: (val: unknown) => createMotionValue(typeof val === 'number' ? val : 0),
  useReducedMotion: () => true,
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (args: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 600, height: 200 }),
}));

vi.mock('@hooks/useResolvedTheme', () => ({ useResolvedTheme: vi.fn(() => 'light') }));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6', muted: '#94a3b8', background: '#ffffff', text: '#1e293b',
    seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    heatmapColors: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8'],
    grid: '#e2e8f0', tooltipBg: '#1e293b', tooltipText: '#f8fafc',
  }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {
      gitVisCalendarHeatmap: 'Commit Calendar',
      gitVisClockHeatmap: 'Commit Hours',
      gitVisContributorActivity: 'Contributor Activity',
      gitVisContributorModule: 'Contributor Module',
      gitVisCalendarHeatmapDesc: 'desc1',
      gitVisClockHeatmapDesc: 'desc2',
      gitVisContributorActivityDesc: 'desc3',
      gitVisContributorModuleDesc: 'desc4',
      gitVisHeatmapTabCalendar: 'Calendar',
      gitVisHeatmapTabClock: 'Hours',
      gitVisHeatmapTabActivity: 'Activity',
      gitVisHeatmapTabModule: 'Module',
    },
    formatT: vi.fn(),
  })),
}));

const mockSetActiveHeatmapTab = vi.fn();

vi.mock('@stores/selectors', () => ({
  useShallow: vi.fn((selector) => selector({
    activeHeatmapTab: 'calendar',
    setActiveHeatmapTab: mockSetActiveHeatmapTab,
  })),
}));

afterEach(() => {
  cleanup();
  mockSetActiveHeatmapTab.mockClear();
});

describe('HeatmapCardGroup', () => {
  it('renders 4 navigation tabs', () => {
    const { container } = render(<HeatmapCardGroup />);
    const tabs = container.querySelectorAll('.adl-git-vis__heatmap-tab');
    expect(tabs.length).toBe(4);
  });

  it('defaults to calendar tab as active', () => {
    const { container } = render(<HeatmapCardGroup />);
    const activeTab = container.querySelector('.adl-git-vis__heatmap-tab--active');
    expect(activeTab).toBeTruthy();
    expect(activeTab?.textContent).toBe('Calendar');
  });

  it('calls setActiveHeatmapTab on tab click', () => {
    const { container } = render(<HeatmapCardGroup />);
    const tabs = container.querySelectorAll('.adl-git-vis__heatmap-tab');
    fireEvent.click(tabs[1]);
    expect(mockSetActiveHeatmapTab).toHaveBeenCalledWith('clock');
  });

  it('renders description text', () => {
    const { container } = render(<HeatmapCardGroup />);
    const desc = container.querySelector('.adl-git-vis__card-desc');
    expect(desc).toBeTruthy();
    expect(desc?.textContent).toBe('desc1');
  });
});
```

- [ ] **Step 2: 更新 GitVisualizationView.test.tsx — 修改 mock 和卡片计数**

在 mock `useTCopy` 中添加新 key：

```typescript
t: {
  gitVisCalendarHeatmap: 'Commit Calendar',
  gitVisClockHeatmap: 'Clock Heatmap',
  gitVisCodeLineEvo: 'Code Line Evolution',
  gitVisContributorActivity: 'Contributor Activity',
  gitVisCommitTimeline: 'Commit Timeline',
  gitVisContributorModule: 'Contributor × Module',
  gitVisFileSunburst: 'File Sunburst',
  gitVisBranchGraph: 'Branch Graph',
  gitVisBranchGraphDesc: 'desc',
  gitVisBranch: 'Branch',
  gitVisBranchGraphFilterHint: 'Click a branch label to filter',
  gitVisCalendarHeatmapDesc: 'desc',
  gitVisClockHeatmapDesc: 'desc',
  gitVisCodeLineEvoDesc: 'desc',
  gitVisContributorActivityDesc: 'desc',
  gitVisCommitTimelineDesc: 'desc',
  gitVisContributorModuleDesc: 'desc',
  gitVisFileSunburstDesc: 'desc',
  gitVisMockDataNote: 'note',
  gitVisHeatmapTabCalendar: 'Calendar',
  gitVisHeatmapTabClock: 'Hours',
  gitVisHeatmapTabActivity: 'Activity',
  gitVisHeatmapTabModule: 'Module',            // 新增
},
```

同时 mock `useShallow` 和 stores：

```typescript
vi.mock('@stores/selectors', () => ({
  useShallow: vi.fn((selector) => selector({
    activeHeatmapTab: 'calendar' as const,
    setActiveHeatmapTab: vi.fn(),
  })),
}));
```

将卡片计数断言从 `8` 改为 `5`：

```typescript
it('renders 5 chart cards', { timeout: 30000 }, () => {
  const { container } = render(<GitVisualizationView />);
  const cards = container.querySelectorAll('.adl-git-vis__card');
  expect(cards.length).toBe(5);
});
```

- [ ] **Step 3: 运行测试**

Run: `cd frontend && npx vitest run src/app/features/git-visualization/`
Expected: All tests PASS
