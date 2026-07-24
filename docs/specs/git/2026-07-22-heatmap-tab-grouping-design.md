# Heatmap Tab Grouping — Git 可视化热力图标签切换设计

## 概述

将 Git 可视化面板中的 4 张热力图图表（CalendarHeatmap、ClockHeatmap、ContributorActivityHeatmap、ContributorModuleHeatmap）合并为一张卡片，通过下滑线导航菜单切换展示。同时统一缩短全部 8 个图表卡片标题。

## 组件架构

```
GitVisualizationView
├── HeatmapCardGroup (新增)        ← 4 热力图合并
│   ├── [下划线导航栏]             ← 日历 | 时段 | 活跃度 | 模块
│   ├── [活跃图表区域]             ← 条件渲染对应热力图
│   └── [活跃描述文字]             ← 跟随切换
├── ChartCard (代码行演变)         ← 保持独立
├── ChartCard (提交时间线)         ← 保持独立
├── ChartCard (文件旭日图)         ← 保持独立
├── ChartCard (分支图谱)           ← 保持独立
└── p.gitVisMockDataNote
```

## 数据流与状态管理

- `activeHeatmapTab` 存入 Zustand `uiSlice`，localStorage 持久化
- key: `'adl-ui:active-heatmap-tab'`
- 类型: `'calendar' | 'clock' | 'activity' | 'module'`
- 默认值: `'calendar'`
- 生命周期: 关闭 Git 可视化/切换面板 → 状态保留 → 重新打开恢复
- 遵循 `showGitVisualization` 现有模式（readJson/writeJson）

### Zustand 变更

**uiSliceTypes.ts** 新增:
- 常量 `ACTIVE_HEATMAP_TAB_KEY`
- 类型字段 `activeHeatmapTab: HeatmapTab`
- action `setActiveHeatmapTab: (tab: HeatmapTab) => void`

**uiSlice.ts** 新增:
- hydration 时从 localStorage 读取
- `setActiveHeatmapTab` action: writeJson + set

## 下滑线导航样式

每个标签按钮:
- 无背景、仅文字 + hover 色变
- `::after` 伪元素下滑线: `height: 2px`, `border-radius: 1px`
- `transform: scaleX(0)` + `transition: transform 0.2s`
- hover 时展开 (`scaleX(1)`)
- active 态常驻展开 + 使用 `var(--accent)` 颜色
- 标签按钮间 `gap: var(--space-4)`
- 导航容器底部 `border-bottom: 1px solid var(--border-subtle)`

## i18n 变更

### 标题更新 (zh-CN)

| key | 旧值 | 新值 |
|-----|------|------|
| gitVisCalendarHeatmap | 提交日历热力图 | 提交日历 |
| gitVisClockHeatmap | 提交时间分布 | 提交时段 |
| gitVisCodeLineEvo | 代码行数演变 | 代码行演变 |
| gitVisContributorActivity | 贡献者活跃度 | 贡献活跃度 |
| gitVisCommitTimeline | 提交时间线 | (不变) |
| gitVisContributorModule | 贡献者 × 模块 | 贡献者模块 |
| gitVisFileSunburst | 文件修改旭日图 | 文件旭日图 |
| gitVisBranchGraph | 分支图谱 | (不变) |

### 标题更新 (en-US)

| key | 旧值 | 新值 |
|-----|------|------|
| gitVisCalendarHeatmap | Commit Calendar Heatmap | Commit Calendar |
| gitVisClockHeatmap | Commit Time Distribution | Commit Hours |
| gitVisCodeLineEvo | Code Line Evolution | (不变) |
| gitVisContributorActivity | Contributor Activity | (不变) |
| gitVisCommitTimeline | Commit Timeline | (不变) |
| gitVisContributorModule | Contributor × Module | Contributor Module |
| gitVisFileSunburst | File Modification Sunburst | File Sunburst |
| gitVisBranchGraph | Branch Graph | (不变) |

### 新增热力图导航标签 key

| key | zh-CN | en-US |
|-----|-------|-------|
| gitVisHeatmapTabCalendar | 日历 | Calendar |
| gitVisHeatmapTabClock | 时段 | Hours |
| gitVisHeatmapTabActivity | 活跃度 | Activity |
| gitVisHeatmapTabModule | 模块 | Module |

## 文件变更清单

### 新增
- `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx` — 热力图聚合卡片组件
- `frontend/src/app/features/git-visualization/HeatmapCardGroup.test.tsx` — 测试

### 修改
- `frontend/src/app/stores/slices/uiSliceTypes.ts` — 新增 key 常量、类型、action
- `frontend/src/app/stores/slices/uiSlice.ts` — 新增 hydration + action 实现
- `frontend/src/app/features/git-visualization/GitVisualizationView.tsx` — 替换 4 个热力图 ChartCard 为 HeatmapCardGroup
- `frontend/src/styles/regions/rightpanel/git-visualization.css` — 新增热力图导航样式
- `frontend/src/app/i18n/zh-CN/changes.ts` — 更新标题 + 新增标签 key
- `frontend/src/app/i18n/en-US/changes.ts` — 更新标题 + 新增标签 key

## 测试

HeatmapCardGroup 测试:
- 默认渲染第一个标签（日历），对应热力图可见
- 点击各标签切换验证
- 描述文字随切换更新
- 导航标签 aria-selected 状态正确

GitVisualizationView 测试:
- 卡片计数从 8 减少为 5（1 聚合 + 4 独立）
- HeatmapCardGroup 在视图内可见
