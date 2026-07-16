# Git 可视化功能设计文档

## 概述

在变更面板（Changes Panel）中新增"Git 可视化"按钮，点击后在右侧主内容区 toggle 显示 7 种 Git 可视化图表（基于 ECharts），再次点击恢复原 Diff 查看器视图。

## 决策汇总

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 展示位置 | 右侧主内容区（`adl-tool-primary`），toggle 切换 | 与文件树并排，不破坏现有布局 |
| 图表库 | ECharts，按需引入 `echarts/core` | 7 种图表全部内置，设计文档已有完整 option 配置 |
| 数据策略 | 先模拟数据，后续迭代真数据 | 风险低，快速验证 UI |
| 按钮位置 | 导航器第二行（树/列表/大纲）最右侧 | 用户指定，刷新按钮正下方 |
| 图表布局 | 单列纵向滚动 | 用户指定 |
| 状态管理 | Zustand uiSlice，localStorage 持久化 | 切换面板后保留状态 |
| 主题 | 跟随应用深浅主题切换 | 用户要求 |
| 分支颜色 | 方案 C：主分支固定 + 其余 HSL 均分 | 语义稳定 + 永不重复 |

## Section 1：架构设计

### 整体结构

```
ChangesPanel
├── ChangesToolbar (顶部工具栏，不变)
├── adl-tool-surface (左右分栏)
│   ├── ChangesTreePanel (左侧导航器)
│   │   ├── ChangesNavigatorToolbar
│   │   │   ├── 第一行：展开/折叠 + 标题 + 变更数 + 刷新按钮
│   │   │   ├── 第二行：树/列表/大纲 + [新增] Git可视化按钮
│   │   │   └── 第三行：Staged/Modified/Untracked 统计
│   │   └── 变更树/列表/大纲内容
│   └── adl-tool-primary (右侧主内容区)
│       ├── [showGitVis=false] → LazyDiffEditor (现有行为)
│       └── [showGitVis=true]  → GitVisualizationView (新增)
│           └── 7 个 ECharts 图表卡片，纵向滚动
```

### 数据流

```
uiSlice.showGitVisualization (Zustand, localStorage 持久化)
  → ChangesNavigatorToolbar 读取，渲染按钮 active 态
  → ChangesPanel 读取，条件渲染 GitVisualizationView / DiffEditor
  → GitVisualizationView 内部使用 mock 数据，不依赖后端
```

### 涉及文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `frontend/src/app/stores/slices/uiSlice.ts` | 修改 | 新增 `showGitVisualization` + `toggleGitVisualization` action |
| `frontend/src/app/regions/right-panel/panels/ChangesNavigatorToolbar.tsx` | 修改 | 新增 Git 可视化按钮 |
| `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx` | 修改 | 条件渲染 GitVisualizationView |
| `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.ts` | 修改 | 传递 `showGitVisualization` 和 `onToggleGitVisualization` |
| `frontend/src/app/features/git-visualization/GitVisualizationView.tsx` | 新增 | 主容器组件 |
| `frontend/src/app/features/git-visualization/charts/*.tsx` | 新增 | 7 个独立 ECharts 图表组件 |
| `frontend/src/app/features/git-visualization/hooks/useECharts.ts` | 新增 | ECharts 实例生命周期管理 |
| `frontend/src/app/features/git-visualization/hooks/useChartTheme.ts` | 新增 | 主题配色 hook |
| `frontend/src/app/features/git-visualization/utils/branchColor.ts` | 新增 | 分支颜色分配（方案 C） |
| `frontend/src/app/features/git-visualization/data/gitVisMockData.ts` | 新增 | 模拟数据（从设计文档提取） |
| `frontend/src/app/i18n/*.ts` | 修改 | 新增 i18n key |
| `frontend/src/styles/regions/rightpanel/git-visualization.css` | 新增 | 图表卡片样式 |

## Section 2：组件设计

### GitVisualizationView（主容器）

```
GitVisualizationView
├── 滚动容器 (overflow-y: auto, 占满 adl-tool-primary)
│   ├── CommitGraph       # 提交网络图
│   ├── CalendarHeatmap   # 日历热力图
│   ├── ClockHeatmap      # 时钟热力图
│   ├── ContributorStats  # 贡献者概览
│   ├── FileTreemap       # 文件修改热度
│   ├── CodeLineEvolution # 代码行数演变
│   └── CollabSankey      # 协作桑基图
```

每个图表卡片结构：

```
.adl-git-vis__card
├── .adl-git-vis__card-header
│   ├── h3 (标题)
│   └── span.badge (维度标签)
├── .adl-git-vis__chart (ECharts 容器, 固定高度 360px)
└── .adl-git-vis__card-desc (描述文案)
```

