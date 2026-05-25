# 层级结构收起/展开图标悬停高亮改进

## 概述

改进文件树（FileTree）和大纲树（OutlineTree）中「折叠/展开」图标的鼠标悬停高亮效果，使其在悬停节点的**任意位置**（toggle 图标、标签文字、meta 区域）时，该节点所有后代节点的 toggle 图标都能正确高亮显示。

## 当前状态分析

### 涉及组件

| 组件 | 文件 | 使用场景 |
|------|------|----------|
| TreeNodeRow | `features/file-tree/TreeNodeRow.tsx` | 共享单行渲染组件 |
| FileTree | `features/file-tree/fileTree.tsx` | 文件面板-文件树 / 变更面板-文件树 |
| OutlineTree | `features/outline/OutlineTree.tsx` | 文件面板-大纲 / 变更面板-大纲 |

### 当前悬停机制

```
hoveredPath/hoveredId state (顶层)
  → 传给所有子节点
  → 子节点判断 hoveredPath === node.path 得到 isHovered
  → isHovered=true 的 <li> 添加 .is-hovered class
  → CSS: .is-hovered .toggle { color: text-primary } 高亮后代 toggle
```

### 三个根因

| # | 根因 | 影响 |
|---|------|------|
| 1 | `onMouseEnter`/`onMouseLeave` **仅绑定在标签按钮**上，toggle 图标和 meta 区域不触发 | 悬停 toggle 图标时 `<li>` 不获得 `is-hovered`，子节点 toggle 不高亮 |
| 2 | 大纲树缺少后代 toggle 高亮 CSS 规则（只有文件树有 `.adl-filetree__item.is-hovered .adl-filetree__toggle`） | 大纲树即使在 label 上悬停，子节点 toggle 也不高亮 |
| 3 | 悬停状态是单路径匹配（`hoveredPath === node.path`），配合 DOM 嵌套 + 后代 CSS 选择器实现子节点高亮 — 这个设计本身正确，问题出在事件绑定位置和 CSS 缺失 |

## 修改方案

### 修改 1：TreeNodeRow 新增行级悬停事件 props

**文件**: `ai-digital-life/frontend/src/app/features/file-tree/TreeNodeRow.tsx`

- 在 props 类型中新增 `onRowMouseEnter?: () => void` 和 `onRowMouseLeave?: () => void`
- 在 row `<div>` 上绑定这两个事件（与已有的 `onContextMenu` 并列）
- 原有的 `onLabelMouseEnter`/`onLabelMouseLeave`/`onLabelFocus`/`onLabelBlur` **保留不变**，供 focus 键盘导航使用

```tsx
// 新增 props 类型
onRowMouseEnter?: () => void;
onRowMouseLeave?: () => void;

// row div 绑定
<div
  className={`adl-tree-node__row${rowClassName ? ...}`}
  onContextMenu={onContextMenu}
  onMouseEnter={onRowMouseEnter}
  onMouseLeave={onRowMouseLeave}
>
```

> `mouseenter`/`mouseleave` 不冒泡，子节点 row 不是父节点 row 的 DOM 后代（它们是兄弟结构：parent row → ul → li → child row），所以移入子节点 row 时父节点的 `mouseleave` 会正确触发，子节点的 `mouseenter` 会正确触发。

### 修改 2：FileTree 将悬停事件移至行级

**文件**: `ai-digital-life/frontend/src/app/features/file-tree/fileTree.tsx`

- `FileTreeNodeComponent` 新增解构 `onRowMouseEnter`/`onRowMouseLeave` props
- 将 `onMouseEnter`/`onMouseLeave` 的值传给 TreeNodeRow 的 `onRowMouseEnter`/`onRowMouseLeave` 而非 `onLabelMouseEnter`/`onLabelMouseLeave`
- 根节点（FileTree 中的 `MemoizedFileTreeNode`）同样改为 `onRowMouseEnter`/`onRowMouseLeave`
- `FileTreeNodeProps` 接口中新增 `onRowMouseEnter`/`onRowMouseLeave`
- memo 比较函数 `areFileTreeNodePropsEqual` 不需要修改（只比较 `hoveredPath === path`，不比较事件回调）

### 修改 3：OutlineTree 将悬停事件移至行级

**文件**: `ai-digital-life/frontend/src/app/features/outline/OutlineTree.tsx`

- 将 `hoveredId` 的设置从 `onLabelMouseEnter`/`onLabelMouseLeave` 移到 `onRowMouseEnter`/`onRowMouseLeave`
- 保留 `onLabelFocus`/`onLabelBlur`（键盘导航需要）
- `onRowMouseLeave` 的处理逻辑与原来的 `onLabelMouseLeave` 一致：

```tsx
onRowMouseEnter={() => setHoveredId(item.id)}
onRowMouseLeave={() => setHoveredId((current) => current === item.id ? null : current)}
```

### 修改 4：大纲树新增后代 toggle 高亮 CSS

**文件**: `ai-digital-life/frontend/src/styles/regions/rightpanel/files-panel.css`

在现有文件树规则旁（L1337-L1340 附近），新增一条大纲树规则：

```css
.adl-outline-tree__item.is-hovered .adl-outline-tree__toggle {
  color: var(--text-primary);
}
```

位置：紧接 `.adl-filetree__item.is-hovered .adl-filetree__toggle` 规则之后。

## 效果验证

修改后的预期行为：

| 场景 | 修改前 | 修改后 |
|------|--------|--------|
| 悬停父节点 toggle 图标 | 子节点 toggle 不高亮 | ✅ 高亮 |
| 悬停父节点标签文字 | FileTree 高亮 / Outline 不高亮 | ✅ 都高亮 |
| 悬停父节点 meta 区域 | 无效果 | ✅ 子节点 toggle 高亮 |
| 悬停子节点 toggle 图标 | 孙节点 toggle 不高亮 | ✅ 高亮 |
| 悬停子节点标签文字 | FileTree 孙节点高亮 / Outline 不高亮 | ✅ 都高亮 |
| 兄弟节点 | 不高亮 | ✅ 不高亮（不受影响） |
| 祖先节点 | 不高亮 | ✅ 不高亮（不受影响） |

## 涉及文件清单

| # | 文件 | 修改类型 | 影响范围 |
|---|------|----------|----------|
| 1 | `frontend/src/app/features/file-tree/TreeNodeRow.tsx` | 新增 props + 绑定 | 共享组件，影响所有使用者 |
| 2 | `frontend/src/app/features/file-tree/fileTree.tsx` | 事件传递路径变更 | 文件树（文件面板 + 变更面板） |
| 3 | `frontend/src/app/features/outline/OutlineTree.tsx` | 事件传递路径变更 | 大纲树（文件面板 + 变更面板） |
| 4 | `frontend/src/styles/regions/rightpanel/files-panel.css` | 新增 CSS 规则 | 大纲树视觉 |

## 验证步骤

1. `npm --prefix frontend run typecheck` — 类型检查通过
2. `npm --prefix frontend test` — 现有测试通过
3. 手动验证：
   - 文件面板 → 文件树：悬停 toggle 图标 → 子节点 toggle 高亮
   - 文件面板 → 文档大纲：悬停 toggle 图标 → 子节点 toggle 高亮
   - 变更面板 → 文件树：同上
   - 变更面板 → 文档大纲：同上
   - 悬停兄弟/祖先节点 → 不应高亮
