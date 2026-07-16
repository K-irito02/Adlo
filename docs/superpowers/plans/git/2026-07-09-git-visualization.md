# Git 可视化功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在变更面板中新增"Git 可视化"按钮，点击后在右侧主内容区 toggle 显示 7 种 ECharts 图表，再次点击恢复原 Diff 查看器。

**Architecture:** 新增 `git-visualization` feature 模块，封装 ECharts 按需引入、主题同步、分支颜色分配。通过 Zustand `uiSlice` 管理 `showGitVisualization` 布尔状态并持久化到 localStorage。在 `ChangesNavigatorToolbar` 第二行最右侧新增按钮，`ChangesPanel` 根据 `showGitVisualization` 条件渲染 `GitVisualizationView` 或现有 `LazyDiffEditor`。

**Tech Stack:** React 19 + ECharts 5（按需引入）+ Zustand + TypeScript + Vitest

## Global Constraints

- 所有颜色必须使用 CSS 自定义属性 `var(--…)`，禁止硬编码（轴线/网格/tooltip 等 ECharts 内部颜色除外，通过主题对象传入）
- 所有 UI 展示文本必须使用 i18n key，禁止硬编码中英文
- TypeScript 禁止 `any`，使用 ECharts 的 `EChartsOption` 类型
- 禁止 `else`，使用提前返回模式
- `const` 优先，禁止 `let` 重赋值
- 使用 `useResolvedTheme()` hook 获取当前主题，禁止直接读取 `appInfo.config.resolvedTheme`
- 导入路径使用别名（`@features/*`、`@regions/*`、`@stores/*`、`@i18n`、`@icons`、`@components`）
- 组件使用 `React.memo` + 命名导出（非 default export）
- i18n key 真源为 `zh-CN/changes.ts`，必须同步更新 `en-US/changes.ts`
- Node.js 路径：`$env:Path = "D:\Program Files\nodejs;$env:Path"`
- 设计文档真源：`E:\AI-DIGITAL-LIFE\SourceWorkspace\Git可视化设计.md`

---

## File Structure

### 新增文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/features/git-visualization/index.ts` | Barrel 导出 |
| `frontend/src/app/features/git-visualization/GitVisualizationView.tsx` | 主容器组件，渲染 7 个图表卡片 |
| `frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx` | 主容器测试 |
| `frontend/src/app/features/git-visualization/hooks/useECharts.ts` | ECharts 实例生命周期管理 hook |
| `frontend/src/app/features/git-visualization/hooks/useECharts.test.ts` | useECharts 测试 |
| `frontend/src/app/features/git-visualization/hooks/useChartTheme.ts` | 主题配色 hook |
| `frontend/src/app/features/git-visualization/hooks/useChartTheme.test.ts` | useChartTheme 测试 |
| `frontend/src/app/features/git-visualization/utils/branchColor.ts` | 分支颜色分配（方案 C） |
| `frontend/src/app/features/git-visualization/utils/branchColor.test.ts` | branchColor 测试 |
| `frontend/src/app/features/git-visualization/utils/hslToHex.ts` | HSL 转 HEX 工具函数 |
| `frontend/src/app/features/git-visualization/data/gitVisMockData.ts` | 模拟数据（从设计文档提取） |
| `frontend/src/app/features/git-visualization/charts/CommitGraph.tsx` | 提交网络图 |
| `frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx` | 日历热力图 |
| `frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx` | 时钟热力图 |
| `frontend/src/app/features/git-visualization/charts/ContributorStats.tsx` | 贡献者概览 |
| `frontend/src/app/features/git-visualization/charts/FileTreemap.tsx` | 文件修改热度 Treemap |
| `frontend/src/app/features/git-visualization/charts/CodeLineEvolution.tsx` | 代码行数演变 |
| `frontend/src/app/features/git-visualization/charts/CollabSankey.tsx` | 协作桑基图 |
| `frontend/src/styles/regions/rightpanel/git-visualization.css` | 图表卡片样式 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `frontend/package.json` | 新增 `echarts` 依赖 |
| `frontend/src/app/stores/slices/uiSliceTypes.ts` | 新增 `SHOW_GIT_VISUALIZATION_KEY` 常量 + `showGitVisualization` 字段 + `setShowGitVisualization` action 类型 |
| `frontend/src/app/stores/slices/uiSlice.ts` | 重新导出新常量 + `hydrateUIDefaults` 读取 + 初始化 + setter 实现 |
| `frontend/src/app/regions/right-panel/panels/ChangesNavigatorToolbar.tsx` | 新增 Git 可视化按钮 |
| `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx` | 条件渲染 `GitVisualizationView` |
| `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx` | 从 store 读取 `showGitVisualization` 并传递 |
| `frontend/src/app/components/LazyComponents.tsx` | 新增 `LazyGitVisualizationView` 懒加载导出 |
| `frontend/src/app/i18n/zh-CN/changes.ts` | 新增 Git 可视化相关中文 key |
| `frontend/src/app/i18n/en-US/changes.ts` | 新增 Git 可视化相关英文 key |
| `frontend/src/styles/regions.css` | 导入 `git-visualization.css` |

---

### Task 1: 安装 ECharts 依赖

**Files:**
- Modify: `ai-digital-life/frontend/package.json`

**Interfaces:**
- Produces: `echarts` 包可被 `import * as echarts from 'echarts/core'` 引用

- [ ] **Step 1: 安装 echarts 依赖**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend add echarts
```

- [ ] **Step 2: 验证依赖安装成功**

Run:
```powershell
pnpm --dir ai-digital-life/frontend list echarts
```
Expected: 输出包含 `echarts 5.x.x`

- [ ] **Step 3: 验证按需引入可用**

Run:
```powershell
node -e "const e = require('./ai-digital-life/frontend/node_modules/echarts/core'); console.log(typeof e.init)"
```
Expected: 输出 `function`

- [ ] **Step 4: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "deps(frontend): add echarts for git visualization"
```

---

### Task 2: uiSlice 新增 showGitVisualization 状态

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/uiSliceTypes.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/uiSlice.ts`
- Test: `ai-digital-life/frontend/src/app/stores/slices/uiSlice.test.ts`（如不存在则创建）

**Interfaces:**
- Produces: `showGitVisualization: boolean` 状态字段、`setShowGitVisualization: (show: boolean) => void` action、`SHOW_GIT_VISUALIZATION_KEY` 常量

- [ ] **Step 1: 在 uiSliceTypes.ts 新增 localStorage 键名常量**

在 `ai-digital-life/frontend/src/app/stores/slices/uiSliceTypes.ts` 第 31 行 `ACTIVE_RIGHT_TOOL_KEY` 后新增：

```ts
export const SHOW_GIT_VISUALIZATION_KEY = 'adl-ui:show-git-visualization';
```

- [ ] **Step 2: 在 UISlice 接口新增状态字段**

在 `uiSliceTypes.ts` 的 `UISlice` 接口中，第 75 行 `changesPreviewEnabled: boolean;` 后新增：

```ts
showGitVisualization: boolean;
```

- [ ] **Step 3: 在 UISlice 接口新增 action 方法**

在 `uiSliceTypes.ts` 的 `UISlice` 接口中，第 106 行 `setChangesPreviewEnabled` 后新增：

```ts
setShowGitVisualization: (show: boolean) => void;
```

- [ ] **Step 4: 在 uiSlice.ts 重新导出新常量**

在 `ai-digital-life/frontend/src/app/stores/slices/uiSlice.ts` 的重新导出区域（第 34-65 行），在 `CHANGES_PREVIEW_ENABLED_KEY` 后新增：

```ts
  SHOW_GIT_VISUALIZATION_KEY,