### 7 种图表组件

| 组件名 | ECharts type | 说明 |
|--------|-------------|------|
| `CommitGraph` | `graph` (force layout) | 力导向布局，节点=提交，边=父子关系，颜色区分分支 |
| `CalendarHeatmap` | `heatmap` + `calendar` | GitHub 风格日历矩阵，近一年每日提交数 |
| `ClockHeatmap` | `heatmap` | 星期 vs 小时，色块表示提交频次 |
| `ContributorStats` | `bar` + `line` | 柱状图提交数 + 折线新增/删除行数（双轴） |
| `FileTreemap` | `treemap` | 矩形面积=修改次数，颜色=最近修改时间 |
| `CodeLineEvolution` | `line` + `area` | 累计新增/删除行数，面积堆叠 |
| `CollabSankey` | `sankey` | 作者→模块，流宽度=贡献量 |

### ECharts 集成：useECharts hook

```ts
// hooks/useECharts.ts
function useECharts(option: EChartsOption) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    chart.setOption(option);

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true); // notMerge=true
  }, [option]);

  return ref;
}
```

### ECharts 按需引入

```ts
// 仅引入需要的模块，控制包体积
import * as echarts from 'echarts/core';
import { GraphChart, HeatmapChart, BarChart, LineChart, TreemapChart, SankeyChart } from 'echarts/charts';
import { CalendarComponent, VisualMapComponent, TooltipComponent, LegendComponent, GridComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  GraphChart, HeatmapChart, BarChart, LineChart, TreemapChart, SankeyChart,
  CalendarComponent, VisualMapComponent, TooltipComponent, LegendComponent, GridComponent, TitleComponent,
  CanvasRenderer,
]);
```

## Section 3：主题同步设计

### 机制

```
应用主题切换 (ThemeController)
  → <html data-theme="dark|light"> 变化
    → useResolvedTheme() 返回新值
      → useChartTheme() 重新计算配色
        → useECharts 收到新 option
          → chart.setOption(newOption, true) // notMerge 完全替换
```

### 配色策略

| 元素 | Light 主题 | Dark 主题 |
|------|-----------|-----------|
| 卡片背景 | `var(--bg-elevated)` | `var(--bg-elevated)` |
| 卡片阴影 | `var(--shadow-sm)` | `var(--shadow-sm)` |
| 标题文字 | `var(--text-primary)` | `var(--text-primary)` |
| 描述文字 | `var(--text-secondary)` | `var(--text-secondary)` |
| 轴线/网格 | `#e2e8f0` | `#334155` |
| tooltip 背景 | `#ffffff` | `#1e293b` |
| tooltip 文字 | `#1e293b` | `#e2e8f0` |

**图表语义色保持不变**（绿=新增、红=删除、蓝=主分支），仅调整背景、文字、网格等容器元素颜色。

### 实现方式

```ts
// hooks/useChartTheme.ts
function useChartTheme() {
  const resolvedTheme = useResolvedTheme();
  return useMemo(
    () => resolvedTheme === 'dark' ? DARK_CHART_THEME : LIGHT_CHART_THEME,
    [resolvedTheme]
  );
}

// 每个图表组件
function CalendarHeatmap() {
  const theme = useChartTheme();
  const option = useMemo(() => buildCalendarOption(theme), [theme]);
  const ref = useECharts(option);
  return <div ref={ref} className="adl-git-vis__chart" />;
}
```

卡片容器背景、文字颜色通过 CSS 变量自动跟随主题：

```css
.adl-git-vis__card {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}
.adl-git-vis__card-desc {
  color: var(--text-secondary);
  border-top: 1px solid var(--border-subtle);
}
```

### 关键约束

- 遵循 [design-system.md](../../../.trae/rules/design-system.md) 规则：所有颜色必须使用 `var(--…)` CSS 变量
- 使用 `useResolvedTheme()` hook 获取当前主题，禁止直接读取 `appInfo.config.resolvedTheme`
- `setOption` 第二参数传 `true`（notMerge），确保旧主题颜色被完全替换

## Section 4：分支颜色方案（方案 C）

### 策略

关键分支（`main`/`master`/`develop`/`release`）使用固定语义色，其余分支用 HSL 均分剩余色相空间。

### 固定语义色

| 分支名 | 颜色 | 色值 |
|--------|------|------|
| `main` / `master` | 蓝 | `#3b82f6` |
| `develop` | 青 | `#06b6d4` |
| `release` | 紫 | `#8b5cf6` |
| `hotfix` | 红 | `#ef4444` |

### 非关键分支 HSL 均分算法

