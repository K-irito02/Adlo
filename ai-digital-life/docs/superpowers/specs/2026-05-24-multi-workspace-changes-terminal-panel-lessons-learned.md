# 多工作区 Changes & Terminal 面板改造 — 经验教训

> 日期: 2026-05-24
> 关联设计: `2026-05-24-multi-workspace-changes-terminal-panel-design.md`
> 关联计划: `.trae/documents/multi-workspace-right-panel-plan.md`

## 本次改造涉及的功能
- Changes 面板多工作区改造（tree/list/outline 模式切换 + 两行导航器）
- Terminal 面板多工作区改造（两行导航器 + 4 个 hover 按钮）
- 统一三个面板的导航器布局和交互范式
- 全栈工作区感知的 diff 预览（IPC + Rust + Store + 组件）
- 终端默认 profile 设置菜单（hover 子菜单 + 实时响应）

---

## 教训记录

### 1. 导航器布局如何与 Files 面板统一

**问题**：初始实现中 Changes 面板导航器有独立的展开/折叠按钮（两个分开的 button），Terminal 面板的导航器则完全没有两行布局结构。

**解决方案**：
- Changes 面板：合并展开/折叠为一个根据状态切换图标的按钮；添加第二行模式切换按钮（tree/list/outline）；右侧显示统计数字 + 刷新
- Terminal 面板：完全重构为两行布局，从原来的"导航器内只有一个 MultiWorkspaceTerminal"改为与 Files 一致的 Row1/Row2 结构

**教训**：三个面板的统一应作为设计约束预先定义。等到各自开发完再对齐，成本更高。

### 2. 统计数字不显示的 bug

**问题**：`changeCounts` 的 `useMemo` 只遍历 `workspaceChangesExpanded`（已展开的工作区），收起的工作区 gitSnapshots 数据被跳过，导致统计数字为 0。

**解决方案**：改为遍历 `visibleWorkspaces`，从 `gitSnapshots` 直接读取数据。对于尚未惰性加载 git 状态的工作区返回 0。

**教训**：`useMemo` 的依赖数组和数据源必须与"可见"概念一致，而非"展开"概念。

### 3. hover 时名称让位过度

**问题**：`.adl-multitree-entry__name` 在 hover 时设置 `padding-right: 82px`（为三个操作按钮预留空间），但统计数字 `<span class="adl-multitree-entry__count">` 即使 `opacity: 0` 仍占据布局宽度，导致名称截断的右侧有额外空白。

**解决方案**：hover 时除了隐藏数字，还折叠其 `width`、`margin`：
```css
.adl-multitree-entry__namezone:hover .adl-multitree-entry__count {
  opacity: 0;
  width: 0;
  margin: 0;
  overflow: hidden;
}
```

**教训**：`opacity: 0` 只影响视觉，不影响布局。要真正"消失"需要宽度/外边距折叠。

### 4. 刷新全部按钮不刷新统计数字

**问题**：`loadGitSnapshot` 有缓存保护（已有数据时跳过），点击"刷新全部"不会重新获取 git 状态。

**解决方案**：新增 `refreshGitSnapshot` action（跳过缓存检查，始终强制重新获取），刷新按钮调用此 action。

**教训**：一个 API 不能同时服务于"惰性加载"和"强制刷新"两个语义。需要独立 API。

### 5. CustomScrollArea 滚动条收起后残留

**问题**：收起工作区后子节点高度减小，但 `ResizeObserver` 只观察了 `scroll.firstElementChild`（第一个子元素），其他子元素的高度变化（收起导致的后续子元素悬浮）不触发重新计算。

**解决方案**：新增 `useEffect` 监听 `children` 变化时重新调用 `updateScrollbar()`：
```tsx
useEffect(() => { updateScrollbar(); }, [updateScrollbar, children]);
```

**教训**：`ResizeObserver` 观察特定子元素有盲区。数据驱动的 `children` 变化是更可靠的信号源。

### 6. 工作区感知的 diff 预览需要全栈改动