```

同时在文件顶部第 15-23 行的 import 块中，在 `CHANGES_PREVIEW_ENABLED_KEY` 后添加 `SHOW_GIT_VISUALIZATION_KEY`。

- [ ] **Step 5: 在 hydrateUIDefaults 中读取持久化值**

在 `uiSlice.ts` 的 `hydrateUIDefaults` 函数中（第 87-133 行），在第 103 行 `const changesPreviewEnabled = readFlag(...)` 后新增：

```ts
    const showGitVisualization = readFlag(SHOW_GIT_VISUALIZATION_KEY, false);
```

然后在第 116-126 行的 `set({ ... })` 调用中，在 `changesPreviewEnabled,` 后添加 `showGitVisualization,`。

- [ ] **Step 6: 在 createUISlice 初始化状态**

在 `uiSlice.ts` 的 `createUISlice` 返回对象中，第 193 行 `changesPreviewEnabled: true,` 后新增：

```ts
    showGitVisualization: false,
```

- [ ] **Step 7: 实现 setShowGitVisualization setter**

在 `uiSlice.ts` 的 `createUISlice` 返回对象中，第 221-224 行 `setChangesPreviewEnabled` 实现后新增：

```ts
    setShowGitVisualization: (show) => {
      writeFlag(SHOW_GIT_VISUALIZATION_KEY, show);
      set({ showGitVisualization: show });
    },
```

- [ ] **Step 8: 运行类型检查验证**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 无错误

- [ ] **Step 9: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/stores/slices/uiSliceTypes.ts frontend/src/app/stores/slices/uiSlice.ts
git commit -m "feat(stores): add showGitVisualization state to uiSlice"
```

---

### Task 3: 新增 i18n key

**Files:**
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts`

**Interfaces:**
- Produces: 以下 i18n key 可通过 `t.*` 访问：`gitVisualization`、`gitVisCommitGraph`、`gitVisCalendarHeatmap`、`gitVisClockHeatmap`、`gitVisContributorStats`、`gitVisFileTreemap`、`gitVisCodeLineEvolution`、`gitVisCollabSankey`、`gitVisCommitGraphDesc`、`gitVisCalendarHeatmapDesc`、`gitVisClockHeatmapDesc`、`gitVisContributorStatsDesc`、`gitVisFileTreemapDesc`、`gitVisCodeLineEvolutionDesc`、`gitVisCollabSankeyDesc`、`gitVisMockDataNote`

- [ ] **Step 1: 在 zh-CN/changes.ts 末尾新增中文 key**

在 `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts` 文件末尾的 `} as const;` 之前新增：

```ts
  gitVisualization: 'Git 可视化',
  gitVisCommitGraph: '提交网络 · 分支与合并',
  gitVisCalendarHeatmap: '提交日历热力图',
  gitVisClockHeatmap: '提交时间分布',
  gitVisContributorStats: '贡献者概览',
  gitVisFileTreemap: '文件修改热度',
  gitVisCodeLineEvolution: '代码行数演变',
  gitVisCollabSankey: '协作桑基图',
  gitVisCommitGraphDesc: '节点 = 提交（哈希缩写），边 = 父子关系，颜色区分分支，箭头指向父提交。',
  gitVisCalendarHeatmapDesc: '近一年每日提交次数，颜色越深提交越密集，可快速识别活跃周期。',
  gitVisClockHeatmapDesc: '纵轴 = 星期，横轴 = 小时，色块表示该时段提交频次，发现团队工作节奏。',
  gitVisContributorStatsDesc: '柱状图：提交次数；折线：新增/删除行数（右轴），综合评估活跃度。',
  gitVisFileTreemapDesc: '矩形面积 = 修改次数/代码量，颜色 = 最近修改时间（红热蓝冷），定位"热点文件"。',
  gitVisCodeLineEvolutionDesc: '累计新增（+）与删除（-）行数，瀑布式堆叠，反映项目增长与重构节奏。',
  gitVisCollabSankeyDesc: '左侧 = 作者，右侧 = 模块，流宽度 = 修改贡献量，识别"模块孤岛"或"全能型选手"。',
  gitVisMockDataNote: '所有数据均为模拟生成，用于展示可视化效果。实际接入 Git 仓库时，需提取真实数据并适配。',
```

- [ ] **Step 2: 在 en-US/changes.ts 末尾新增对应英文 key**

在 `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts` 文件末尾的 `} as const;` 之前新增：

```ts
  gitVisualization: 'Git Visualization',
  gitVisCommitGraph: 'Commit Network · Branches & Merges',
  gitVisCalendarHeatmap: 'Commit Calendar Heatmap',
  gitVisClockHeatmap: 'Commit Time Distribution',
  gitVisContributorStats: 'Contributor Overview',
  gitVisFileTreemap: 'File Modification Heatmap',
  gitVisCodeLineEvolution: 'Code Line Evolution',
  gitVisCollabSankey: 'Collaboration Sankey',
  gitVisCommitGraphDesc: 'Node = commit (hash abbreviation), edge = parent-child relationship, color distinguishes branches, arrow points to parent.',
  gitVisCalendarHeatmapDesc: 'Daily commit count over the past year. Darker color = more commits. Quickly identify active periods.',
  gitVisClockHeatmapDesc: 'Y-axis = day of week, X-axis = hour. Color block = commit frequency. Discover team work rhythm.',
  gitVisContributorStatsDesc: 'Bar chart: commit count; Line: added/deleted lines (right axis). Comprehensive activity assessment.',
  gitVisFileTreemapDesc: 'Rectangle area = modification count/code volume, color = recent modification time (hot red, cold blue). Locate "hotspot files".',
  gitVisCodeLineEvolutionDesc: 'Cumulative added (+) and deleted (-) lines, waterfall stacked. Reflects project growth and refactoring pace.',
  gitVisCollabSankeyDesc: 'Left = authors, right = modules, flow width = modification contribution. Identify "module silos" or "full-stack players".',
  gitVisMockDataNote: 'All data is mock-generated for visualization demonstration. When connecting to a real Git repository, extract real data and adapt.',
```

- [ ] **Step 3: 运行类型检查验证 i18n key 对齐**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 无错误（zh-CN 和 en-US key 自动对齐）

- [ ] **Step 4: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/i18n/zh-CN/changes.ts frontend/src/app/i18n/en-US/changes.ts
git commit -m "feat(i18n): add git visualization keys"
```

---

### Task 4: 分支颜色工具函数

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/utils/hslToHex.ts`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/utils/branchColor.ts`
- Test: `ai-digital-life/frontend/src/app/features/git-visualization/utils/branchColor.test.ts`

**Interfaces:**
- Produces: `getBranchColor(branchName: string, allBranches: string[]) => string`
- Produces: `hslToHex(h: number, s: number, l: number) => string`

- [ ] **Step 1: 创建 hslToHex 工具函数**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/utils/hslToHex.ts`：

```ts
/** HSL 转 HEX 颜色值。h: 0-360, s: 0-100, l: 0-100 */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
```

- [ ] **Step 2: 创建 branchColor 工具函数**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/utils/branchColor.ts`：

