# Git可视化图表改进与缺陷修复 — 设计文档

日期：2026-08-03

## 背景

"变更面板"下"Git可视化"区域的相关可视化图表存在 4 个问题需要处理（2 个改进 + 2 个缺陷）。本设计覆盖全部 4 项，统一实施。

## 任务 1：路径跳转菜单卡片显示当前右键目录名称

**目标**：鼠标右击目录出现路径跳转菜单卡片时，卡片上显示当前右键的目录名称，便于用户确认右键对象。

**方案**：
- `ModuleTreeCard` 新增 props：`dirName?: string`（显示的 basename）、`dirPath?: string`（完整路径，原生 `title` tooltip）
- 头部左侧"展开/折叠全部"按钮旁新增目录名文本（超长省略），`title={dirPath}`
- 调用方传参：
  - `ContributorModuleHeatmap.handleColumnContextMenu`：`node.name` + `node.path`
  - `FileHotspotsLeaderboard.handleRowContextMenu`：`row.name` + `row.path`

## 任务 2：贡献者模块热力图 X 轴 tooltip 误显示目录名称（缺陷）

**根因**：`heatmap-x-axis.tsx` 目录级列标签的外层绝对定位容器宽度为 `max-content`（未旋转文本的矩形命中区域），`title` 设于外层；文件级标签因 `pointer-events: none` 穿透，悬停文件标签时命中相邻目录容器矩形区域 → 误触发原生 tooltip。

**方案**：
- 外层容器始终 `pointer-events: none`，移除其上的 `title`/`onClick`/`onContextMenu`
- 交互与 `title` 移到内层内容元素（旋转场景为旋转后的 div，命中区域跟随旋转后的实际文本几何）

## 任务 3：路径跳转菜单卡片自动调整位置 + 可拖拽

**目标**：
- 卡片出现时自动调整位置，不被应用边缘裁剪截断
- 支持拖拽卡片顶部区域自由改变位置

**方案**：
- **自动定位**：`useLayoutEffect` 挂载后测量卡片实际尺寸，按视口边界 + 8px 内边距钳制（替换现硬编码 `Math.min(position.x, innerWidth-360)` 粗钳制），状态驱动
- **拖拽**：头部区域（避开按钮）`onPointerDown` → `setPointerCapture` → `onPointerMove` 更新位置（移动中继续钳制）→ `onPointerUp` 结束；头部 `cursor: grab/grabbing`、`touch-action: none`、拖拽中 `user-select: none`
- **会话性**：卡片关闭即卸载，位置自然重置（不持久化）

## 任务 4：点击刷新后数据停留在昨天（缺陷）

**根因**：`TimeRangeSelector.handlePreset` 把 week/month/year 相对预设解析为绝对日期字符串并持久化；`useGitVisRefresh` 刷新时复用固定 since/until，未按当前日期重新解析相对预设。日历热力图默认 `preset: 'year'` 语义为"当前日历年"，与"近一年"滚动语义冲突。

**方案**：
1. 新建共享工具 `resolveRollingRange(preset, now)`（week/month/year 滚动计算），`TimeRangeSelector.handlePreset` 复用
2. `useGitVisRefresh` 在 fetch 前用 `resolveTimeRangeForFetch(range)` 解析：custom→存储值；all→无；week/month/year→按"现在"重新滚动
3. `defaultTimeRange()` 改为 `preset: 'custom'`（当前日历年 1.1–12.31），避免日历热力图"年"语义被当滚动"近一年"重算
4. **同类问题修复**：贡献者模块热力图（`CONTRIBUTOR_MODULES`）在模块 tab 下从不刷新。`HeatmapCardGroup` 在模块 tab 活动时，时间范围变更/刷新同步刷新 `CONTRIBUTOR_MODULES`（与 `HEATMAP` 同范围）

## 测试计划

- 任务 1：ModuleTreeCard 渲染 dirName + title=dirPath
- 任务 2：heatmap-x-axis 外层 pointer-events-none、title 位于内层元素
- 任务 3：ModuleTreeCard 定位钳制（mock 视口）、拖拽更新位置
- 任务 4：`resolveRollingRange`/`resolveTimeRangeForFetch` 单测；`defaultTimeRange` 返回 custom；`useGitVisRefresh` 对相对预设传最新 since/until