```ts
// utils/branchColor.ts
const FIXED_BRANCH_COLORS: Record<string, string> = {
  main: '#3b82f6',
  master: '#3b82f6',
  develop: '#06b6d4',
  release: '#8b5cf6',
  hotfix: '#ef4444',
};

function getBranchColor(branchName: string, allBranches: string[], index: number): string {
  // 关键分支走固定色
  const fixed = FIXED_BRANCH_COLORS[branchName];
  if (fixed) return fixed;

  // 非关键分支均分色相空间
  const nonFixedBranches = allBranches.filter(b => !FIXED_BRANCH_COLORS[b]);
  const nonFixedIndex = nonFixedBranches.indexOf(branchName);
  const total = nonFixedBranches.length;
  const hue = (nonFixedIndex / total) * 360;
  return hslToHex(hue, 70, 50); // 固定饱和度 70%，亮度 50%
}
```

### 边界情况

- 0 个分支：不渲染图表，显示空状态
- 1 个分支：若为关键分支走固定色，否则 hue=0（红色）
- 全部是关键分支：均分逻辑不触发
- 全部是非关键分支：正常均分

## Section 5：状态管理

### uiSlice 变更

```ts
// uiSlice.ts 新增字段
showGitVisualization: boolean;  // 默认 false
toggleGitVisualization: () => void;
```

### localStorage 持久化

`showGitVisualization` 纳入 uiSlice 现有的 localStorage 持久化机制，刷新页面后保留上次状态。

遵循 [zustand-patterns.md](../../../.trae/rules/zustand-patterns.md) 规范。

## Section 6：错误处理与边界情况

### 图表渲染失败

```
useECharts hook
├── init 失败 → console.warn + 渲染空卡片（不阻断其他图表）
├── setOption 失败 → console.warn + 保留上次有效状态
└── 容器尺寸为 0 → 跳过初始化，等待 ResizeObserver 触发后再 init
```

遵循 [error-handling.md](../../../.trae/rules/error-handling.md) 规则：禁止空 catch 块。

### 面板尺寸边界

- 图表容器固定高度 360px，宽度 100% 自适应
- 容器宽度 < 300px 时，ECharts 自动压缩图例和标签
- 容器宽度 < 200px 时，可读性下降（可接受，用户可拖宽面板）

### 主题切换时序

`setOption` 第二参数传 `true`（notMerge），确保旧主题颜色被完全替换，不残留。

### i18n 全覆盖

| 文本 | i18n key |
|------|----------|
| 按钮 tooltip | `gitVisualization` |
| 图表标题 | `gitVisCommitGraph` / `gitVisCalendarHeatmap` / `gitVisClockHeatmap` / `gitVisContributorStats` / `gitVisFileTreemap` / `gitVisCodeLineEvolution` / `gitVisCollabSankey` |
| 维度标签 | `gitVisDimension1` ~ `gitVisDimension5` |
| 卡片描述 | `gitVisCommitGraphDesc` / ... |
| 底部说明 | `gitVisMockDataNote` |

## Section 7：测试策略

### 测试层级

L3 全量级（新增功能 + 新组件 + Store 切片变更）。

### 前端测试（Vitest + jsdom）

| 测试文件 | 测试范围 |
|----------|----------|
| `uiSlice.test.ts` | `showGitVisualization` 初始值、`toggleGitVisualization` action、localStorage 持久化 |
| `useECharts.test.ts` | hook 初始化、option 更新、resize 响应、卸载时 dispose |
| `useChartTheme.test.ts` | light/dark 主题返回正确配色对象 |
| `branchColor.test.ts` | 主分支固定色、非主分支 HSL 均分、边界情况（0/1/大量分支） |
| `GitVisualizationView.test.tsx` | 渲染 7 个图表卡片、滚动容器存在、主题切换时 re-render |
| `ChangesNavigatorToolbar.test.tsx` | Git 可视化按钮渲染、点击触发 toggle、active 状态正确 |

### 不测试的部分

- ECharts 内部渲染逻辑（第三方库职责）
- 模拟数据的准确性（非业务逻辑）
- CSS 视觉效果（用户自行验证）

### 验收命令

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

## Section 8：依赖变更

### 新增前端依赖

| 包 | 用途 | 预估体积 (gzip) |
|----|------|----------------|
| `echarts` | 图表渲染（按需引入） | ~120KB |

## Section 9：后续迭代方向

1. **真实数据接入**：通过 Rust 后端调用 `git log` 等命令提取真实数据，新增 Tauri Command 返回结构化数据
2. **交互增强**：提交网络图单击节点跳转详情、日历热力图点击日期显示当日提交、Treemap 钻取子目录
3. **性能优化**：大型仓库服务端预聚合、定时刷新或 WebSocket 实时更新
4. **暗色主题精细化**：ECharts `registerTheme()` 注册完整暗色主题，进一步优化视觉一致性
