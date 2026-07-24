# Git 可视化多工作区标签切换设计

## 概述

在变更面板的 Git 可视化区域顶部添加自适应分页工作区标签栏（WorkspaceTabBar），支持多工作区切换。当前所有图表共享同一份 mock 数据（27 个工作区），后续可接入真实 git 数据。

## 组件架构

```
ChangesPanel (主内容区)
├── [showGitVisualization=true]
│   └── GitVisualizationView
│       ├── WorkspaceTabBar (新增)
│       ├── ChartColorPresetSelector
│       ├── HeatmapCardGroup
│       ├── ChartCard (CodeLineEvo)
│       ├── ChartCard (CommitTimeline)
│       ├── ChartCard (FileSunburst)
│       └── ChartCard (BranchGraph)
├── [activePatchSet?] PatchReviewSection
└── [default] LazyDiffEditor
```

## WorkspaceTabBar 行为状态机

| 状态 | 表现 |
|------|------|
| 全部标签 ≤ 容器宽度 | 一行铺开，无翻页控件，无滚轮滑动 |
| 标签溢出容器 | 右侧渐隐卷帘 + 底部翻页圆点 + 两侧 ◀ ▶ 按钮 + 鼠标滚轮水平滑动 |

### 溢出检测
- `ResizeObserver` + `<span>` 探针测量每个标签宽度
- 累加计算容器内可容纳完整标签数
- 当 `totalTabs > visibleTabs` 时标记溢出，显示控件

### 滚动与翻页
- 滚轮事件 → `scrollBy({ left: ±120px, behavior: 'smooth' })`
- ◀/▶ 按钮：每页翻 `visibleTabs` 个标签
- 翻页圆点：直接跳转到对应页
- 翻到尽头时，对应方向渐隐消失

### 标签样式
- 等宽标签（固定宽度），超长文本 `text-overflow: ellipsis`
- 原生 `title` 属性展示完整名称
- 当前选中标签高亮（accent 色）

### 布局（溢出时）

```
◀─ [W1] [W2] [W3] [W4] [W5] ──╴fade╶──▶
           ⬤ ⬤ ⬤ ⬤ ⬤ ⬤
```

- 翻页圆点位于标签行下方
- ◀/▶ 按钮分别位于标签行左右两侧
- 右侧边缘渐隐卷帘效果指示溢出

## 状态管理

- `activeWorkspaceTab: string`（工作区 ID）存入 `uiSlice`
- localStorage 持久化（key: `'adl-ui:active-workspace-tab'`）
- 关闭重新打开保留上次选中的工作区标签

## Mock 数据

- 27 个工作区条目，名称 `Workspace 1` ~ `Workspace 27`
- 所有图表共用同一份数据，切换标签不影响图表内容

## 文件变更清单

### 新增
- `frontend/src/app/features/git-visualization/WorkspaceTabBar.tsx` — 自适应分页标签组件
- `frontend/src/app/features/git-visualization/WorkspaceTabBar.test.tsx` — 测试

### 修改
- `frontend/src/app/features/git-visualization/GitVisualizationView.tsx` — 插入 WorkspaceTabBar + activeWorkspaceTab 状态
- `frontend/src/app/stores/slices/uiSliceTypes.ts` — 新增 `activeWorkspaceTab` 类型、key 常量、action
- `frontend/src/app/stores/slices/uiSlice.ts` — 新增 hydration + action 实现
- `frontend/src/app/features/git-visualization/data/gitVisMockData.ts` — 新增 27 个工作区 mock 条目
- `frontend/src/styles/regions/rightpanel/git-visualization.css` — 标签栏样式
- `frontend/src/app/i18n/zh-CN/changes.ts` — 新增标签相关 key
- `frontend/src/app/i18n/en-US/changes.ts` — 新增标签相关 key

### i18n 新增 key

| key | zh-CN | en-US |
|-----|-------|-------|
| gitVisWorkspaceTab | 工作区 {name} | Workspace {name} |

## 测试要点

- 标签数 ≤ 容器宽度时无翻页控件
- 标签溢出时显示翻页圆点 + 按钮
- ◀/▶ 翻页前后页内容正确
- 点击圆点跳转到对应页
- 鼠标滚轮水平滑动工作
- 标签选中状态切换正确
- 选中状态 persist/restore
- `title` 属性展示完整标签名
