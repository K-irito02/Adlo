# Git 可视化标签/颜色增强设计（Spec）

## 概述

对 Git 可视化面板的 5 张图表（含热力图卡片组的 4 个变体）进行标签格式优化、颜色标准化和底部描述统一的改进。

## 变更清单

涉及 11 个文件：

| # | 文件 | 变更 |
|---|------|------|
| 1 | `frontend/src/components/charts/heatmap/heatmap-x-axis.tsx` | 新增 `labelFormat` prop: `'short'` | `'numeric'` |
| 2 | `frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx` | y 轴改用 `weekday:'narrow'`，x 轴传 `labelFormat="numeric"` |
| 3 | `frontend/src/app/features/git-visualization/data/gitVisMockData.ts` | 贡献活跃度数据去掉 "W" 前缀 |
| 4 | `frontend/src/styles/regions/rightpanel/git-visualization.css` | 添加 scoped 4 套色标预设 + 覆盖机制 |
| 5 | `frontend/src/app/i18n/zh-CN/changes.ts` | 更新 8 条图表描述 + 新增预设名 i18n |
| 6 | `frontend/src/app/i18n/en-US/changes.ts` | 更新 8 条图表描述 + 新增预设名 i18n |
| 7 | `frontend/src/app/features/git-visualization/ChartColorPresetSelector.tsx` | 新增：色预设下拉选择器组件 |
| 8 | `frontend/src/app/features/git-visualization/GitVisualizationView.tsx` | 接入 ChartColorPresetSelector |
| 9 | `frontend/src/app/stores/slices/uiSliceTypes.ts` | 新增 chartColorPreset 类型与持久化 key |
| 10 | `frontend/src/app/stores/slices/uiSlice.ts` | 新增 chartColorPreset 状态与 action |
| 11 | `frontend/src/app/stores/__tests__/uiSlice-heatmap-tab.test.ts` | 补充 chartColorPreset 持久化测试 |

## 1. 日历热力图 X 轴 — 月份数字

### 现状

`heatmap-x-axis.tsx` 使用 `Intl.DateTimeFormat(locale, { month: 'short' })` 生成月份标签：中文 "1 月"、"2 月"…，英文 "Jan"、"Feb"…。标签容器应用了 `overflow: hidden` 和 `truncate` class，导致月份标签被截断。

### 方案

在 `HeatmapXAxisProps` 中新增可选 prop `labelFormat?: 'short' | 'numeric'`（默认 `'short'` 保持向后兼容）：

- 当 `labelFormat='numeric'` 时：直接输出 `monthAnchor.getMonth() + 1`（1~12），移除 `overflow: hidden` 和 `truncate` class
- 当 `labelFormat='short'` 时：保持当前 `Intl.DateTimeFormat` 行为

在 `CalendarHeatmap.tsx` 中向 `<HeatmapXAxis>` 传递 `labelFormat="numeric"`。

## 2. 日历热力图 Y 轴 — 星期标签

### 现状

`CalendarHeatmap.tsx` 使用 `Intl.DateTimeFormat(locale, { weekday: 'short' })` 生成星期标签。中文输出 "周日"、"周一"…，配合 `labelFormat="initial"` 取首字符 → 全部变成 "周"，造成 bug。

### 方案

将 `dayFmt` 改为 `Intl.DateTimeFormat(locale, { weekday: 'narrow' })`：

- 中文输出 "日"、"一"、"二"、"三"、"四"、"五"、"六"（符合需求）
- 英文输出 "S"、"M"、"T"、"W"、"T"、"F"、"S"（与 `initial` 一致）
- 同时将 `labelFormat` 从 `"initial"` 改为 `"full"`

## 3. 活跃度热力图 X 轴 — 周标签

### 现状

`gitVisMockData.ts` 中 `generateContributorActivityData` 生成 `columnLabel: \`W${w + 1}\``（"W1"、"W2"…）。x 轴标签容器有 `overflow: hidden` 和 `truncate`，可能截断。

### 方案

- 数据层：`columnLabel: String(w + 1)`（纯数字，去掉 "W" 前缀）
- x 轴标签容器：当使用 `columnLabels` 时同样移除 `overflow: hidden` 和 `truncate`
  - 实现方式：在 `labelFormat="numeric"` 模式下统一移除截断样式，或者在标签容器中根据 `labelFormat` 属性控制

## 4. 色标 — bklit-ui 完整对齐（Git 可视化范围）

### 现状

`themes.css` 全局覆盖了 `--chart-scale-01~05` 为蓝色渐变、`--chart-1~5` 为彩色系列。这些是全局变量，影响整个应用。

