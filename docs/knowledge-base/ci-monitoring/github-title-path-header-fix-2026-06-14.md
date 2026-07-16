# GitHub 面板标题路径提示行修复

## 背景

GitHub 通信面板的标题提示行（位于内容显示区顶部，显示当前目录路径和子条目名称）存在多项 UI 及交互问题，影响用户定位和操作体验。

## 解决的问题

### 1. 标题行垂直居中

**问题**：标题行文字距底部边框分割线近、距上方边缘远，视觉上未垂直居中。

**根因**：外层容器 `.adl-tool-primary__scroll` 存在 `padding: var(--space-3)`（~12px），把标题行整体推离顶部，导致上方空间远大于下方。

**修复**：标题行设置 `margin-top: calc(-1 * var(--space-3))` 抵消容器顶部 padding，配合 `min-height: 32px` + `display: flex; align-items: center; justify-content: center;` 让文字在分割线上方区域完全垂直居中。

### 2. 标题行完全消失

**问题**：修复全局点击逻辑后，点击树条目后标题行不再出现。

**根因**：全局点击处理器通过 `target.closest('.adl-filetree__row').dataset.path` 获取路径，但 `data-path` 属性位于 `<li>` 元素（`adl-tree-node`）而非 `<div class="adl-filetree__row">` 上，导致 `dataset.path` 为 `undefined`，进而 `handleSelectTreePath(undefined)` 清空了选中状态。

**修复**：简化全局点击处理器——点击 `.adl-tool-surface--github` 内部任何位置均不做任何处理（由 React 事件系统正常处理树点击），仅点击面板外部时才清理选中状态。

### 3. 嵌套子目录路径不完整

**问题**：点击嵌套子目录的子条目时只显示目录名，未显示完整路径。

**修复**：`displayPath` 逻辑新增沿 `parentId` 链向上回溯，拼接完整路径（如 `根目录 / 子目录1 / 子目录2`）。

### 4. 缺少分类标识

**问题**：标题行仅有路径和子条目名，用户无法区分当前查看的是"工作区目录"还是"非工作区目录"。

**修复**：新增 `folderCategory` 计算逻辑，沿 `parentType` 链遍历判断分类归属，在路径左侧显示 `[工作区目录]` 或 `[非工作区目录]`。显示格式：`[分类] [完整路径] [子条目]`。

### 5. 全局点击处理不当

**问题**：点击内容显示区域时标题行消失。

**根因**：原始全局点击处理器在点击非树条目元素时调用 `handleSelectTreePath(null)`，但未排除内容显示区域（`adl-tool-primary--github`），导致点击内容区时清空选中状态。

**修复**：全局处理器增加 `.adl-tool-primary--github` 排除判断，内容区点击不干涉选中状态。

### 6. 路径与子条目间的分隔符

**问题**：`[路径] / [子条目]` 中的 `/` 分隔符不必要，增加视觉噪音。

**修复**：移除 `/` 分隔符，格式简化为 `[分类] [完整路径] [子条目]`。

## 技术要点

| 要点 | 说明 |
|------|------|
| `margin-top: calc(-1 * var(--space-3))` | 抵消外层 flex 容器 `padding`，让标题行从容器顶部开始 |
| `min-height` + `align-items: center` | 确保文字在固定高度区域内严格垂直居中 |
| `data-path` 归属 | `data-path` 在 `<li class="adl-tree-node">` 上，不在 `<div class="adl-filetree__row">` 上 |
| 全局 click vs React 合成事件 | 全局 `document.addEventListener('click', ...)` 在 React 合成事件之后触发，若不小心会覆盖 React 的状态更新 |
| `parentType` 链回溯 | 通过 `parentId` + `parentType` 链判断文件夹归属于"工作区"还是"用户创建"分类 |
| 双击发更新 | React 18+ 自动批处理会合并多个 `setState`，但跨事件系统（合成事件→原生事件）需注意写顺序 |

## 关键教训

1. **`data-path` 不在 `adl-filetree__row` 上**——FileTree 的 `data-path` 属性在 `<li>` 容器上，获取行路径应通过 `target.closest('[data-path]')` 而非假设 `.adl-filetree__row` 上有该属性
2. **负 margin 抵消容器 padding**——当子元素需要避开外层 flex 容器的 `padding` 时，`margin-top: calc(-1 * var(--space-3))` 是最简洁的 CSS 方案
3. **全局点击处理器要加范围守卫**——`document.addEventListener('click', ...)` 必须过滤面板内部点击，否则会覆盖 React 的正常状态管理
4. **沿 parentId 链回溯**——树形结构的文件夹需要沿父链拼接路径时，用 `while` 循环遍历 `parentId` 链比递归更简洁可控

## 相关文件

| 文件 | 修改内容 |
|------|----------|
| `communication-panel.css` | `adl-github-path-header` 改用 flex + margin-top 负值 + min-height 实现垂直居中 |
| `GitHubPanel.tsx` | `displayPath` 回溯 parentId 链拼接完整路径；新增 `folderCategory` 分类判断；简化全局点击处理器；移除 `/` 分隔符 |
