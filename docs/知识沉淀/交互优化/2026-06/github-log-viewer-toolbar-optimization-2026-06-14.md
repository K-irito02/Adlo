# GitHub 日志查看器工具栏交互优化

2026-06-14

## 变更摘要

对"通信 → GitHub → 日志"子条目的内容显示区域进行了四项交互与视觉优化，并删除了"任务"子条目中无实际作用的搜索输入框。

### 1. 自定义 Job 选择下拉菜单（`GitHubLogViewer.tsx` + `communication-panel.css`）

将原生 `<select>` 替换为自定义按钮 + 下拉菜单卡片：

- **触发按钮**：宽度 130px 固定，无边框直角，`overflow: hidden` 裁剪过长名称
- **展开图标**：独立 hover 背景效果（`--surface-hover`）
- **菜单卡片**：`max-height: 140px`（5 行），直角，自定义滚动条
- **内容行**：名称 `overflow: hidden` 无省略号，右侧固定 12×12px 占位区
- **选中标记**：`IconCheck`，颜色 `var(--text-primary)`，始终占位确保所有行右侧对齐
- **名称 tooltip**：`title` 属性提供系统原生 tooltip

### 2. 搜索框始终可见（`GitHubLogViewer.tsx` + `communication-panel.css`）

移除 hover-reveal 模式，输入框始终 `display: block`，保留 hover/focus 背景效果。

### 3. 折叠空白 → 正方形复选框（`GitHubLogViewer.tsx` + `communication-panel.css`）

替换原有的 pill 形 toggle switch：
- 14×14px 正方形直角，无色（`--text-primary`/`--bg` 主题色）
- 选中时背景 `var(--text-primary)`，勾选图标 `var(--bg)`

### 4. 工具栏布局裁剪（`communication-panel.css`）

面板变窄时，左侧（下拉菜单 + 搜索 + 复选框）与右侧（跳至顶部按钮 + GitHub 链接）均被 `overflow: hidden` 裁剪，不再相互重叠。

### 5. 删除"任务"子条目的搜索输入框（`JobsView.tsx` + `communication-panel.css`）

该搜索框仅按 job 名称/步骤名称过滤，而状态过滤按钮（全部/成功/失败/运行中）已满足需求，且"搜索日志"的 label 具误导性。

## 关键技术挑战

### 下拉菜单定位与 `overflow: hidden` 冲突

**问题**：`overflow: hidden` 在 `toolbar-left` 上裁剪了下拉菜单（`position: absolute; top: 100%`）。

**第一次尝试**：使用 `position: fixed` + `getBoundingClientRect()` 定位。但因祖先元素有 `transform` 属性（面板动画/布局），导致 `position: fixed` 的包含块不是视口而是该祖先，定位异常。

**最终方案**：将菜单渲染为 toolbar 的直接子元素（非 toolbar-left 的子元素），toolbar 添加 `position: relative`。通过 `getBoundingClientRect()` 计算按钮相对于 toolbar 的偏移量，菜单使用 `position: absolute` 定位。这样菜单脱离了 toolbar-left 的 `overflow: hidden` 裁剪。

```tsx
// 计算按钮相对 toolbar 的位置
const r = triggerRef.current.getBoundingClientRect();
const tr = toolbarRef.current.getBoundingClientRect();
setMenuLeft(r.left - tr.left);
setMenuTop(r.bottom - tr.top);
setMenuWidth(r.width);
```

### 搜索框 hover 背景侵占问题

**问题**：搜索框 hover 背景效果超出其容器范围，侵占右侧复选框区域。

**解决**：在搜索框容器添加 `overflow: hidden` 约束背景效果边界。同时搜索框宽度从 `flex: 1; max-width: 240px` 改为 `flex: 1; min-width: 140px; max-width: 280px`，使搜索框能自适应填充左侧剩余空间，消除复选框右侧空白。

### 直角设计一致性

所有相关元素（下拉菜单、搜索框、复选框、按钮）的 `border-radius` 统一设为 `0`，确保整个日志查看器工具栏的风格一致性。

## 设计决定

| 决定 | 理由 |
|------|------|
| 自定义下拉菜单替代原生 `<select>` | 需要更灵活的样式控制（直角、hover 效果、固定宽度） |
| 移除 hover-reveal 搜索模式 | 用户期望搜索框始终可见，hover-reveal 仅在图标上触发，体验不佳 |
| 正方形复选框替代 toggle switch | 用户明确要求，符合整体直角设计语言 |
| 使用 `position: absolute` 相对 toolbar 定位菜单 | 避免 `position: fixed` 因祖先 `transform` 而定位异常 |
| 名称 `overflow: hidden` 无 `text-overflow: ellipsis` | 用户不希望看到省略号，完整名称由 `title` tooltip 提供 |

## 相关文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.tsx` | 自定义下拉菜单、移除 hover-reveal 搜索、复选框替换、toolbar ref |
| `frontend/src/app/regions/right-panel/panels/communicate/JobsView.tsx` | 移除搜索输入框 |
| `frontend/src/app/regions/right-panel/panels/communicate/JobsView.test.tsx` | 移除搜索输入测试 |
| `frontend/src/styles/regions/rightpanel/communication-panel.css` | 直角统一、下拉菜单样式、复选框样式、搜索框简化、工具栏裁剪、名称溢出 |