### 方案

不在全局层面修改，而是在 `git-visualization.css` 中创建 scoped CSS 变量覆盖：

```css
/* Light - bklit-ui colors (scoped to git-vis) */
.adl-git-vis__container {
  --chart-scale-01: oklch(0.98 0.003 106);
  --chart-scale-02: oklch(0.92 0.008 106);
  --chart-scale-03: oklch(0.82 0.015 106);
  --chart-scale-04: oklch(0.68 0.02 106);
  --chart-scale-05: oklch(0.55 0.025 106);
  --chart-1: oklch(0.32 0 none);
  --chart-2: oklch(0.41 0 none);
  --chart-3: oklch(0.54 0 none);
  --chart-4: oklch(0.71 0 none);
  --chart-5: oklch(0.89 0 none);
}

[data-theme='dark'] .adl-git-vis__container {
  --chart-scale-01: oklch(0.28 0.03 270);
  --chart-scale-02: oklch(0.38 0.04 270);
  --chart-scale-03: oklch(0.48 0.05 270);
  --chart-scale-04: oklch(0.58 0.06 270);
  --chart-scale-05: oklch(0.68 0.07 270);
  --chart-1: oklch(1 0 none);
  --chart-2: oklch(0.73 0 none);
  --chart-3: oklch(0.51 0 none);
  --chart-4: oklch(0.39 0 none);
  --chart-5: oklch(0.32 0 none);
}
```

热力图使用绿色渐变（亮色）/ 蓝色渐变（暗色），系列色使用 bklit-ui 灰度值。不影响应用其他部分渲染的图表。

## 5. 底部提示行标准化

### 格式

```
行/列含义 → 色块/元素含义 → 可反映什么
```

### 中文描述

| 图表 | 描述 |
|------|------|
| commitCalendar | 行：星期（日~六），列：月份（1~12）。色块颜色从浅到深代表当日提交数量由少到多。可快速识别一年中的活跃周期与低谷期。 |
| commitHours | 行：星期（日~六），列：时段（0~23时）。色块颜色从浅到深代表该时段提交频次由少到多。可发现团队编码工作节奏。 |
| contributorActivity | 行：6位贡献者，列：48周时间段。色块颜色从浅到深代表每人每周提交量由少到多。可追踪每位贡献者在时间维度上的活跃分布。 |
| contributorModule | 行：6位贡献者，列：5个模块。色块颜色从浅到深代表跨领域活跃度由低到高。可定位每位贡献者的主要贡献领域与协作范围。 |
| codeLineEvo | 行：累计行数，列：40周时间。绿线为新增行数，红线为删除行数。可反映项目增长速度与重构节奏。 |
| commitTimeline | 行：累计提交数，列：2周时间。折线为累计提交增长趋势。可展示项目开发速度。 |
| fileSunburst | 从内向外按文件类型分层，扇形角度=修改次数/代码量，颜色区分不同类别。可快速定位"热点文件"与高活跃模块。 |
| branchGraph | 每条垂直泳道为一个分支。●圆点为单父提交，■方块为合并提交（2个以上父提交），标签徽章标记tagged版本。可查看项目的分支拓扑与合并历史。 |

### 英文描述

| Key | Description |
|-----|------------|
| commitCalendar | Row: weekday (Sun~Sat), Column: month (1~12). Cell color intensity from light to dark represents daily commit count from few to many. Quickly identify active periods and low activity phases across the year. |
| commitHours | Row: weekday (Sun~Sat), Column: hour (0~23). Cell color intensity from light to dark represents commit frequency from low to high. Discover team work rhythm patterns. |
| contributorActivity | Row: 6 contributors, Column: 48 weeks. Cell color intensity represents weekly commit volume per person from low to high. Track each contributor's activity distribution over time. |
| contributorModule | Row: 6 contributors, Column: 5 modules. Cell color intensity represents cross-domain activity from low to high. Identify each contributor's primary contribution areas and collaboration scope. |
| codeLineEvo | Row: cumulative line count, Column: 40 weeks. Green line = added lines, red line = deleted lines. Reflects project growth pace and refactoring rhythm. |
| commitTimeline | Row: cumulative commits, Column: 2 weeks. Line shows cumulative commit growth trend. Demonstrates project development velocity. |
| fileSunburst | Inner to outer layers by file type, arc angle = modification count / code volume, colors distinguish categories. Quickly locate "hotspot files" and high-activity modules. |
| branchGraph | Each vertical lane is a branch. ● dots are single-parent commits, ■ squares are merge commits (2+ parents), tag badges mark tagged releases. Visualize branch topology and merge history. |