**问题**：点击非当前工作区的变更文件时，diff 预览为空。因为 `openChangePreview` 使用 `with_workspace()` 获取的是当前活动工作区的路径。

**解决方案**：全栈 10 个文件修改：
1. Rust `workspace_get_change_preview` 添加 `workspace_path: Option<String>` 参数
2. IPC 契约新增 `getChangePreviewForWorkspace`
3. 3 个桥接层实现（tauri/preview/mock）
4. Store 新增 `openChangePreviewForWorkspace` action（workspace-scoped 缓存键）
5. 组件回调链添加 workspace 上下文传递

**教训**：从单工作区到多工作区，任何涉及文件路径的操作都必须显式传递 workspace 上下文。不能依赖"当前活动工作区"的隐式假设。

### 7. Store props 链路太深导致不响应

**问题**：`currentProfile` 通过 TerminalPanel → MultiWorkspaceTerminal → WorkspaceTerminalEntry 逐层传递，profile 切换后子菜单的 ✓ 和父菜单文字不更新。

**解决方案**：WorkspaceTerminalEntry 改为直接 `useAppStore((s) => s.defaultTerminalProfile)` 读取 store，移除整个 props 传递链。

**教训**：当数据被多个层次频繁读取且需要实时响应时，直接用 store selector 比 props 传递更可靠。Props 传递链越长越容易断。

### 8. 终端 profile 子菜单 hover 消失

**问题**：鼠标从父菜单项移到子菜单卡片时，子菜单立即消失（父菜单项 `onMouseLeave` 触发）。

**解决方案**：引入 150ms 延时缓冲机制。父项和子项共享同一个计时器：`mouseEnter` 取消计时器（保持显示），`mouseLeave` 启动计时器（150ms 后隐藏）。

**教训**：子菜单的 hover 实现需要"缓冲时间"来穿越父菜单与子菜单之间的物理间隙。即时响应在这里产生了错误的 UX。

### 9. 选择 profile 后菜单不应关闭

**问题**：`handleSelectDefaultProfile` 在更新 store 后立即调用 `closeMenu()`，React 批量更新后 portal 消失，用户看不到变化。

**解决方案**：移除 `closeMenu()` 调用，让菜单保持打开，用户直接看到 ✓ 和文本更新。

**教训**：对于配置类操作（非执行类），保持菜单打开让用户看到即时反馈比自动关闭更重要。

### 10. 两行导航器按钮冗余

**问题**：Terminal 面板的导航器内部有一个完整的 `<div class="adl-tool-navigator__context">` 包含切换侧边栏按钮、标题、ShellSelector、MenuDropdown —— 这些与外部 toolbar 完全重复。

**解决方案**：删除导航器内部的冗余元素，只保留 `MultiWorkspaceTerminal`。

**教训**：重构时要注意检查"同一个东西是否在两个位置渲染"。Toolbar 和 Navigator 的职责不同，不应互相复制。

## 架构决策摘要

| 决策 | 选项 A | 选项 B（选择） | 原因 |
|------|--------|----------------|------|
| diff 预览调用 | 通过 props 传递 workspace | 全栈支持 workspace 参数 | 后端也需要知道路径 |
| profile 数据源 | props 逐层传递 | WorkspaceTerminalEntry 直接 useAppStore | 避免链条断裂，保证实时性 |
| profile 选择行为 | 选择 → 关闭菜单 | 选择 → 保持菜单 | 即时视觉反馈更重要 |
| 子菜单展开 | 点击展开 | hover 展开 + 150ms 延时 | 更自然的交互流 |
| 展开/折叠按钮 | 两个分开 button | 一个 button 状态切换 | 节省空间，与 Files 统一 |
| 统计数字 hover | 仅 opacity:0 | opacity:0 + width:0 + margin:0 | 彻底释放布局空间 |
| 刷新语义 | loadGitSnapshot（有缓存） | refreshGitSnapshot（强制） | 分离惰性加载和强制刷新 |