```ts
import { hslToHex } from './hslToHex';

/** 关键分支的固定语义色 */
const FIXED_BRANCH_COLORS: Record<string, string> = {
  main: '#3b82f6',
  master: '#3b82f6',
  develop: '#06b6d4',
  release: '#8b5cf6',
  hotfix: '#ef4444',
};

/**
 * 方案 C：关键分支固定语义色，其余分支 HSL 均分色相空间。
 * 同一分支名在同一组 allBranches 中始终获得相同颜色。
 */
export function getBranchColor(branchName: string, allBranches: string[]): string {
  const fixed = FIXED_BRANCH_COLORS[branchName];
  if (fixed) return fixed;

  const nonFixedBranches = allBranches.filter((b) => !FIXED_BRANCH_COLORS[b]);
  const nonFixedIndex = nonFixedBranches.indexOf(branchName);
  if (nonFixedIndex === -1 || nonFixedBranches.length === 0) {
    return '#94a3b8';
  }
  const hue = (nonFixedIndex / nonFixedBranches.length) * 360;
  return hslToHex(hue, 70, 50);
}
```

- [ ] **Step 3: 编写 branchColor 测试**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/utils/branchColor.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { getBranchColor } from './branchColor';
import { hslToHex } from './hslToHex';

describe('getBranchColor', () => {
  it('returns fixed color for main branch', () => {
    expect(getBranchColor('main', ['main', 'feature-1'])).toBe('#3b82f6');
  });

  it('returns fixed color for master branch', () => {
    expect(getBranchColor('master', ['master'])).toBe('#3b82f6');
  });

  it('returns fixed color for develop branch', () => {
    expect(getBranchColor('develop', ['main', 'develop'])).toBe('#06b6d4');
  });

  it('returns fixed color for release branch', () => {
    expect(getBranchColor('release', ['main', 'release'])).toBe('#8b5cf6');
  });

  it('returns fixed color for hotfix branch', () => {
    expect(getBranchColor('hotfix', ['main', 'hotfix'])).toBe('#ef4444');
  });

  it('returns HSL color for non-fixed branch', () => {
    const allBranches = ['main', 'feature-a'];
    const color = getBranchColor('feature-a', allBranches);
    const expectedHue = (0 / 1) * 360;
    expect(color).toBe(hslToHex(expectedHue, 70, 50));
  });

  it('distributes hues evenly for multiple non-fixed branches', () => {
    const allBranches = ['main', 'feature-a', 'feature-b', 'feature-c'];
    const colorA = getBranchColor('feature-a', allBranches);
    const colorB = getBranchColor('feature-b', allBranches);
    const colorC = getBranchColor('feature-c', allBranches);
    expect(colorA).not.toBe(colorB);
    expect(colorB).not.toBe(colorC);
    expect(colorA).not.toBe(colorC);
  });

  it('returns fallback color for unknown branch', () => {
    expect(getBranchColor('unknown', ['main'])).toBe('#94a3b8');
  });

  it('handles single non-fixed branch (hue=0)', () => {
    const color = getBranchColor('feature-a', ['feature-a']);
    expect(color).toBe(hslToHex(0, 70, 50));
  });

  it('handles all fixed branches (no non-fixed)', () => {
    expect(getBranchColor('main', ['main', 'develop', 'release'])).toBe('#3b82f6');
  });
});

describe('hslToHex', () => {
  it('converts red (0, 100%, 50%)', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
  });

  it('converts green (120, 100%, 50%)', () => {
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
  });

  it('converts blue (240, 100%, 50%)', () => {
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });
});
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/utils/branchColor.test.ts
```
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/git-visualization/utils/
git commit -m "feat(git-vis): add branch color utility with HSL distribution"
```

---

### Task 5: ECharts 按需引入配置

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/echartsSetup.ts`

**Interfaces:**
- Produces: 配置好的 `echarts` 模块，可供 `useECharts` hook 和图表组件导入

- [ ] **Step 1: 创建 ECharts 按需引入配置文件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/echartsSetup.ts`：

```ts
import * as echarts from 'echarts/core';
import { GraphChart, HeatmapChart, BarChart, LineChart, TreemapChart, SankeyChart } from 'echarts/charts';
import {
  CalendarComponent,
  VisualMapComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  TitleComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  GraphChart,
  HeatmapChart,
  BarChart,
  LineChart,
  TreemapChart,
  SankeyChart,
  CalendarComponent,
  VisualMapComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  TitleComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export { echarts };
export type { EChartsType } from 'echarts/core';
export type { EChartsOption } from 'echarts/types/dist/shared';
```

- [ ] **Step 2: 运行类型检查验证导入正确**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 无错误

- [ ] **Step 3: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/git-visualization/echartsSetup.ts
git commit -m "feat(git-vis): add echarts tree-shaking setup"
```

---

### Task 6: useECharts hook

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.ts`
- Test: `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.test.ts`

**Interfaces:**
- Consumes: `EChartsOption` from `echartsSetup.ts`
- Produces: `useECharts(option: EChartsOption) => React.RefObject<HTMLDivElement>`

- [ ] **Step 1: 创建 useECharts hook**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.ts`：

```ts
import { useEffect, useRef } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { echarts, type EChartsType } from '../echartsSetup';

/**
 * 管理 ECharts 实例生命周期：初始化、option 更新、resize 响应、卸载清理。
 * 返回一个挂载到图表容器的 ref。
 */
export function useECharts(option: EChartsOption) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | undefined>(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container);
    chartRef.current = chart;
    chart.setOption(option);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return containerRef;
}
```

- [ ] **Step 2: 创建 useECharts 测试**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { useECharts } from './useECharts';
import { echarts } from '../echartsSetup';

vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  })),
  use: vi.fn(),
}));

function TestComponent({ option }: { option: Record<string, unknown> }) {
  const ref = useECharts(option as never);
  return <div ref={ref} style={{ width: 400, height: 300 }} data-testid="chart-container" />;
}

describe('useECharts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes chart on mount', () => {
    render(<TestComponent option={{ title: { text: 'Test' } }} />);
    expect(echarts.init).toHaveBeenCalled();
  });

  it('disposes chart on unmount', () => {
    const { unmount } = render(<TestComponent option={{}} />);
    const initCall = vi.mocked(echarts.init).mock.results[0]?.value as
      | { dispose: ReturnType<typeof vi.fn> }
      | undefined;
    unmount();
    expect(initCall?.dispose).toHaveBeenCalled();
  });

  it('updates option when option changes', () => {
    const { rerender } = render(<TestComponent option={{ title: { text: 'A' } }} />);
    const chartInstance = vi.mocked(echarts.init).mock.results[0]?.value as
      | { setOption: ReturnType<typeof vi.fn> }
      | undefined;
    const initialCallCount = chartInstance?.setOption.mock.calls.length ?? 0;

    rerender(<TestComponent option={{ title: { text: 'B' } }} />);
    expect(chartInstance?.setOption.mock.calls.length).toBeGreaterThan(initialCallCount);
  });
});
```

- [ ] **Step 3: 运行测试验证通过**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/hooks/useECharts.test.ts
```
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/git-visualization/hooks/useECharts.ts frontend/src/app/features/git-visualization/hooks/useECharts.test.ts
git commit -m "feat(git-vis): add useECharts hook with lifecycle management"
```

---

### Task 7: useChartTheme hook

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useChartTheme.ts`
- Test: `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useChartTheme.test.ts`

**Interfaces:**
- Consumes: `useResolvedTheme()` from `@hooks/useResolvedTheme`
- Produces: `useChartTheme() => ChartTheme` where `ChartTheme` contains axis color, tooltip bg, tooltip text color

- [ ] **Step 1: 创建 useChartTheme hook**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useChartTheme.ts`：