## 6. 颜色预设切换系统

### 概述

在 Git 可视化面板增加一个下拉选择器，让用户一键切换 4 套 chart 颜色预设。预设通过 scoped CSS 变量覆盖实现，数据属性 `data-chart-preset` 将状态传递给 CSS。

### 预设方案

| ID | 名称 | 亮色特征 | 暗色特征 |
|----|------|----------|----------|
| `bklit-default` | Bklit 默认 | Scale 绿渐变 (hue 106)，Series 灰度 | Scale 蓝渐变 (hue 270)，Series 反相灰度 |
| `cool-ocean` | 冷色海洋 | Scale 蓝渐变 (hue 240)，Series 冷色系 | Scale 青渐变 (hue 220)，Series 冷色系 |
| `warm-sunset` | 暖色日落 | Scale 琥珀渐变 (hue 70)，Series 暖色系 | Scale 暖渐变 (hue 50)，Series 暖色系 |
| `high-contrast` | 高对比度 | Scale 高反差，Series 鲜艳色 | Scale 高反差，Series 鲜艳色 |

### CSS 变量定义

在 `git-visualization.css` 中，以 `data-chart-preset` 属性选择器作用域覆盖：

```css
/* ===== Preset: bklit-default ===== */
.adl-git-vis__container[data-chart-preset="bklit-default"] {
  --chart-scale-01: oklch(0.98 0.003 106);
  --chart-scale-02: oklch(0.92 0.008 106);
  --chart-scale-03: oklch(0.82 0.015 106);
  --chart-scale-04: oklch(0.68 0.02 106);
  --chart-scale-05: oklch(0.55 0.025 106);
  --chart-1: oklch(0.32 0 none);
  --chart-2: oklch(0.41 0 none);
  --chart-3: oklch(0.54 0 none);
  --chart-4: oklch(0.71 0 none);
  --chart-5: oklch(0.89 0 none);
}
[data-theme='dark'] .adl-git-vis__container[data-chart-preset="bklit-default"] {
  --chart-scale-01: oklch(0.28 0.03 270);
  --chart-scale-02: oklch(0.38 0.04 270);
  --chart-scale-03: oklch(0.48 0.05 270);
  --chart-scale-04: oklch(0.58 0.06 270);
  --chart-scale-05: oklch(0.68 0.07 270);
  --chart-1: oklch(1 0 none);
  --chart-2: oklch(0.73 0 none);
  --chart-3: oklch(0.51 0 none);
  --chart-4: oklch(0.39 0 none);
  --chart-5: oklch(0.32 0 none);
}

/* ===== Preset: cool-ocean ===== */
.adl-git-vis__container[data-chart-preset="cool-ocean"] {
  --chart-scale-01: oklch(0.97 0.015 250);
  --chart-scale-02: oklch(0.88 0.03 250);
  --chart-scale-03: oklch(0.72 0.06 250);
  --chart-scale-04: oklch(0.54 0.09 250);
  --chart-scale-05: oklch(0.38 0.11 250);
  --chart-1: oklch(0.35 0.12 265);
  --chart-2: oklch(0.45 0.1 250);
  --chart-3: oklch(0.55 0.08 235);
  --chart-4: oklch(0.65 0.06 195);
  --chart-5: oklch(0.75 0.04 180);
}
[data-theme='dark'] .adl-git-vis__container[data-chart-preset="cool-ocean"] {
  --chart-scale-01: oklch(0.22 0.03 245);
  --chart-scale-02: oklch(0.3 0.05 240);
  --chart-scale-03: oklch(0.4 0.08 235);
  --chart-scale-04: oklch(0.5 0.1 225);
  --chart-scale-05: oklch(0.6 0.12 215);
  --chart-1: oklch(0.75 0.06 250);
  --chart-2: oklch(0.65 0.08 235);
  --chart-3: oklch(0.55 0.1 220);
  --chart-4: oklch(0.45 0.08 200);
  --chart-5: oklch(0.35 0.06 190);
}

/* ===== Preset: warm-sunset ===== */
.adl-git-vis__container[data-chart-preset="warm-sunset"] {
  --chart-scale-01: oklch(0.98 0.005 80);
  --chart-scale-02: oklch(0.92 0.015 75);
  --chart-scale-03: oklch(0.82 0.03 70);
  --chart-scale-04: oklch(0.68 0.05 65);
  --chart-scale-05: oklch(0.55 0.07 55);
  --chart-1: oklch(0.4 0.13 40);
  --chart-2: oklch(0.5 0.12 55);
  --chart-3: oklch(0.6 0.1 70);
  --chart-4: oklch(0.7 0.08 85);
  --chart-5: oklch(0.8 0.05 90);
}
[data-theme='dark'] .adl-git-vis__container[data-chart-preset="warm-sunset"] {
  --chart-scale-01: oklch(0.25 0.02 60);
  --chart-scale-02: oklch(0.33 0.035 55);
  --chart-scale-03: oklch(0.43 0.05 50);
  --chart-scale-04: oklch(0.53 0.07 45);
  --chart-scale-05: oklch(0.63 0.09 40);
  --chart-1: oklch(0.75 0.08 55);
  --chart-2: oklch(0.65 0.1 45);
  --chart-3: oklch(0.55 0.12 35);
  --chart-4: oklch(0.45 0.1 25);
  --chart-5: oklch(0.35 0.08 15);
}

/* ===== Preset: high-contrast ===== */
.adl-git-vis__container[data-chart-preset="high-contrast"] {
  --chart-scale-01: oklch(0.95 0.005 0);
  --chart-scale-02: oklch(0.7 0.03 200);
  --chart-scale-03: oklch(0.5 0.06 210);
  --chart-scale-04: oklch(0.35 0.08 220);
  --chart-scale-05: oklch(0.25 0.08 230);
  --chart-1: oklch(0.3 0.15 30);
  --chart-2: oklch(0.4 0.14 150);
  --chart-3: oklch(0.5 0.13 270);
  --chart-4: oklch(0.6 0.12 330);
  --chart-5: oklch(0.7 0.11 60);
}
[data-theme='dark'] .adl-git-vis__container[data-chart-preset="high-contrast"] {
  --chart-scale-01: oklch(0.2 0.01 0);
  --chart-scale-02: oklch(0.35 0.05 210);
  --chart-scale-03: oklch(0.5 0.07 220);
  --chart-scale-04: oklch(0.65 0.09 230);
  --chart-scale-05: oklch(0.8 0.11 240);
  --chart-1: oklch(0.8 0.14 30);
  --chart-2: oklch(0.7 0.13 150);
  --chart-3: oklch(0.6 0.12 270);
  --chart-4: oklch(0.5 0.11 330);
  --chart-5: oklch(0.4 0.1 60);
}
```

