# 搜索引擎设置弹层：Tooltip ref 覆盖导致亚像素模糊 + 右边缘裁剪

- 日期：2026-08-23
- 模块：浏览器面板 · SearchEnginePopover / Tooltip / computePopoverPosition
- 状态：已解决（用户桌面复验通过）

## 问题

1. 搜索引擎设置弹层**文字、分隔线、悬停背景全部模糊**，且右边缘被裁剪、被 webview2 覆盖遮挡。
2. 多轮 CSS 修复（border-bottom、outline、line-height 整数化）都只修好部分视图，"要么一个正常、其它异常"。

## 根因 1：Tooltip ref 覆盖 → 锚点 null → 亚像素渲染

- `TooltipTrigger`（`components/Tooltip.tsx`）在 `asChild=false` 分支里 `props.ref = triggerRef`，**覆盖了子元素按钮上用户设置的 `ref={searchEngineBtnRef}`**。
- 于是 `searchEngineBtnRef.current` 永远为 null → popover 拿不到锚点 → 走居中分支 `left:50%; top:50%; transform:translate(-50%,-50%)`。
- 弹层高度 349px（奇数），`-50%` 产生 `.5` 偏移，整个内容落在**半像素** → 全部模糊（含悬停背景、分隔线）。用户关键观察"悬停背景也模糊"正是定位问题的标志，而非 CSS 问题。

## 修复 1

- `TooltipTrigger` 不再覆盖子元素 ref：当 child 为原生元素时构造合并函数转发 child 自身 ref（兼容 object ref 与 callback ref），`triggerRef` 仍由包裹 `<span className="tooltip-trigger">` 持有。
- popover 定位补 `Math.round` 保险。

## 根因 2 + 修复 2：右边缘裁剪

- popover 恒 `left: anchorRect.left` 从锚点向右展开，按钮靠近窗口右边缘时超出视口被裁剪。
- 修复：新增纯函数 `computePopoverPosition`——`anchorLeft + popoverWidth > viewportWidth - margin` 时切右对齐（`right: viewportWidth - anchorRight`）；右对齐后左缘再溢出则回退 `left: margin` 并补 `maxWidth` 钳制。组件打开后测量实际宽度，首帧 `visibility:hidden` 定位、测量完成再显示，避免闪跳。

## 根因 3：webview2 覆盖菜单卡片

- Tauri webview2 是原生图层盖在 DOM 之上，`OVERLAY_SELECTOR` 未含 `.adl-search-engine-popover` 时打开菜单不隐藏 webview。
- 修复：把 `.adl-search-engine-popover` 加入 `useWebViewVisibility` 的 `OVERLAY_SELECTOR`。

## 关键教训

1. **亚像素模糊优先怀疑定位而非样式**：分隔线/背景/文字一起模糊，常是容器坐标系 `.5` 偏移，检查锚点是否丢失、是否有 `translate(-50%,-50%)` 路径。
2. **Tooltip/复合触发组件可能覆盖子元素 ref**：排查"弹层/浮层实际拿到锚点"时，先确认 ref 是否被包装组件覆盖。
3. **防裁剪写成纯函数 + 单测**：`computePopoverPosition` 独立为纯函数，5+ 边界用例（左对齐/右对齐/边缘锚点/自定义边距/top 取整/左缘回退/负锚点/超右缘）单测覆盖，比组件内联可靠。
4. **清理排查期诊断日志**：favicon 预加载、工具栏、地址栏等 `[ADL-*]` 日志是排查期临时加的，Phase 4 应全清（避免每次测试刷屏 + 敏感信息泄漏）。

## 相关
- `frontend/src/app/components/Tooltip.tsx`
- `frontend/src/app/features/browser/SearchEnginePopover.tsx`
- `frontend/src/app/features/browser/searchEnginePopoverPosition.ts`
- `frontend/src/app/features/browser/useWebViewVisibility.ts`