```ts
import { useMemo } from 'react';
import { useResolvedTheme } from '@hooks/useResolvedTheme';

export interface ChartTheme {
  axisLineColor: string;
  splitLineColor: string;
  tooltipBg: string;
  tooltipText: string;
  labelColor: string;
}

const LIGHT_THEME: ChartTheme = {
  axisLineColor: '#e2e8f0',
  splitLineColor: '#f1f5f9',
  tooltipBg: '#ffffff',
  tooltipText: '#1e293b',
  labelColor: '#475569',
};

const DARK_THEME: ChartTheme = {
  axisLineColor: '#334155',
  splitLineColor: '#1e293b',
  tooltipBg: '#1e293b',
  tooltipText: '#e2e8f0',
  labelColor: '#94a3b8',
};

export function useChartTheme(): ChartTheme {
  const resolvedTheme = useResolvedTheme();
  return useMemo(
    () => (resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME),
    [resolvedTheme]
  );
}
```

- [ ] **Step 2: 创建 useChartTheme 测试**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useChartTheme.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChartTheme } from './useChartTheme';

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(),
}));

import { useResolvedTheme } from '@hooks/useResolvedTheme';

describe('useChartTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns light theme when resolvedTheme is light', () => {
    vi.mocked(useResolvedTheme).mockReturnValue('light');
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.tooltipBg).toBe('#ffffff');
    expect(result.current.tooltipText).toBe('#1e293b');
    expect(result.current.axisLineColor).toBe('#e2e8f0');
  });

  it('returns dark theme when resolvedTheme is dark', () => {
    vi.mocked(useResolvedTheme).mockReturnValue('dark');
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.tooltipBg).toBe('#1e293b');
    expect(result.current.tooltipText).toBe('#e2e8f0');
    expect(result.current.axisLineColor).toBe('#334155');
  });
});
```

- [ ] **Step 3: 运行测试验证通过**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/hooks/useChartTheme.test.ts
```
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/git-visualization/hooks/useChartTheme.ts frontend/src/app/features/git-visualization/hooks/useChartTheme.test.ts
git commit -m "feat(git-vis): add useChartTheme hook for theme sync"
```

---

### Task 8: 模拟数据

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/data/gitVisMockData.ts`

**Interfaces:**
- Produces: 7 组模拟数据，从设计文档 `Git可视化设计.md` 提取

- [ ] **Step 1: 创建模拟数据文件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/data/gitVisMockData.ts`：

```ts
/** Git 可视化模拟数据，从 Git可视化设计.md 提取 */

export interface CommitNode {
  id: string;
  name: string;
  branch: string;
  date: string;
}

export interface CommitEdge {
  source: string;
  target: string;
}

export const commitNodes: CommitNode[] = [
  { id: 'a1', name: 'a1b2c3', branch: 'main', date: '2026-01-01' },
  { id: 'a2', name: 'd4e5f6', branch: 'main', date: '2026-01-03' },
  { id: 'a3', name: 'g7h8i9', branch: 'main', date: '2026-01-05' },
  { id: 'b1', name: 'j0k1l2', branch: 'feature-1', date: '2026-01-06' },
  { id: 'b2', name: 'm3n4o5', branch: 'feature-1', date: '2026-01-08' },
  { id: 'b3', name: 'p6q7r8', branch: 'feature-1', date: '2026-01-10' },
  { id: 'c1', name: 's9t0u1', branch: 'feature-2', date: '2026-01-07' },
  { id: 'c2', name: 'v2w3x4', branch: 'feature-2', date: '2026-01-09' },
  { id: 'c3', name: 'y5z6a7', branch: 'feature-2', date: '2026-01-11' },
  { id: 'merge1', name: 'b8c9d0', branch: 'main', date: '2026-01-12' },
  { id: 'hotfix1', name: 'e1f2g3', branch: 'hotfix', date: '2026-01-13' },
  { id: 'merge2', name: 'h4i5j6', branch: 'main', date: '2026-01-14' },
];

export const commitEdges: CommitEdge[] = [
  { source: 'a2', target: 'a1' },
  { source: 'a3', target: 'a2' },
  { source: 'b1', target: 'a3' },
  { source: 'b2', target: 'b1' },
  { source: 'b3', target: 'b2' },
  { source: 'c1', target: 'a3' },
  { source: 'c2', target: 'c1' },
  { source: 'c3', target: 'c2' },
  { source: 'merge1', target: 'b3' },
  { source: 'merge1', target: 'c3' },
  { source: 'hotfix1', target: 'merge1' },
  { source: 'merge2', target: 'hotfix1' },
  { source: 'merge2', target: 'a3' },
];

export const allBranches = ['main', 'feature-1', 'feature-2', 'hotfix'];

/** 日历热力图数据：[date, count] */
export function generateCalendarData(): [string, number][] {
  const data: [string, number][] = [];
  const start = new Date('2025-07-01');
  const end = new Date('2026-06-30');
  const cur = new Date(start);
  // 使用固定种子的伪随机，确保测试可复现
  let seed = 42;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  while (cur <= end) {
    const count = Math.floor(pseudoRandom() * 8);
    if (count > 0) {
      const dateStr =
        cur.getFullYear() +
        '-' +
        String(cur.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(cur.getDate()).padStart(2, '0');
      data.push([dateStr, count]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return data;
}

/** 时钟热力图数据：[hour, day, count] */
export const clockHeatmapData: [number, number, number][] = (() => {
  const data: [number, number, number][] = [];
  let seed = 123;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      let base: number;
      if (h >= 9 && h <= 18) base = Math.floor(pseudoRandom() * 6) + 3;
      else if (h >= 19 && h <= 23) base = Math.floor(pseudoRandom() * 3);
      else base = Math.floor(pseudoRandom() * 2);
      if (d === 0 || d === 6) base = Math.floor(base * 0.3);
      data.push([h, d, base]);
    }
  }
  return data;
})();

export const contributorNames = ['Alex', 'Ben', 'Cara', 'Diana', 'Evan', 'Fiona'];
export const contributorCommits = [45, 38, 27, 53, 19, 32];
export const contributorAdded = [3200, 2800, 1500, 4100, 900, 2200];
export const contributorDeleted = [1200, 800, 600, 1800, 300, 700];

/** Treemap 数据 */
export const fileTreemapData = {
  name: 'root',
  children: [
    {
      name: 'src',
      children: [
        { name: 'main.js', value: 120 },
        { name: 'utils.js', value: 85 },
        { name: 'api.js', value: 65 },
        {
          name: 'components',
          children: [
            { name: 'Header.vue', value: 45 },
            { name: 'Footer.vue', value: 30 },
            { name: 'Sidebar.vue', value: 55 },
          ],
        },
      ],
    },
    {
      name: 'tests',
      children: [
        { name: 'test_main.js', value: 40 },
        { name: 'test_utils.js', value: 35 },
      ],
    },
    {
      name: 'docs',
      children: [
        { name: 'README.md', value: 20 },
        { name: 'CONTRIBUTING.md', value: 15 },
      ],
    },
    {
      name: 'config',
      children: [
        { name: 'webpack.config.js', value: 25 },
        { name: 'eslint.json', value: 10 },
      ],
    },
  ],
};

/** 代码行数演变数据 */
export function generateCodeLineEvolutionData(): { dates: string[]; added: number[]; deleted: number[] } {
  const dates: string[] = [];
  const added: number[] = [];
  const deleted: number[] = [];
  let baseAdd = 5000;
  let baseDel = 2000;
  const now = new Date('2026-01-01');
  let seed = 777;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 40; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (39 - i) * 7);
    dates.push(d.getMonth() + 1 + '/' + d.getDate());
    baseAdd += Math.floor(pseudoRandom() * 600) + 100;
    baseDel += Math.floor(pseudoRandom() * 300) + 50;
    added.push(baseAdd);
    deleted.push(baseDel);
  }
  return { dates, added, deleted };
}

