# 修复右键上下文菜单位置问题

## 问题描述

在"变更"面板的文件树中，右击文件时弹出的上下文菜单位置不正确。用户期望菜单左上角出现在鼠标右击位置，且菜单不受任何区域约束，可以显示在任何区域之上。

## 根因分析

当前实现存在三个问题：

1. **定位基准错误**：菜单使用 `position: absolute` 相对于 `.adl-filetree-shell` 容器定位，坐标通过 `event.clientX - rootRect.left + scrollLeft` 换算为容器内偏移，换算过程可能因滚动、容器变换等产生偏差。
2. **边界钳制**：`useLayoutEffect` 将菜单坐标钳制在 `rootRef` 容器可视区域内（`maxX/maxY`），导致菜单无法溢出容器。
3. **额外偏移**：`handleShowContextMenu` 中对坐标额外加了 `+10` 偏移，使菜单不在精确的鼠标位置。

## 修改方案

### 1. 修改 `fileTree.tsx`

**文件**：[fileTree.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/fileTree.tsx)

- **导入 `createPortal`**：从 `react-dom` 引入，用于将菜单渲染到 `document.body`，避免被任何父级 `overflow` 裁切。
- **修改 `handleShowContextMenu`**：
  - 直接使用 `event.clientX` 和 `event.clientY` 作为菜单位置（视口坐标）。
  - 移除 `+10` 偏移量。
  - 移除相对于 `rootRef` 的坐标换算逻辑。
- **移除 `useLayoutEffect` 边界钳制**：删除第 173-194 行的整个 `useLayoutEffect`，因为菜单不再受容器约束。
- **使用 Portal 渲染菜单**：将菜单 DOM 通过 `createPortal` 渲染到 `document.body`。

### 2. 修改 `regions.css`

**文件**：[regions.css](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/regions.css)

- **`.adl-sidebar-menu`**：将 `position: absolute` 改为 `position: fixed`，使菜单基于视口定位。

## 具体变更步骤

### Step 1: 修改 fileTree.tsx — 导入 createPortal

```diff
- import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
+ import React, { useEffect, useRef, useState } from "react";
+ import { createPortal } from "react-dom";
```

移除未使用的 `useLayoutEffect` 导入。

### Step 2: 修改 fileTree.tsx — 移除边界钳制 useLayoutEffect

删除第 173-194 行的整个 `useLayoutEffect` 块（边界钳制逻辑）。

### Step 3: 修改 fileTree.tsx — 简化 handleShowContextMenu 定位逻辑

```diff
  const handleShowContextMenu = props.getContextMenuItems
    ? (event: React.MouseEvent<HTMLButtonElement>, node: T) => {
        const items = props.getContextMenuItems?.(node) ?? [];
        if (!items.length) {
          return;
        }
        event.preventDefault();
-       const rootRect = rootRef.current?.getBoundingClientRect();
-       const offsetX = rootRect ? event.clientX - rootRect.left + rootRef.current!.scrollLeft : event.clientX;
-       const offsetY = rootRect ? event.clientY - rootRect.top + rootRef.current!.scrollTop : event.clientY;
        setContextMenuState({
-         x: offsetX + 10,
-         y: offsetY + 10,
+         x: event.clientX,
+         y: event.clientY,
          node,
          items
        });
      }
    : undefined;
```

### Step 4: 修改 fileTree.tsx — 使用 Portal 渲染菜单

```diff
      {contextMenuState
        ? createPortal(
-           <div
-             ref={contextMenuRef}
-             className="adl-sidebar-menu"
-             role="menu"
-             style={{ left: contextMenuState.x, top: contextMenuState.y }}
-           >
-             {contextMenuState.items.map((item) => (
-               <button
-                 key={item.id}
-                 type="button"
-                 role="menuitem"
-                 className="adl-sidebar-menu__item"
-                 disabled={item.disabled}
-                 onClick={() => {
-                   if (item.disabled) {
-                     return;
-                   }
-                   item.action(contextMenuState.node);
-                   setContextMenuState(null);
-                 }}
-               >
-                 <span>{item.label}</span>
-               </button>
-             ))}
-           </div>
+           <div
+             ref={contextMenuRef}
+             className="adl-sidebar-menu"
+             role="menu"
+             style={{ left: contextMenuState.x, top: contextMenuState.y }}
+           >
+             {contextMenuState.items.map((item) => (
+               <button
+                 key={item.id}
+                 type="button"
+                 role="menuitem"
+                 className="adl-sidebar-menu__item"
+                 disabled={item.disabled}
+                 onClick={() => {
+                   if (item.disabled) {
+                     return;
+                   }
+                   item.action(contextMenuState.node);
+                   setContextMenuState(null);
+                 }}
+               >
+                 <span>{item.label}</span>
+               </button>
+             ))}
+           </div>,
+           document.body
          )
        : null}
```

### Step 5: 修改 regions.css — 改为 fixed 定位

```diff
  .adl-sidebar-menu {
-   position: absolute;
+   position: fixed;
    min-width: 132px;
    ...
  }
```

## 影响评估

- **功能影响**：仅影响右键上下文菜单的定位方式，不改变菜单项内容、交互逻辑或关闭行为。
- **回归风险**：低。菜单的显示/隐藏、Escape 关闭、点击外部关闭逻辑不变。Portal 渲染到 body 后，`mousedown` 事件监听仍然绑定在 `window` 上，关闭行为不受影响。
- **样式影响**：`position: fixed` 配合 `z-index: calc(var(--z-popover) + 10)` 确保菜单始终显示在最上层。
