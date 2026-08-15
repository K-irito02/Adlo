# Branch Graph 改进设计文档

## 概述

对 Git 可视化"分支图谱"(Branch Graph)进行 5 项改进：底部提示居中、泳道最大宽度+水平滚动/标签行常驻/面板联动、缺失分支排查、日期格式、原生 tooltip 替换为 TooltipSimple 子卡片。

---

## 1. 底部提示文字居中对齐

### 问题

`"已加载全部 {count} 条提交"` 位于 CSS Grid 右列（`1fr`）内，`textAlign: 'center'` 仅相对表格区域居中，而非整个图表宽度。

### 方案

将全部视觉元素纳入同一垂直滚动容器，底部提示使用 `position: sticky; bottom: 0` + `gridColumn: 1 / -1` 跨两栏居中。

### 改动范围

- `BranchGraph.tsx`：渲染结构调整（见布局变更章节）
- `git-visualization.css`：新增 `.adl-branch-graph__bottom-bar` 样式

---

## 2. 左侧泳道最大限度 + 水平滚动 + 标签行常驻 + 面板联动

### 布局结构

```
┌──────────────────────────────────────────────────────────────┐
│  [标签行 — overflow-x: auto; position: sticky; top: 0]       │
│  常驻可视顶部，左右滚动显示所有分支标签                      │
├────────────────────────────┬─────────────────────────────────┤
│  [泳道面板]                │  [表格面板]                      │
│  overflow-x: auto          │  flex: 1 (无垂直滚动)           │
│  max-width: 400px          │                                  │
│  flex-shrink: 0            │                                  │
│  SVG 自然宽度，超出水平滚    │  表头 + 数据行                  │
│  动                          │                                  │
│  （无垂直滚动，高度与表格    │                                  │
│   行数完全同步）             │                                  │
├────────────────────────────┴─────────────────────────────────┤
│  底部提示 sticky bottom:0 跨栏居中                            │
└──────────────────────────────────────────────────────────────┘
```

### 关键原理

- 泳道 SVG 和表格行由同一 `visibleRows` 数组驱动，`ROW_HEIGHT=36` 一致，总高度天然匹配
- 全部放入同一 `overflow-y: auto` 容器，滚轮操作自动同步联动，无需 JS 桥接
- 标签行 `position: sticky; top: 0; z-index: 10` 独立于两栏之上，垂直滚动时不消失
- 标签行自身 `overflow-x: auto` 水平滚动展示所有分支标签

### 改动范围

- `BranchGraph.tsx`：重构渲染结构为两栏 flex 布局
- `git-visualization.css`：新增 `.adl-branch-graph__body`、`.adl-branch-graph__lanes-panel`、`.adl-branch-graph__table-panel`、`.adl-branch-graph__tag-row--sticky` 等类
- 移除旧的 `gridTemplateColumns` 网格布局

---

## 3. 缺失分支排查（`feat/opencode-integration-fix`）

### 已确认事实

- 分支 `feat/opencode-integration-fix` 在仓库中存在（本地 + 远程）
- 有 7 个未合并至 `main` 的独立提交，起始于 `aa129a50`
- 后端 `git log --all --topo-order` 的 `%D` 输出正确包含该分支名

### 排查步骤

1. 在 `adaptBranchGraphData` 调用处添加日志：`console.log('[DEBUG] branches from backend:', adapted?.allBranches)`
2. 在 `columnsWithLabels` 计算处添加日志：`console.log('[DEBUG] label columns:', columnsWithLabels)`
3. 若场景 A：`allBranches` 包含该分支但 `columnsWithLabels` 无 → 问题在前端去重/标签提取逻辑
4. 若场景 B：`allBranches` 不包含 → 问题在后端 Rust `branch_graph.rs` 的 `%D` 解析

### 改动范围

只在实现阶段添加调试日志，修复问题后移除，不残留。

---

## 4. 日期格式

### 表格列（问题4）

| 条件 | 格式 |
|------|------|
| 中/英文环境 | `HH:mm DD-MM-YYYY`（例：`14:30 28-07-2026`） |

使用 `Intl.DateTimeFormat` 的 `formatToParts` 提取各组件后重排。

### Tooltip 子卡片内

| 语言 | 格式 |
|------|------|
| 中文 | `2026年7月28日 14:30:00` |
| 英文 | `July 28, 2026, 14:30:00` |

使用标准 `Intl.DateTimeFormat` `{ dateStyle: 'long', timeStyle: 'medium' }`。

### 改动范围

- 新增 `formatDate(dateStr, locale, mode)` 工具函数（支持 `table` / `tooltip` 两种模式）
- 替换 `BranchGraph.tsx` 中 `formatRelativeDate` 的调用
- 移除旧的 `formatRelativeDate` 函数
- 无需新 i18n keys

---

## 5. Tooltip 子卡片

### 核心架构

- 用 `TooltipSimple`（`dismissible={true}`, `placement="right"`）包裹每行内容，替换原生 `title`
- 自定义 `<CommitTooltipCard>` 组件作为 `content`
- 触发方式 `hover`，`dismissible` 允许鼠标移入卡片交互（滚动、复制）