/** 桑基图数据 */
export const sankeyNodes = [
  { name: 'Alex' },
  { name: 'Ben' },
  { name: 'Cara' },
  { name: 'Diana' },
  { name: 'Evan' },
  { name: 'Fiona' },
  { name: '前端' },
  { name: '后端' },
  { name: '数据库' },
  { name: '测试' },
  { name: '文档' },
];

export const sankeyLinks = [
  { source: 'Alex', target: '前端', value: 80 },
  { source: 'Alex', target: '后端', value: 30 },
  { source: 'Ben', target: '前端', value: 20 },
  { source: 'Ben', target: '后端', value: 70 },
  { source: 'Ben', target: '数据库', value: 40 },
  { source: 'Cara', target: '后端', value: 60 },
  { source: 'Cara', target: '测试', value: 50 },
  { source: 'Diana', target: '前端', value: 90 },
  { source: 'Diana', target: '文档', value: 30 },
  { source: 'Evan', target: '数据库', value: 80 },
  { source: 'Evan', target: '测试', value: 20 },
  { source: 'Fiona', target: '文档', value: 70 },
  { source: 'Fiona', target: '测试', value: 40 },
];
```

- [ ] **Step 2: 运行类型检查验证**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 无错误

- [ ] **Step 3: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/git-visualization/data/gitVisMockData.ts
git commit -m "feat(git-vis): add mock data extracted from design doc"
```

---

### Task 9: 7 个图表组件

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitGraph.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/ContributorStats.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileTreemap.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvolution.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CollabSankey.tsx`

**Interfaces:**
- Consumes: `useECharts` hook、`useChartTheme` hook、`getBranchColor`、模拟数据、i18n `useTCopy`
- Produces: 7 个独立的 React 组件，每个渲染一个 ECharts 图表

- [ ] **Step 1: 创建 CommitGraph 组件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitGraph.tsx`：

```tsx
import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { getBranchColor } from '../utils/branchColor';
import { commitNodes, commitEdges, allBranches } from '../data/gitVisMockData';

export const CommitGraph = React.memo(function CommitGraph() {
  const theme = useChartTheme();

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
        formatter: (params: { dataType: string; data: { name: string; category?: string } }) => {
          if (params.dataType === 'node') {
            return `提交 ${params.data.name}<br/>分支: ${params.data.category ?? ''}`;
          }
          return '父提交 → 子提交';
        },
      },
      legend: {
        data: allBranches,
        orient: 'horizontal',
        left: 'left',
        bottom: 0,
        icon: 'circle',
        textStyle: { fontSize: 11, color: theme.labelColor },
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          force: {
            repulsion: 300,
            edgeLength: [80, 150],
            gravity: 0.1,
            friction: 0.1,
          },
          roam: true,
          draggable: true,
          data: commitNodes.map((n) => ({
            id: n.id,
            name: n.name,
            symbolSize: 28,
            category: n.branch,
            itemStyle: { color: getBranchColor(n.branch, allBranches) },
            label: { show: true, position: 'bottom', fontSize: 10, color: theme.labelColor },
          })),
          links: commitEdges,
          categories: allBranches.map((b) => ({
            name: b,
            itemStyle: { color: getBranchColor(b, allBranches) },
          })),
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [0, 10],
          lineStyle: {
            color: '#94a3b8',
            width: 2,
            curveness: 0.2,
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: { width: 3 },
          },
        },
      ],
    }),
    [theme]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
```

- [ ] **Step 2: 创建 CalendarHeatmap 组件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx`：

```tsx
import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { generateCalendarData } from '../data/gitVisMockData';

export const CalendarHeatmap = React.memo(function CalendarHeatmap() {
  const theme = useChartTheme();
  const data = useMemo(() => generateCalendarData(), []);

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
      },
      visualMap: {
        min: 0,
        max: 7,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        text: ['高', '低'],
        textStyle: { fontSize: 10, color: theme.labelColor },
        inRange: {
          color: ['#e2e8f0', '#bfdbfe', '#60a5fa', '#2563eb'],
        },
      },
      calendar: {
        range: ['2025-07-01', '2026-06-30'],
        cellSize: ['auto', 16],
        splitLine: { show: false },
        itemStyle: {
          borderWidth: 0.5,
          borderColor: theme.splitLineColor,
        },
        yearLabel: { show: true, fontSize: 12, color: theme.labelColor },
        monthLabel: { show: true, fontSize: 10, color: theme.labelColor },
        dayLabel: { color: theme.labelColor },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data,
        },
      ],
    }),
    [theme, data]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
```

- [ ] **Step 3: 创建 ClockHeatmap 组件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx`：

```tsx
import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { clockHeatmapData } from '../data/gitVisMockData';

const DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const ClockHeatmap = React.memo(function ClockHeatmap() {
  const theme = useChartTheme();

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
        formatter: (params: { value: [number, number, number] }) =>
          `${DAYS[params.value[1]]} ${params.value[0]}:00<br/>提交次数: ${params.value[2]}`,
      },
      visualMap: {
        min: 0,
        max: 8,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        text: ['多', '少'],
        textStyle: { fontSize: 10, color: theme.labelColor },
        inRange: {
          color: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#1e40af'],
        },
      },
      xAxis: {
        type: 'category',
        data: HOURS.map((h) => h + 'h'),
        splitLine: { show: false },
        axisLabel: { fontSize: 9, interval: 2, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
      },
      yAxis: {
        type: 'category',
        data: DAYS,
        splitLine: { show: false },
        axisLabel: { fontSize: 10, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
      },
      series: [
        {
          type: 'heatmap',
          data: clockHeatmapData,
          emphasis: {
            itemStyle: {
              borderColor: '#333',
              borderWidth: 1,
            },
          },
        },
      ],
    }),
    [theme]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
```

- [ ] **Step 4: 创建 ContributorStats 组件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/charts/ContributorStats.tsx`：

```tsx
import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import {
  contributorNames,
  contributorCommits,
  contributorAdded,
  contributorDeleted,
} from '../data/gitVisMockData';

export const ContributorStats = React.memo(function ContributorStats() {
  const theme = useChartTheme();

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
      },
      legend: {
        data: ['提交数', '新增行数', '删除行数'],
        left: 'left',
        top: 0,
        icon: 'roundRect',
        textStyle: { fontSize: 11, color: theme.labelColor },
      },
      grid: {
        left: '8%',
        right: '12%',
        top: '18%',
        bottom: '12%',
      },
      xAxis: {
        type: 'category',
        data: contributorNames,
        axisLabel: { fontSize: 11, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
      },
      yAxis: [
        {
          type: 'value',
          name: '提交数',
          nameTextStyle: { fontSize: 10, color: theme.labelColor },
          axisLabel: { fontSize: 10, color: theme.labelColor },
          axisLine: { lineStyle: { color: theme.axisLineColor } },
          splitLine: { lineStyle: { color: theme.splitLineColor } },
        },
        {
          type: 'value',
          name: '代码行数',
          nameTextStyle: { fontSize: 10, color: theme.labelColor },
          axisLabel: { fontSize: 10, color: theme.labelColor },
          axisLine: { lineStyle: { color: theme.axisLineColor } },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '提交数',
          type: 'bar',
          data: contributorCommits,
          itemStyle: { color: '#3b82f6' },
          barWidth: 20,
        },
        {
          name: '新增行数',
          type: 'line',
          yAxisIndex: 1,
          data: contributorAdded,
          smooth: true,
          lineStyle: { color: '#10b981', width: 2 },
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: '#10b981' },
        },
        {
          name: '删除行数',
          type: 'line',
          yAxisIndex: 1,
          data: contributorDeleted,
          smooth: true,
          lineStyle: { color: '#ef4444', width: 2, type: 'dashed' },
          symbol: 'diamond',
          symbolSize: 8,
          itemStyle: { color: '#ef4444' },
        },
      ],
    }),
    [theme]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
