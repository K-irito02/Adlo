# 右侧面板「终端」功能优化计划

## 概述

对右侧面板终端功能的三项 UI/UX 优化，涉及独立终端工作区常驻显示、空状态创建按钮样式、终端会话标签样式。

## 状态

已实现 — 第十五轮。详情见 AGENTS.md。

## 关键文件

- file-tree.css（终端树 CSS 规则）
- MultiWorkspaceTerminal.tsx（常驻独立工作区）
- WorkspaceTerminalEntry.tsx（图标/菜单条件渲染）
- TerminalTabBar.tsx（精简标签描述）
- TerminalPanel.tsx（expandAll/collapseAll 纳入独立工作区）
- rightpanel.css（添加 @import file-tree.css）
