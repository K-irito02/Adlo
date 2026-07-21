# 拖拽浮层 pointer-events: none 穿透问题

## 问题描述

拖拽工作区标签时，`DragOverlayPortal` 浮层使用 `pointerEvents: 'none'`（为了让鼠标事件穿透到 document 监听器），但导致 tooltip（原生 `title` 和自定义 `TooltipSimple`）和 CSS `:hover` 效果在底层元素上被触发。

## 根因

- `pointer-events: none` 使浏览器将光标视为直接与底层 DOM 元素交互
- 拖拽系统的文档级 `mousemove`/`pointerup` 监听器只依赖 `e.clientX/Y`，不依赖 `e.target`

## 修复方案

在 `DragOverlayPortal` 中添加全屏透明阻挡 `<div>`：

- z-index 9998（介于内容层最高 `--z-tooltip: 90` 与浮层 `9999` 之间）
- `cursor: 'grabbing'` 保持拖拽光标
- `aria-hidden="true"` + `background: transparent` 确保无障碍和视觉透明

### 原理

阻挡层捕获所有指针事件 → 阻止底层元素触发 hover/tooltip → 事件冒泡到 document → 拖拽系统正常工作（仅用 `clientX/Y`）。

## 补充优化

拖拽时预放置位置的 workspace 行使用 `.adl-dragging > .adl-workspace-row { opacity: 0.4 }` 显示为半透明 ghost。使用 `>` 子代选择器确保仅影响列表项内的行，不影响浮层（`.adl-sortable-item.adl-dragging` 无 `.adl-workspace-row` 子元素）。

## 文件变更

| 文件 | 变更 |
|------|------|
| `DragOverlayPortal.tsx` | 新增 `adl-drag-blocker` 阻挡 div（`position:fixed; inset:0; zIndex:9998`） |
| `drag.css` | `outline` → `box-shadow`（支持 border-radius）；ghost 规则 + transition |
| `useDragDropWorkspace.ts` | 修复 `items[i]` → `item` 循环变量 bug |
| `workspace-browser/index.ts` | 修复文件名大小写匹配 |