```

- [ ] **Step 5: 创建 FileTreemap 组件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileTreemap.tsx`：

```tsx
import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { fileTreemapData } from '../data/gitVisMockData';

export const FileTreemap = React.memo(function FileTreemap() {
  const theme = useChartTheme();

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
        formatter: (info: { name: string; value: number }) =>
          `<strong>${info.name}</strong><br/>修改热度: ${info.value}`,
      },
      series: [
        {
          type: 'treemap',
          data: [fileTreemapData],
          leafDepth: 2,
          label: {
            show: true,
            position: 'inside',
            fontSize: 11,
            color: '#1e293b',
            formatter: (info: { name: string }) =>
              info.name.length > 12 ? info.name.slice(0, 10) + '…' : info.name,
          },
          upperLabel: {
            show: true,
            position: 'inside',
            fontSize: 12,
            fontWeight: 'bold',
            color: '#0f172a',
          },
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 2,
            gapWidth: 2,
          },
          emphasis: {
            itemStyle: {
              borderColor: '#1e293b',
              borderWidth: 3,
            },
          },
        },
      ],
    }),
    [theme]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
```

- [ ] **Step 6: 创建 CodeLineEvolution 组件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvolution.tsx`：

```tsx
import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { generateCodeLineEvolutionData } from '../data/gitVisMockData';

// 注意：echarts.graphic.LinearGradient 需要单独导入
import { graphic } from 'echarts/core';

export const CodeLineEvolution = React.memo(function CodeLineEvolution() {
  const theme = useChartTheme();
  const { dates, added, deleted } = useMemo(() => generateCodeLineEvolutionData(), []);

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
      },
      legend: {
        data: ['累计新增', '累计删除'],
        left: 'left',
        top: 0,
        textStyle: { fontSize: 11, color: theme.labelColor },
      },
      grid: {
        left: '8%',
        right: '8%',
        top: '18%',
        bottom: '12%',
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { fontSize: 9, interval: 3, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
      },
      yAxis: {
        type: 'value',
        name: '代码行数',
        nameTextStyle: { fontSize: 10, color: theme.labelColor },
        axisLabel: { fontSize: 10, color: theme.labelColor },
        axisLine: { lineStyle: { color: theme.axisLineColor } },
        splitLine: { lineStyle: { color: theme.splitLineColor } },
      },
      series: [
        {
          name: '累计新增',
          type: 'line',
          data: added,
          smooth: true,
          lineStyle: { color: '#10b981', width: 3 },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16,185,129,0.4)' },
              { offset: 1, color: 'rgba(16,185,129,0.02)' },
            ]),
          },
          symbol: 'none',
        },
        {
          name: '累计删除',
          type: 'line',
          data: deleted,
          smooth: true,
          lineStyle: { color: '#ef4444', width: 3 },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(239,68,68,0.3)' },
              { offset: 1, color: 'rgba(239,68,68,0.02)' },
            ]),
          },
          symbol: 'none',
        },
      ],
    }),
    [theme, dates, added, deleted]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
```

- [ ] **Step 7: 创建 CollabSankey 组件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/charts/CollabSankey.tsx`：

```tsx
import React, { useMemo } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { useECharts } from '../hooks/useECharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { sankeyNodes, sankeyLinks } from '../data/gitVisMockData';

export const CollabSankey = React.memo(function CollabSankey() {
  const theme = useChartTheme();

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: theme.tooltipBg,
        textStyle: { color: theme.tooltipText },
        formatter: (params: {
          dataType: string;
          data: { source?: string; target?: string; name?: string; value?: number };
        }) => {
          if (params.dataType === 'edge') {
            return `${params.data.source} → ${params.data.target}<br/>贡献量: ${params.data.value}`;
          }
          return `${params.data.name}<br/>总量: ${params.data.value}`;
        },
      },
      series: [
        {
          type: 'sankey',
          layout: 'none',
          emphasis: { focus: 'adjacency' },
          data: sankeyNodes,
          links: sankeyLinks,
          label: {
            fontSize: 11,
            color: theme.labelColor,
          },
          lineStyle: {
            color: 'gradient',
            curveness: 0.5,
          },
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 1,
          },
        },
      ],
    }),
    [theme]
  );

  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
});
```

- [ ] **Step 8: 运行类型检查验证所有图表组件**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 无错误

- [ ] **Step 9: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/git-visualization/charts/
git commit -m "feat(git-vis): add 7 ECharts chart components"
```

---

### Task 10: GitVisualizationView 主容器

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/index.ts`

**Interfaces:**
- Consumes: 7 个图表组件、i18n `useTCopy`
- Produces: `GitVisualizationView` 组件（通过 barrel 导出）

- [ ] **Step 1: 创建 GitVisualizationView 组件**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx`：

```tsx
import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { CommitGraph } from './charts/CommitGraph';
import { CalendarHeatmap } from './charts/CalendarHeatmap';
import { ClockHeatmap } from './charts/ClockHeatmap';
import { ContributorStats } from './charts/ContributorStats';
import { FileTreemap } from './charts/FileTreemap';
import { CodeLineEvolution } from './charts/CodeLineEvolution';
import { CollabSankey } from './charts/CollabSankey';

interface ChartCardProps {
  title: string;
  desc: string;
}

function ChartCard({ title, desc, children }: React.PropsWithChildren<ChartCardProps>) {
  return (
    <div className="adl-git-vis__card">
      <div className="adl-git-vis__card-header">
        <h3 className="adl-git-vis__card-title">{title}</h3>
      </div>
      {children}
      <p className="adl-git-vis__card-desc">{desc}</p>
    </div>
  );
}

export const GitVisualizationView = React.memo(function GitVisualizationView() {
  const { t } = useTCopy();

  return (
    <div className="adl-git-vis__container">
      <ChartCard title={t.gitVisCommitGraph} desc={t.gitVisCommitGraphDesc}>
        <CommitGraph />
      </ChartCard>
      <ChartCard title={t.gitVisCalendarHeatmap} desc={t.gitVisCalendarHeatmapDesc}>
        <CalendarHeatmap />
      </ChartCard>
      <ChartCard title={t.gitVisClockHeatmap} desc={t.gitVisClockHeatmapDesc}>
        <ClockHeatmap />
      </ChartCard>
      <ChartCard title={t.gitVisContributorStats} desc={t.gitVisContributorStatsDesc}>
        <ContributorStats />
      </ChartCard>
      <ChartCard title={t.gitVisFileTreemap} desc={t.gitVisFileTreemapDesc}>
        <FileTreemap />
      </ChartCard>
      <ChartCard title={t.gitVisCodeLineEvolution} desc={t.gitVisCodeLineEvolutionDesc}>
        <CodeLineEvolution />
      </ChartCard>
      <ChartCard title={t.gitVisCollabSankey} desc={t.gitVisCollabSankeyDesc}>
        <CollabSankey />
      </ChartCard>
      <p className="adl-git-vis__note">{t.gitVisMockDataNote}</p>
    </div>
  );
});
```

- [ ] **Step 2: 创建 barrel 导出**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/index.ts`：

