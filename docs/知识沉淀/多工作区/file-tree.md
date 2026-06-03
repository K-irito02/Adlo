# 多工作区文件树 - 经验教训

## 概述

本次实现将文件面板从"单工作区文件树"改造为"多工作区文件树"，涉及 Rust 后端、IPC 桥接、Zustand Store、3 个新组件和多个现有组件的改造。历时约 1.5 天，经历约 10 轮迭代反馈调整。

## 变更规模

| 层 | 文件数 | 说明 |
|----|--------|------|
| Rust 后端 | 2 | types.rs + workspace.rs |
| Tauri Commands | 2 | workspace.rs + main.rs |
| IPC 桥接 | 4 | ipc.ts + tauri/preview/mock |
| Kernel 类型 | 1 | kernel/index.ts |
| Store slices | 1 | workspaceSlice.ts |
| Store actions | 1 | workspaceActions.ts |
| Store state | 1 | StoreState.ts |
| General actions | 1 | generalActions.ts |
| UI Store | 1 | ui-store.ts |
| 新组件 | 3 | WorkspaceFileTreeEntry + MultiWorkspaceFileTree + index.ts |
| 改造成分 | 5 | FileNavigatorShell/FilesPanel/RightPanel/types/SidebarContextMenu |
| CSS | 1 | rightpanel.css（~150 行新增） |
| 拷贝字典 | 1 | copy.ts（1 条中英文） |
| 测试补丁 | 3 | mock-bridge/sidebarViewModel/sidebarViewModel.test |

## 关键教训

### 1. Ref 被 TooltipSimple 覆盖

**问题**: `useRef<HTMLButtonElement>` 绑定到被 `TooltipSimple` 包裹的按钮后，`ref.current` 始终为 `null`。

**根因**: `TooltipTrigger` 内部使用 `React.cloneElement` 重写了子元素的 props，ref 被覆盖。

**解决方案**: 
- 放弃 `useRef`，改用 `data-menu-btn-id={menuId}` 属性标记按钮
- 用 `e.currentTarget.getBoundingClientRect()` 获取菜单位置
- 点击外部检测改为 `document.querySelector('[data-menu-id="..."]')` 匹配

### 2. 展开工作区不显示文件树

**问题**: 点击 ▸ 展开后，展开区域显示"点击上方 + 号创建工作空间"。

**根因**: `onToggleExpand` 绑定的是 `toggleWorkspaceTreeInFileNav`，它只切换状态 `boolean`，**不加载文件树数据**。

**解决方案**: 改为调用 `expandWorkspaceTreeInFileNav(workspaceId, path)`，它在展开时自动调用 `loadWorkspaceTree` 从后端加载数据。

### 3. CustomScrollArea 滚动容器不工作

**问题**: 使用 `CustomScrollArea` 后滚动条不出现，内容不能滚动。

**根因**:
1. CSS 选择器错误：`is-scrollable` class 加在 shell 上，但选择器写成了 `.adl-multitree-scrollbar.is-scrollable`
2. 滚动容器使用 `position: absolute; inset: 0` 时存在兼容问题

**解决方案**:
- 选择器改为 `.adl-multitree.is-scrollable .adl-multitree-scrollbar`
- 滚动容器改为 `height: 100%`，与 FileTree 一致

### 4. 操作按钮占用布局空间

**问题**: 3 个操作按钮（刷新、置顶、更多）无论是否显示都占据布局宽度，导致名称区域始终被压缩。

**解决方案**: 将 `.adl-multitree-entry__actions` 改为 `position: absolute` 定位，脱离文档流。名称在未悬停时填满全部空间，悬停时通过 `padding-right: 82px` 让出按钮位。

### 5. 两行工具栏布局

**问题**: 最初单行容纳所有按钮（模式切换 + 全局操作 + 文件创建），排版拥挤。

**解决方案**: 拆分为两行：
- Row 1: [展开/折叠全部] 动态标题 [计数徽标] [刷新全部]
- Row 2: [文件树] [大纲] [新建文件] [新建文件夹]

### 6. 隐藏状态同步

**问题**: `removeFromSidebar` 和 `hiddenInFileTree` 在 Rust 后端和前端之间未完全同步。

