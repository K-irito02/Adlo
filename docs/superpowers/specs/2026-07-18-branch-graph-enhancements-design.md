# Branch Graph 增强设计

## 概述

对"分支图谱"可视化卡片进行 6 项优化：方块节点 hover 放大、标签徽章缩小、作者头像、列间距、中英切换、多选筛选（影响右侧列表 + 左侧泳道）。

## 改动清单

### 1. 方块节点 Hover 放大

**现状**：`SvgLanes` 中圆点 hover 时半径 `* 1.2`，方块 merge 节点无变化。

**方案**：对方块 `<rect>` 应用 `<g transform="scale(1.2)" transform-origin="center">` 或在 hover 时切换 `width`/`height` 从 `MERGE_NODE_SIZE` 放大 1.2 倍。为保证与圆点一致的交互体验，采用 `transform: scale(1.2)` 方式，通过 CSS transform-origin 居中。

### 2. 标签徽章缩小

**现状**：`fontSize: 10`，`padding: '1px 6px'`。

**方案**：`fontSize: 9`，`padding: '0 4px'`，`borderRadius: 2`。

### 3. 作者圆形头像

**现状**：作者列只显示纯文本名字。

**方案**：每个作者名左侧渲染首字母圆形头像。
- 圆形尺寸：20x20px，字体 11px
- 颜色映射：`getAuthorColor(name)` — 字符串简单哈希映射到 8 色调色板
- DOM：`<span class="adl-author-avatar">A</span><span>Alex</span>`，flex row，gap 4px
- CSS class: `.adl-author-avatar` — `display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; font-size: 11px; font-weight: 600; color: #fff; flex-shrink: 0`

### 4. 列间距

**现状**：`gridTemplateColumns: '80px 1fr auto auto'`，`gap: 4`，作者与日期列间距过小。

**方案**：`gridTemplateColumns: '80px 1fr 120px 100px'`，`gap: 8`。header 与行使用同一模板。

### 5. 中英切换

**现状**：HEADER 行"HASH""MESSAGE""AUTHOR""DATE"硬编码；`formatRelativeDate` 中"today""1d ago"等英文。

**方案**：
- i18n keys（`en-US/changes.ts` + `zh-CN/changes.ts`）：

| Key | EN | ZH |
|-----|----|----|
| `gitVisHash` | HASH | 哈希 |
| `gitVisMessage` | MESSAGE | 提交信息 |
| `gitVisAuthor` | AUTHOR | 作者 |
| `gitVisDate` | DATE | 日期 |

- `formatRelativeDate` 返回值改为纯数字语言中立格式："today" → "0d"，"1d ago" → "1d"，"2mo ago" → "2mo"，"1y ago" → "1y"，无需翻译 key。

### 6. 多选筛选 + 影响泳道

**现状**：`filterBranch: string | null` 单选，仅影响右侧列表行 opacity。

**方案**：
- 状态：`filterBranches: Set<string>`，初始为空集
- 交互：点击标签切换其在 Set 中的存在（add ↔ delete）
- 筛选活跃判断：`filterBranches.size > 0`
- 行筛选：`isFiltered = filterBranches.size > 0 && !filterBranches.has(row.branch)`
- 标签视觉：isSelected = filterBranches.has(l.branch)，isHovered = hoveredLabel === l.branch
  - indicator: isSelected || isHovered
  - scale: (isHovered XOR isSelected)
  - 未选标签（当筛选活跃时）opacity 0.4
- SVG 泳道：向 `SvgLanes` 传入 `filterBranches` props
  - 泳道线：`opacity = filterBranches.size > 0 && !filterBranches.has(l.branch) ? 0.1 : 0.5`
  - 节点：同上逻辑
  - 连接线：同上逻辑
  - hover 所在分支始终保持高可视性（hover 优先级高于筛选）

## 涉及文件

| 文件 | 改动 |
|------|------|
| `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` | 全部 6 项改动 |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx` | 适配多选 + 新 DOM 结构 |
| `frontend/src/styles/regions\rightpanel/git-visualization.css` | 头像、列间距、徽章、泳道淡化 |
| `frontend/src/app/i18n/en-US/changes.ts` | +4 keys |
| `frontend/src/app/i18n/zh-CN/changes.ts` | +4 keys |
