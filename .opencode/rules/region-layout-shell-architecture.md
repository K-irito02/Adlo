---
description: Region 布局壳架构 — shell 布局与领域功能分离
globs: adlo/frontend/src/app/regions/**
alwaysApply: false
---

# Region 布局壳架构

应用 shell 布局按区域（Region）组织，每个区域对应一个顶级布局容器，集中在 `regions/` 目录下。

## Region 目录结构

```
regions/
├── LeftSidebar.tsx               # 主导航侧边栏入口
├── left-sidebar/                 # 左侧边栏子组件/hooks
│   ├── ConversationPanel.tsx
│   ├── SessionList.tsx
│   ├── WorkspaceList.tsx
│   ├── ResizeHandle.tsx
│   └── useSessionDragDrop.ts
├── RightPanel.tsx                # 右侧面板入口
├── right-panel/                  # 右侧面板子组件/hooks
│   ├── ToolSwitcher.tsx
│   ├── types.ts
│   ├── hooks/
│   └── panels/
├── CenterPane.tsx                # 中央内容区
├── center-pane/
├── StatusBar.tsx                 # 状态栏
├── TitleBar.tsx                  # 标题栏
└── WindowControls.tsx
```

## 规则

- 每个 Region 一个顶级 `.tsx` 文件 + 一个同名子目录放拆分后的组件/hooks
- Region 组件负责该区域的结构编排，不包含领域业务逻辑
- 领域功能模块（如 browser、terminal）放在 `features/` 目录，通过 Region 的 lazy import 挂载
- 复杂 Region（LeftSidebar、RightPanel）使用独立 hooks 从 Store 选择所需状态
