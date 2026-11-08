# React 掌管的 className 与命令式 classList 的冲突（2026-11-08）

## 症状

右侧面板「扩大」到 `overlay_full` 后，点击导航栏的「折叠/展开第一行工具栏」按钮，面板向右缩回普通宽度、中间区露出；store 里的 `rightPanelMode` 仍是 `overlay_full`。

## 根因

`useRightPanelLayout` 的 `syncOverlayClasses()` 用命令式 `classList.toggle` 给 `<aside class="adl-rightpanel">` 加 `adl-rightpanel--overlay-active` / `--overlay-expanded`。

工具栏折叠让 `RightPanel` 因新状态 `rightPanelToolbarCollapsed` 重渲染；React 用 `rightPanelRootClassName()` 生成的新 `className` **整体覆盖**了命令式加的类。`syncOverlayClasses` 的 effect 依赖是 `rightPanelMode` / `collapsed`，两者都没变，不会重跑补回；CSS 失去 `--overlay-expanded` 后宽度退回普通值。

## 规则

- React 渲染的元素，其 `className` 必须由 React **完整**声明；任何会被无关状态重渲染抹掉的类，都要纳入 `className` 的计算（纯函数 + 真值表测试）。
- 命令式 `classList` 只用于 React 不拥有的元素（`document.body`、`documentElement`、原生子窗口代理），或为「状态提交前的同一帧」做补帧；不能作为持久来源。
- 判断标准：这个类会不会在下一次 React 重渲染后仍需存在？会 → 放进 `className`。

## 回归测试

`rightPanelLayout.test.ts` 的 `rightPanelRootClassName` 真值表包含 `toolbar-collapsed + overlay_full` 组合，断言两个 overlay 类同时保留；删除修复后该用例变红。

## 相关文件

- `frontend/src/app/regions/right-panel/rightPanelLayout.ts`（`rightPanelRootClassName` / `deriveRightPanelOverlayState`）
- `frontend/src/app/regions/RightPanel.tsx`（根节点 className）
- `frontend/src/app/regions/right-panel/hooks/useRightPanelLayout.ts`（`syncOverlayClasses`）