### 状态管理

在 Zustand 的 `uiSlice` 中新增：

```typescript
// uiSliceTypes.ts
export type ChartColorPreset = 'bklit-default' | 'cool-ocean' | 'warm-sunset' | 'high-contrast';
export const CHART_COLOR_PRESET_KEY = 'ai-digital-life:chartColorPreset';

// uiSlice.ts
chartColorPreset: 'bklit-default' as ChartColorPreset,
setChartColorPreset: (preset: ChartColorPreset) => set({ chartColorPreset: preset }),
```

持久化到 localStorage，key 为 `ai-digital-life:chartColorPreset`。

### UI 组件

新增 `ChartColorPresetSelector.tsx`：

- 渲染为 `<select>` 下拉菜单，放置在 `GitVisualizationView` 顶部
- 选项与预设一一对应，显示 i18n 翻译后的名称
- 切换时调用 `setChartColorPreset`，CSS 变量通过 data attribute `data-chart-preset` 传递给容器

```tsx
// GitVisualizationView.tsx
<div className="adl-git-vis__container" data-chart-preset={chartColorPreset}>
  <div className="adl-git-vis__preset-bar">
    <ChartColorPresetSelector />
  </div>
  <HeatmapCardGroup />
  ...
</div>
```

### i18n 键

新增 4 个预设名称：

| Key | zh-CN | en-US |
|-----|-------|-------|
| gitVisPresetBklitDefault | Bklit 默认 | Bklit Default |
| gitVisPresetCoolOcean | 冷色海洋 | Cool Ocean |
| gitVisPresetWarmSunset | 暖色日落 | Warm Sunset |
| gitVisPresetHighContrast | 高对比度 | High Contrast |

### 向后兼容

- 未登录用户或 localStorage 无值时，默认 `'bklit-default'`
- dropdown 选择器可收起，不干扰图表展示

## 不变的部分

- 其他非 Git 可视化的图表颜色保持不变（由全局 `themes.css` 控制）
- 热力图组件库的通用 API 保持向后兼容（新增 prop 有默认值）
- Tooltip、动画、交互行为不变
- 数据生成逻辑不变（仅标签格式调整）

## 不涉及

- 后端代码
- 数据库