**解决方案**: 在后端 `remove_from_sidebar` 中自动设置 `hidden_in_file_tree = true`。`showInFileTree` 先设置 `hiddenInFileTree=false`，若 `removedFromSidebar=true` 则恢复为 false 并重新加入侧边栏。

## 架构决策

| 决策 | 方案 | 理由 |
|------|------|------|
| 文件树数据加载策略 | 惰性加载（展开时） | `listTree` 是串行操作，bootstrap 时一次加载所有工作区文件树会阻塞启动 |
| 展开状态同步 | Zustand workspaceSlice | 与侧边栏展开状态分离，文件导航器独立控制 |
| 全局展开/折叠 | `expandAllWorkspaceTreesInFileNav` / `collapseAllWorkspaceTreesInFileNav` | 批量处理，避免逐工作区调用 |
| 菜单定位 | `createPortal` + `position: fixed` | 避免被父容器 `overflow: hidden` 裁剪 |
| 自定义滚动条 | `CustomScrollArea` 组件复用 | 与 FileTree/OutlineTree 保持一致，统一视觉体验 |

---

## 第二轮迭代（后续优化）

### 变更规模

| 层 | 文件数 | 说明 |
|----|--------|------|
| 组件改进 | 1 | WorkspaceFileTreeEntry.tsx |
| CSS | 1 | rightpanel.css（~20 行变更） |
| Store 重构 | 4 | RightPanel.tsx / FilesPanel.tsx / FileNavigatorShell.tsx / types.ts |

### 关键教训

#### 7. 展开图标从箭头改为文件夹

**问题**: 用户期望展开/折叠工作区的视觉语义更接近"文件夹"，而非箭头。

**解决方案**: 将 `IconChevronRight/IconChevronDown`（▶/▼）改为 `IconFolder/IconFolderOpen`（📁/📂）。同时移除了 `.is-expanded` 的 `rotate(90deg)` CSS 规则（之前用于将向右箭头旋转为向下箭头），因为文件夹图标没有旋转语义。

#### 8. 重复 Store 订阅导致不必要重渲染

**问题**: `FileNavigatorShell` 通过 4 个 `useAppStore` 选择器钩子直接订阅 store 状态，但这些值已通过 props 获得。

**解决方案**: 将数据流从"多处订阅 store"改为"集中读取、逐层下传"：
- `RightPanel.tsx` 是唯一的 store 读取点
- `types.ts` 的 `RightPanelViewProps` 新增 4 个字段
- `FilesPanel.tsx` 透传
- `FileNavigatorShell` 从 props 接收，移除 4 行 `useAppStore`

#### 9. 名称区域应触发展开/收起，而非切换工作区

**问题**: 点击名称区域原本是切换到该工作区，但用户希望点击名称区域触发展开/折叠，切换工作区功能已被更明确的交互替代。

**解决方案**: `handleNameClick` 从 `onOpenWorkspace` 改为 `onToggleExpand()`。同时新增 `handleNameContextMenu` 支持右键弹出更多操作菜单。

#### 10. 移除 is-current 常驻背景

**问题**: 当前工作区头部行有常驻灰色背景（`var(--surface-active)`），与文件树中"已选中"语义混淆。

**解决方案**: 移除 `.adl-multitree-entry.is-current .adl-multitree-entry__header` 的 `background: var(--surface-active)`。现在只有 hover 时才会出现背景色。

#### 11. 内部分割线干扰视觉

**问题**: 展开后头部行与文件树之间有 `border-top` 分割线，文件树区域有额外灰色背景（`var(--surface-subtle)`）。

**解决方案**: 移除 `.adl-multitree-entry__tree` 的 `border-top` 和 `background`。工作区头部行与其文件树之间不再有分割线和背景色，"一体感"更强。工作区间隔由 `.adl-multitree-entry` 的 `border-bottom` 实现。

### 架构决策（更新）

| 决策 | 方案 | 理由 |
|------|------|------|
| namezone 交互 | 单击展开/折叠 + 右键菜单 | 与文件树文件夹交互一致，切换工作区操作另有专门入口 |
| 视觉策略 | 去常驻高亮，保留 hover | 多工作区场景中"当前工作区"由工具栏标题体现，头部行不需要额外背景标记 |
| Store 布局 | 集中读取、逐层下传 | 减少不必要的 Zustand 订阅重渲染，让数据流路径可追踪 |