### 卡片布局

```
┌───────────────────────────────────────────────┐
│  [行1] 完整哈希值                              │
│  a1b2c3d4e5f6...                  [📋复制]    │
│─────────────────────────────────────────────── │
│  [行2] 提交信息（最多12行 ≈ 216px）           │
│  Commit message line 1                        │
│  Commit message line 2                        │
│  ...                                          │
│  └── 超出12行时出现垂直滚动条 ──┘              │
│─────────────────────────────────────────────── │
│  [行3] 作者信息                                │
│  [头像32px]  Author Name                      │
│              author@email.com                 │
│─────────────────────────────────────────────── │
│  [行4] 完整日期                                │
│  July 28, 2026, 14:30:00                      │
└───────────────────────────────────────────────┘
```

### 关键实现细节

| 元素 | 方案 |
|------|------|
| 头像来源 | Gravatar：`https://www.gravatar.com/avatar/${md5(email.trim().toLowerCase())}?s={size}&d=identicon` |
| 头像降级 | `<img>` 的 `onError` 或加载失败时，回退到当前首字母兜底（保留现有 `AuthorAvatar` 内联初始逻辑） |
| 表格作者列 | 同样使用 Gravatar URL（20px），无头像时保留原首字母；与子卡片共用同一 `<AuthorAvatar>` 组件 |
| MD5 实现 | 纯 JS 轻量实现（无外部依赖），写入 `commitTooltipUtils.ts` |
| 提交信息区域 | `max-height: 216px; overflow-y: auto`，与当前图表滚动条风格一致（自动隐藏/悬停时显示） |
| 子卡片宽度 | 固定 `320px` |
| 哈希复制 | 复用已有 `<CopyButton>` 组件（inline 显示） |
| 信息分隔 | 各区域之间使用 `1px solid var(--border-subtle)` 分割线 |

### 新增组件

`CommitTooltipCard`（位于 `BranchGraph.tsx` 或独立文件）：

```typescript
interface CommitTooltipCardProps {
  hash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
}
```

### 新增/修改 CSS 类

在 `git-visualization.css` 中新增：

| 类名 | 用途 |
|------|------|
| `.adl-branch-graph__tooltip-card` | 卡片容器（`padding: 12px; min-width: 320px; font-size: 12px; line-height: 1.5`）|
| `.adl-branch-graph__tooltip-info-row` | 信息行（flex 布局，含 label + value）|
| `.adl-branch-graph__tooltip-hash` | 哈希值行（等宽字体）|
| `.adl-branch-graph__tooltip-message` | 消息区域（`max-height: 216px; overflow-y: auto`）|
| `.adl-branch-graph__tooltip-avatar-row` | 作者头像+名称 Flex 行 |
| `.adl-branch-graph__tooltip-divider` | 分割线 |

### 滚动条风格

消息区域的滚动条复用现有 `.adl-git-vis__chart` 的 auto-hide 模式：
- 默认 `scrollbar-color: transparent transparent`
- 悬停/滚动时显示（通过 `data-scrolling` / `data-scrollbar-near` 属性）

### 改动范围汇总

| 文件 | 操作 |
|------|------|
| `BranchGraph.tsx` | 移除 `title` 属性；添加 `TooltipSimple` 包裹每行；新增 `CommitTooltipCard`；扩展 `AuthorAvatar` 支持 `src` 属性传入 Gravatar URL；表格作者列传入 `src`；替换日期函数 |
| `git-visualization.css` | 新增 6 个 CSS 类 |
| `git-visualization/utils/commitTooltipUtils.ts`（新增） | `formatDate()` + `getGravatarUrl()` + `md5()`（纯 JS 实现，无外部依赖） |
| `BranchGraph.test.tsx` | 新增子卡片内容、头像降级等测试 |

---

## 组件关系图

```
BranchGraph
├── TooltipSimple (per row, dismissible)
│   └── CommitTooltipCard
│       ├── Hash row + CopyButton
│       ├── Message area (max 12 lines, scrollable)
│       ├── AuthorAvatar (Gravatar src) + name + email
│       └── Full date (natural format)
├── TagRow (sticky top, overflow-x: auto)
├── SvgLanes (in left panel, max-width 400px)
└── Table rows (in right panel, flex:1)
    ├── Hash + CopyButton
    ├── Message + optional tag
    ├── AuthorAvatar (Gravatar 20px) + name
    └── Date (HH:mm DD-MM-YYYY)
```

---

## 测试策略

| 测试项 | 覆盖内容 |
|--------|---------|
| `BranchGraph.test.tsx` | TooltipSimple 渲染、子卡片内容正确性 |
| `BranchGraph.test.tsx` | 头像 Gravatar URL 生成及 onError 降级 |
| `BranchGraph.test.tsx` | 日期格式（表格 + 子卡片两种模式） |
| `BranchGraph.test.tsx` | 提交信息区域 12 行溢出滚动 |
| `BranchGraph.test.tsx` | 泳道面板水平滚动、标签行 sticky |
| 手动验证 | `feat/opencode-integration-fix` 分支是否出现 |