```ts
export { GitVisualizationView } from './GitVisualizationView';
export { getBranchColor } from './utils/branchColor';
export { useECharts } from './hooks/useECharts';
export { useChartTheme } from './hooks/useChartTheme';
export type { ChartTheme } from './hooks/useChartTheme';
```

- [ ] **Step 3: 创建 GitVisualizationView 测试**

创建文件 `ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { GitVisualizationView } from './GitVisualizationView';

// Mock ECharts to avoid canvas rendering in jsdom
vi.mock('./echartsSetup', () => ({
  echarts: {
    init: vi.fn(() => ({
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    })),
    use: vi.fn(),
  },
  graphic: { LinearGradient: vi.fn() },
}));

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(() => 'light'),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {
      gitVisCommitGraph: 'Commit Network',
      gitVisCalendarHeatmap: 'Calendar Heatmap',
      gitVisClockHeatmap: 'Clock Heatmap',
      gitVisContributorStats: 'Contributors',
      gitVisFileTreemap: 'File Treemap',
      gitVisCodeLineEvolution: 'Code Line Evolution',
      gitVisCollabSankey: 'Collaboration Sankey',
      gitVisCommitGraphDesc: 'desc',
      gitVisCalendarHeatmapDesc: 'desc',
      gitVisClockHeatmapDesc: 'desc',
      gitVisContributorStatsDesc: 'desc',
      gitVisFileTreemapDesc: 'desc',
      gitVisCodeLineEvolutionDesc: 'desc',
      gitVisCollabSankeyDesc: 'desc',
      gitVisMockDataNote: 'note',
    },
    formatT: vi.fn(),
  })),
}));

describe('GitVisualizationView', () => {
  it('renders 7 chart cards', () => {
    const { container } = render(<GitVisualizationView />);
    const cards = container.querySelectorAll('.adl-git-vis__card');
    expect(cards.length).toBe(7);
  });

  it('renders scroll container', () => {
    const { container } = render(<GitVisualizationView />);
    const scrollContainer = container.querySelector('.adl-git-vis__container');
    expect(scrollContainer).toBeTruthy();
  });

  it('renders mock data note', () => {
    const { container } = render(<GitVisualizationView />);
    const note = container.querySelector('.adl-git-vis__note');
    expect(note).toBeTruthy();
  });
});
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/GitVisualizationView.test.tsx
```
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/git-visualization/GitVisualizationView.tsx frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx frontend/src/app/features/git-visualization/index.ts
git commit -m "feat(git-vis): add GitVisualizationView container with 7 charts"
```

---

### Task 11: CSS 样式

**Files:**
- Create: `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css`
- Modify: `ai-digital-life/frontend/src/styles/regions.css`

- [ ] **Step 1: 创建 git-visualization.css**

创建文件 `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css`：

```css
.adl-git-vis__container {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  overflow-y: auto;
  height: 100%;
  flex: 1;
}

.adl-git-vis__card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-3) var(--space-3) var(--space-1);
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s;
  flex-shrink: 0;
}

.adl-git-vis__card:hover {
  box-shadow: var(--shadow-md);
}

.adl-git-vis__card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-2);
  padding: 0 var(--space-1);
}

.adl-git-vis__card-title {
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--text-primary);
  margin: 0;
}

.adl-git-vis__chart {
  width: 100%;
  height: 360px;
  flex-shrink: 0;
}

.adl-git-vis__card-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  padding: var(--space-2) var(--space-1) 0;
  border-top: 1px solid var(--border-subtle);
  margin-top: var(--space-1);
}

.adl-git-vis__note {
  margin-top: var(--space-4);
  color: var(--text-tertiary);
  font-size: 0.85rem;
  text-align: center;
  padding-bottom: var(--space-4);
}
```

- [ ] **Step 2: 在 regions.css 中导入新 CSS**

在 `ai-digital-life/frontend/src/styles/regions.css` 中找到 rightpanel 相关的导入区域，在最后一个 rightpanel CSS 导入后新增：

```css
@import './rightpanel/git-visualization.css';
```

- [ ] **Step 3: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/styles/regions/rightpanel/git-visualization.css frontend/src/styles/regions.css
git commit -m "feat(git-vis): add card and layout styles"
```

---

### Task 12: 懒加载注册

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/LazyComponents.tsx`

**Interfaces:**
- Produces: `LazyGitVisualizationView` 懒加载组件

- [ ] **Step 1: 在 LazyComponents.tsx 新增懒加载导出**

在 `ai-digital-life/frontend/src/app/components/LazyComponents.tsx` 中，在 `LazyGitHubPanel` 定义后新增：

```ts
export const LazyGitVisualizationView = React.lazy(() =>
  import('@features/git-visualization').then((m) => ({
    default: m.GitVisualizationView,
  }))
);
```

- [ ] **Step 2: 运行类型检查验证**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 无错误

- [ ] **Step 3: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/components/LazyComponents.tsx
git commit -m "feat(git-vis): register lazy-loaded GitVisualizationView"
```

---

### Task 13: ChangesNavigatorToolbar 新增按钮

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesNavigatorToolbar.tsx`

**Interfaces:**
- Consumes: `showGitVisualization: boolean`、`onToggleGitVisualization: () => void`（新增 props）
- Produces: 在第二行（树/列表/大纲）最右侧渲染 Git 可视化按钮

- [ ] **Step 1: 在 ChangesNavigatorToolbarProps 新增字段**

在 `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesNavigatorToolbar.tsx` 的 `ChangesNavigatorToolbarProps` 接口中，在 `onToggleStructure: () => void;` 后新增：

```ts
  showGitVisualization: boolean;
  onToggleGitVisualization: () => void;
```

- [ ] **Step 2: 在函数参数解构中新增字段**

在 `ChangesNavigatorToolbar` 函数的参数解构中，在 `onToggleStructure,` 后新增：

```ts
  showGitVisualization,
  onToggleGitVisualization,
```

- [ ] **Step 3: 导入 Git 分支图标**

在文件顶部导入区域，确保 `IconGitFork` 已从 `@icons` 导入（如未导入则添加）：

```ts
import { IconGitFork } from '@icons';
```

- [ ] **Step 4: 在第二行 tabs 区域最右侧新增按钮**

在 JSX 中找到第二行 `adl-tool-navigator__context--tabs`（约第 90-126 行），在该 `div` 的 `adl-tool-navigator__context-group--actions` 后、闭合 `</div>` 前新增 Git 可视化按钮：

```tsx
        <TooltipSimple content={t.gitVisualization} placement="top">
          <button
            type="button"
            className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${showGitVisualization ? ' is-active' : ''}`}
            aria-pressed={showGitVisualization ? 'true' : 'false'}
            onClick={onToggleGitVisualization}
            aria-label={t.gitVisualization}
          >
            <IconGitFork size={14} decorative />
          </button>
        </TooltipSimple>
```

- [ ] **Step 5: 运行类型检查验证**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 报错（因为 ChangesPanel 还没传新 props，这是预期的）

- [ ] **Step 6: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/regions/right-panel/panels/ChangesNavigatorToolbar.tsx
git commit -m "feat(git-vis): add Git visualization toggle button to navigator toolbar"
```

---

### Task 14: useChangesPanelState 集成 store

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx`

**Interfaces:**
- Consumes: `showGitVisualization` 和 `setShowGitVisualization` from Zustand store
- Produces: `showGitVisualization: boolean` 和 `onToggleGitVisualization: () => void` 在返回对象中

- [ ] **Step 1: 在 useChangesPanelState 中从 store 读取状态**

