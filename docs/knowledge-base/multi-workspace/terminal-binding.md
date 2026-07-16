# 终端工作区绑定功能改进 — 经验教训

> 来源: `2026-05-27-terminal-workspace-binding-improvements.md`
> 问题: 终端创建时 PTY 未初始化、缺失工作区绑定选择、子菜单交互不佳

## 教训

### 1. 子菜单位置计算
使用 `getBoundingClientRect()` 获取元素位置比纯 CSS 定位更准确，尤其在复杂布局中。

### 2. 延迟关闭机制
使用 `setTimeout` + `clearTimeout` 实现自然的菜单交互体验，鼠标穿越父菜单与子菜单间隙时不会意外关闭。

### 3. Portal 渲染
子菜单通过 portal 渲染到 `body` 可以避免父容器样式限制（如 `overflow: hidden`），确保正确显示。

### 4. 状态管理
使用 Zustand 存储绑定的工作区 ID 和工作区默认终端类型，确保状态在组件间共享与实时响应。

### 5. 参数传递验证
调用函数时务必确认传递的是正确计算后的值，而非原始参数。本次修复中 `handleCreateTab` 传递 `finalProfile` 而非原始 `profile` 参数。
