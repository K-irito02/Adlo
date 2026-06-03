# 多工作区文件选择问题修复 — 经验教训

> 来源: `2026-05-24-multi-workspace-file-selection-fix.md`
> 问题: 非当前工作区文件点击报错 + 相同文件名跨工作区同时高亮

## 教训

### 1. 多工作区上下文的重要性
在多工作区场景下，任何资源的标识都应包含工作区信息。不能只依赖相对路径唯一标识资源——这是一个经典的"namespace"问题。

### 2. 向后兼容设计
保留原有 `openFile`/`openChangePreview` 方法（用于当前工作区），新增 `openFileForWorkspace`/`openChangePreviewForWorkspace`（用于其他工作区），最小化破坏性变更。

### 3. 组件设计原则
- 组件应尽量简单，接收明确的 props
- 子组件不需要知道全局状态，只需要知道"当前资源是否选中"
- 父组件负责判断并传递 `effectiveSelectedPath`

### 4. 测试的价值
重构后 183 个测试全部通过，确保没有引入新问题，为继续推进更多改进提供了信心。

### 5. 终端面板天然免疫
终端面板不需要类似修复：每个 `TerminalTabState` 自带 `workspaceId`，`tabsByWorkspace` 自动按工作区分组，标签 ID 全局唯一，不存在路径冲突。
