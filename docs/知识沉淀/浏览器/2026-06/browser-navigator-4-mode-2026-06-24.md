# 浏览器导航栏4模式重构 — 2026-06-24

## 变更概述

将旧的二级切换（`browserViewMode` + `browserShowTabButtons`）重构为 4 模式扁平按钮设计：

| 模式 | 用途 | 关闭按钮 |
|------|------|----------|
| 已打开的标签 | 显示已打开标签列表 | ✅ |
| 标签目录 | 浏览书签/目录树 | ❌ |
| 文件列表 | 展平文件列表 | ❌ |
| 搜索标签 | 搜索标签/书签 | ❌ |

## 核心变化

### Store 简化
- **删除** `browserViewMode` 和 `browserShowTabButtons` 两个持久化状态
- 视图模式由 `navigatorMode` 单一状态派生
- `computeNavigatorCount` 重写以匹配新模式

### Flash 消除
- 工具按钮使用 `<span style={{ display: 'none' }}>` 包装取代条件渲染
- 避免组件卸载/重装导致的布局闪动

### 搜索外部点击关闭修复
- 原生 `mousedown` 处理器跳过 `.adl-browser-navigator-btn` 按钮
- 防止模式按钮点击被搜索 dismiss 拦截

### Flat 模式标签溢出修复（关键 Bug）

**问题：** 在"已打开的标签"模式下，悬停时标签文字超出关闭按钮区域 4px。

**根因：** `<button>` 元素做 flex 子项时忽略 `min-width: 0`（已知 flexbox 渲染行为）。Flat 模式没有树模式的计数元素（`.adl-tree-node__count`, `min-width: 18px`）占据右侧空间，导致 label 溢出到右 padding 区域。

**解法：** `::after` 伪元素渐变蒙版

```css
.adl-browser-entry__tree--flat .adl-filetree__row::after {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: 40px;
  background: linear-gradient(
    to right,
    transparent 0%,
    var(--bg-occlusion) 40%,
    var(--bg-occlusion) 100%
  );
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-150) var(--ease-default);
  z-index: 1;
}
.adl-browser-entry__tree--flat .adl-filetree__row:hover::after {
  opacity: 1;
}
```

- `z-index: 1` → 在 meta (z-index: 2)之下，不遮挡关闭按钮
- `pointer-events: none` → 不干扰鼠标事件
- `var(--bg-occlusion)` → 与 meta 的遮罩颜色一致
- 仅在 `:hover` 时显示，避免常驻视觉污染

**额外修复：**
- 行容器加 `position: relative`（解决 meta `position: absolute` 的包含块不一致）
- `text-overflow: ellipsis` → `text-overflow: clip`（无省略号截断）

## 关键决策

1. **4 按钮代替二级切换**：`navigatorMode: 'open' | 'tabs' | 'list' | 'search'` 直接驱动视图
2. **按钮闪动 → `display: none` 包装**：不卸载 DOM，纯 CSS 显隐
3. **渐变蒙版替代 padding/margin 调整**：不破坏共享 CSS 布局
4. **仅 hover 显示蒙版**：常驻不可见，避免视觉噪音
5. **Close 按钮只存在于 'open' 模式**：通过 `onCloseTab` 回调可选传递实现

## 涉及文件

- `browserSlice.ts` — 删除 viewMode/showTabButtons，简化 store
- `browserSelectors.ts` — 对应选择器清理
- `BrowserNavigator.tsx` — 4 模式按钮组 + OpenTabFlatList 内联
- `BrowserPanelContent.tsx` — 视图派生逻辑简化
- `BrowserPanel.tsx` — mousedown 搜索误关修复
- `BrowserTreeEntryFlatList.tsx` — close 按钮条件渲染
- `BrowserCategorySection.tsx` — `onCloseTab` 可选化
- `browser-webview.css` — flat row `position: relative` + `::after` 蒙版 + `text-overflow: clip`
- `useBrowserUrlChange.ts` — auto-sync 修复 + 调试日志

## 教训

1. **`<button>` flex 子项 `min-width: 0` 失效**：Chromium 内部 shadow DOM 行为，不能依赖 `min-width: 0` 约束按钮宽度
2. **`::after` 蒙版比调整 padding/margin 更安全**：不影响包裹容器的宽高，不干扰 flex 计算
3. **`z-index` 分层**：蒙版（z:1）< meta（z:2），确保关闭按钮始终可点击
4. **`text-overflow: clip` + 蒙版**：clip 保证无省略号，蒙版保证 hover 时文字不露出遮罩区域
