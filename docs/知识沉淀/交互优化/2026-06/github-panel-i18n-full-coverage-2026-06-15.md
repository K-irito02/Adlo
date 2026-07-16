# GitHub 子面板 i18n 全覆盖

## 背景

GitHub CI 子面板（概览/工作流/任务/日志）中存在 15 处硬编码字符串，不支持中英文切换。同时存在预存 Bug：切换语言时面包屑路径标题行消失。

## 修改清单

### 1. 硬编码清理（6 组件）

| 文件 | 问题 | 修复 |
|------|------|------|
| `CommunicationPanel.tsx` | `'GitHub'`/`'QQ'` tab label 硬编码 | 改用 `t.communicateTabGitHub`/`t.communicateTabQQ` |
| `GitHubPanel.tsx` | sectionLabels 硬编码中文"概览/工作流/任务/日志" | 改用 `t.ciOverview/ciWorkflows/ciJobs/ciLogs` |
| `GitHubPanel.tsx` | NavigatorResizeHandle label 硬编码 | 改用 `t.ciResizeNavigator` |
| `WorkflowsView.tsx` | FILTERS 按钮"全部/成功/失败/运行中"硬编码 | 改用 `t.ciFilterAll/Success/Failure/Running` |
| `JobsView.tsx` | 同上 | 同上 |
| `JobRow.tsx` | Collapse/Expand aria-label 硬编码 | 改用 `t.ciCollapse/ciExpand` |
| `GitHubLogViewer.tsx` | "跳至顶部 (Ctrl+Home)" tooltip 硬编码 | 改用 `t.ciJumpToTop` |

### 2. 工具函数 locale 感知

| 函数 | 文件 | 问题 | 修复 |
|------|------|------|------|
| `formatTime` | `githubPanelUtils.ts` | 硬编码 `Intl.DateTimeFormat('zh-CN')` | 增加 `locale` 参数，传递应用 locale |
| `formatRelativeTime` | `githubPanelUtils.ts` | 硬编码中文"刚刚/分钟前/小时前/天前" | 增加 `locale` 参数，根据 locale 返回对应语言 |

### 3. 新增翻译 key（17 个）

`communicate.ts`（横跨 zh-CN/en-US）：
- `communicateTabGitHub`, `communicateTabQQ`

`ci.ts`（横跨 zh-CN/en-US）：
- `ciResizeNavigator`, `ciFilterAll`, `ciFilterSuccess`, `ciFilterFailure`, `ciFilterRunning`
- `ciCollapse`, `ciExpand`, `ciJumpToTop`

### 4. 预存 Bug 修复

**现象**：切换语言时，内容区域顶部的面包屑路径标题行消失。
**根因**：标题行渲染条件 `displayPath && isLeafSelected` 中：
- `displayPath` 依赖 `workspaces` 列表，切换语言时 store 级联渲染可能导致其被清空
- `isLeafSelected` 依赖 `selectedGitHubTreePath`，切换语言时同样可能被重置

**修复**：改用 `hasActiveItem && (isLeafSelected || !!activeWorkspaceSection)`：
- `hasActiveItem = !!(activeCiWorkspaceId || activeCiFolderId)` — 直接检查 store 中的稳定 ID
- `!!activeWorkspaceSection` — 视图内容正常显示时作为 fallback

## 经验教训

### 1. i18n 全覆盖原则

字符串类型都必须使用 i18n key，不得有任何例外：
- 按钮标签、Tooltip、aria-label、占位符
- 空状态/加载/错误提示
- 过滤器标签、卡片内容
- 相对时间、日期格式
- 条件渲染标签映射（如 sectionLabels 对象）

### 2. 语言切换时的状态稳定性

语言切换会触发 `appInfo` 更新 → 级联渲染。此过程中 Zustand store 的某些字段（如 `selectedGitHubTreePath`、`workspaces`）可能被临时清空或重置。

**对抗模式**：渲染条件优先使用最稳定的 store 字段（如 `activeCiWorkspaceId`、`activeCiFolderId`、`activeWorkspaceSection`），避免依赖可能暂时失效的派生数据。

### 3. 工具函数 locale 传递

工具函数（如日期格式化、相对时间格式化）中的展示文本必须支持 locale 感知。推荐方式：
- 函数签名增加 `locale: 'zh-CN' | 'en-US'` 参数
- 调用方从 `useTCopy()` 获取 `locale` 并传递

### 4. 过滤器组件 i18n

过滤器数组（WorkflowsView/JobsView 的 FILTERS）必须定义在函数体内（在 `useTCopy()` 之后），才能访问 `t` 对象。不能定义在模块作用域。

## 关联文件

- 翻译 key 真源：`frontend/src/app/i18n/zh-CN/ci.ts`、`frontend/src/app/i18n/en-US/ci.ts`
- 工程约束：`docs/development/project-engineering-constraints.md`
- 架构文档：`docs/architecture/cross-cutting/internationalization.md`