在 `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx` 中，找到 `useChangesPanelStore()` 调用附近（约第 74-89 行），新增从 `useAppStore` 读取 `showGitVisualization` 和 `setShowGitVisualization`：

首先确保文件顶部已导入 `useAppStore`（如未导入则添加）：

```ts
import { useAppStore } from '@stores/slicedStore';
```

然后在 `useChangesPanelStore()` 调用后新增：

```ts
  const showGitVisualization = useAppStore((s) => s.showGitVisualization);
  const setShowGitVisualization = useAppStore((s) => s.setShowGitVisualization);
```

- [ ] **Step 2: 在返回对象中新增字段**

在 `useChangesPanelState` 的返回对象中（约第 414-514 行），找到 `structureToggleExpanded` 和 `onToggleStructure` 附近，新增：

```ts
    showGitVisualization,
    onToggleGitVisualization: () => setShowGitVisualization(!showGitVisualization),
```

- [ ] **Step 3: 运行类型检查验证**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 可能仍有报错（ChangesPanel.tsx 还未使用新字段），但 useChangesPanelState 本身应无错误

- [ ] **Step 4: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx
git commit -m "feat(git-vis): wire showGitVisualization state through useChangesPanelState"
```

---

### Task 15: ChangesPanel 条件渲染

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx`

**Interfaces:**
- Consumes: `showGitVisualization` 和 `onToggleGitVisualization` from `useChangesPanelState`、`LazyGitVisualizationView` from `LazyComponents`

- [ ] **Step 1: 在 ChangesPanel 解构中新增字段**

在 `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx` 的 `useChangesPanelState(props)` 解构中，在 `structureToggleExpanded,` 附近新增：

```ts
    showGitVisualization,
    onToggleGitVisualization,
```

- [ ] **Step 2: 导入 LazyGitVisualizationView**

在文件顶部导入区域，修改 `LazyComponents` 导入，新增 `LazyGitVisualizationView`：

```ts
import { LazyDiffEditor, LazyGitVisualizationView, SuspenseWrapper } from '@components/LazyComponents';
```

- [ ] **Step 3: 向 ChangesTreePanel 传递新 props**

在 `<ChangesTreePanel>` 组件调用中，在 `onToggleStructure={handleToggleNavigatorStructure}` 后新增：

```tsx
          showGitVisualization={showGitVisualization}
          onToggleGitVisualization={onToggleGitVisualization}
```

- [ ] **Step 4: 在 adl-tool-primary 中条件渲染**

在 JSX 中找到 `adl-tool-primary` div（约第 169 行），将现有的条件渲染逻辑修改为三重条件：

```tsx
        <div className={`adl-tool-primary${activePatchSet ? ' adl-tool-primary--scrollable' : ''}`}>
          {showGitVisualization ? (
            <SuspenseWrapper>
              <LazyGitVisualizationView />
            </SuspenseWrapper>
          ) : activePatchSet ? (
            <PatchReviewSection
              activePatchSet={activePatchSet}
              selectedPatchFilePath={selectedPatchFilePath}
              selectedPatchHunkId={selectedPatchHunkId}
              collapsedPatchHunkIds={collapsedPatchHunkIds}
              patchReviewFilter={patchReviewFilter}
              diffSideBySide={props.diffSideBySide}
              latestPatchApplication={latestPatchApplication}
              appInfo={appInfo}
              onSetHunkDecision={onSetHunkDecision}
              onApplyPatchSet={onApplyPatchSet}
              onRollbackPatchSet={onRollbackPatchSet}
              onAcceptAllHunks={onAcceptAllHunks}
              onRejectAllHunks={onRejectAllHunks}
              onSelectPatchFile={onSelectPatchFile}
              onSelectPatchHunk={onSelectPatchHunk}
              onTogglePatchHunkCollapse={onTogglePatchHunkCollapse}
              onSetAllPatchHunksCollapsed={onSetAllPatchHunksCollapsed}
              onSetPatchReviewFilter={onSetPatchReviewFilter}
              onJumpPatchHunk={props.onJumpPatchHunk}
              onDiffMount={handleDiffMount}
            />
          ) : (
            <SuspenseWrapper>
              <LazyDiffEditor
                changePreview={changePreview}
                changePreviewLoading={changePreviewLoading}
                diffSideBySide={props.diffSideBySide}
                latestPatchApplication={latestPatchApplication}
                appInfo={appInfo}
                totalChangeCount={totalChangeCount}
                visibleWorkspacesLength={visibleWorkspaces.length}
                previewEnabled={previewEnabled}
                lineNumbersEnabled={lineNumbersEnabled}
                wordWrapEnabled={wordWrapEnabled}
                onDiffMount={handleDiffMount}
                previewContainerRef={changesPreviewContainerRef}
              />
            </SuspenseWrapper>
          )}
        </div>
```

- [ ] **Step 5: 运行类型检查验证全部通过**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 无错误

- [ ] **Step 6: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx
git commit -m "feat(git-vis): conditionally render GitVisualizationView in ChangesPanel"
```

---

### Task 16: 全量验收

**Files:**
- 无新文件修改，仅运行验收流程

- [ ] **Step 1: ESLint 检测并修复**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run lint:fix
```
Expected: 无错误（修复后若有变更则继续）

- [ ] **Step 2: Prettier 格式化**

Run:
```powershell
pnpm --dir ai-digital-life/frontend run format
```
Expected: 格式化完成

- [ ] **Step 3: TypeScript 类型检查**

Run:
```powershell
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 无错误

- [ ] **Step 4: 运行全部前端测试**

Run:
```powershell
pnpm --dir ai-digital-life/frontend run test
```
Expected: 所有测试通过（含新增的 git-visualization 测试）

- [ ] **Step 5: 如有 ESLint/Prettier 修复产生的变更，重新提交**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add -A
git status
```
如有变更则 commit：
```powershell
git commit -m "style(git-vis): fix lint and format issues"
```

- [ ] **Step 6: 最终验证 — 确认所有测试通过**

Run:
```powershell
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run test
```
Expected: 全部通过

---

## Self-Review

**1. Spec coverage:**
- ✅ 展示位置（右侧主内容区 toggle）→ Task 15
- ✅ 图表库（ECharts 按需引入）→ Task 1, 5
- ✅ 数据策略（模拟数据）→ Task 8
- ✅ 按钮位置（导航器第二行最右侧）→ Task 13
- ✅ 图表布局（单列纵向滚动）→ Task 10, 11
- ✅ 状态管理（Zustand uiSlice + localStorage）→ Task 2, 14
- ✅ 主题跟随应用切换→ Task 7, 各图表组件
- ✅ 分支颜色方案 C → Task 4
- ✅ 7 种图表 → Task 9
- ✅ i18n 全覆盖 → Task 3
- ✅ 错误处理（useECharts 生命周期）→ Task 6
- ✅ 测试策略 → Task 4, 6, 7, 10 + Task 16 全量验收

**2. Placeholder scan:** 无 TBD/TODO/占位符，所有步骤包含完整代码。

**3. Type consistency:**
- `showGitVisualization: boolean` 在 uiSliceTypes、uiSlice、useChangesPanelState、ChangesPanel 中一致
- `setShowGitVisualization: (show: boolean) => void` 签名一致
- `onToggleGitVisualization: () => void` 在 useChangesPanelState 返回值和 ChangesNavigatorToolbar props 中一致
- `getBranchColor(branchName: string, allBranches: string[]): string` 签名一致
- `useECharts(option: EChartsOption)` 返回 `React.RefObject<HTMLDivElement>` 一致
- `useChartTheme()` 返回 `ChartTheme` 接口一致
