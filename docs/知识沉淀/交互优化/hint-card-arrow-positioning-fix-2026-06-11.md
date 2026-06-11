# Hint Card 子卡片箭头定位修复

## 问题

GitHub 通信面板的「删除全部」主菜单中，每个功能选项右侧有一个"!"图标。鼠标悬停"!"时弹出子卡片（hint card），其左侧箭头（三角形）未能准确指向"!"图标位置，而是指向子卡片内部。

## 根因

### 1. CSS 三角形方向误判

`border-left` / `border-right` 在 0 宽元素上生成的三角形方向与直觉相反：

| CSS 属性 | 三角形指向 | 箭尖位置 |
|----------|-----------|---------|
| `border-left: Npx solid` | **指向右侧**（→） | 箭尖位于元素 `left` + N 处 |
| `border-right: Npx solid` | **指向左侧**（←） | 箭尖位于元素 `left` 处 |

**关键认知**：边框由内容盒外缘向**外**延伸。`border-left` 从内容左缘向左延伸 Npx，视觉三角形的尖点落在 **右侧**（远离内容盒的方向），而不是常见的直觉以为的指向左侧。

### 2. `position: fixed` 包含块行为变更（Chrome 130+）

Chrome 130+ 实现了 CSS Positioned Layout 规范变更：

- `position: fixed` 元素**不再**为 `position: absolute` 子元素（包括 `::before`/`::after` 伪元素）创建包含块
- 导致 `::before`/`::after` 的 `top: calc(50% - Npx)` 和 `left: 0` 不再相对于卡片父元素计算，而是相对于视口
- 箭头定位完全失效

只有添加 `transform`、`perspective`、`filter` 等属性才能重新激活包含块创建行为。

### 3. 早期尝试失败原因

| 尝试 | 失败原因 |
|------|---------|
| `translateY(-50%)` CSS 居中 | 含 `transform` 虽修复包含块，但用户浏览器可能缓存旧 CSS |
| JS 测量高度后居中 | 包含块问题未解决，`::before` 的 `top:50%` 仍相对视口 |
| `translateZ(0)` 防御 | 用户明确反对"防御性措施" |

## 解决方案

**彻底抛弃 `::before`/`::after` 伪元素方案，改用三个独立的 `position: fixed` 元素：**

```
三个独立 position:fixed 元素（互不依赖，无包含块问题）
┌─────────────────────────────────────────────┐
│ 箭头边框 (menuRight-5,     centerY-5)        │
│ 箭头填充 (menuRight-4,     centerY-4)        │
│ 内容卡片 (menuRight+1,     centerY, tY(-50%))│
│                                             │
│  ◄═══════════════════ 卡片内容文本           │
└─────────────────────────────────────────────┘
```

### 定位公式

| 元素 | `left` | `top` | 说明 |
|------|--------|-------|------|
| 卡片 | `menuRight + 1` | `centerY` + `tY(-50%)` | 垂直居中于按钮 |
| 箭头填充 | `menuRight - 4` | `centerY - 4` | `border-right:5px` 生成指向左侧的三角形，底部对齐卡片左缘 |
| 箭头边框 | `menuRight - 5` | `centerY - 5` | 外扩 1px 形成轮廓线 |

其中 `centerY = buttonRect.top + buttonRect.height / 2`。

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/styles/regions/rightpanel/file-operations.css` | 移除 `.adl-menu-hint-card` 系列类，新增 `.adl-sub-hint-card`/`__arrow`/`__arrow-border` |
| `frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx` | `MenuHintItem` 组件完全重写，使用独立 fixed 元素替代伪元素箭头 |

## 子序列修复

### 1. 内存泄漏：组件卸载时动态 DOM 元素残留

**问题**：`MenuHintItem` 在 `onMouseEnter` 中创建 `div` 元素 `appendChild` 到 `document.body`，但只在 `onMouseLeave` 时移除。若用户在悬停状态下跳转页面（组件卸载），这些元素永久残留。

**修复**：
- 使用 `useRef<HTMLDivElement[]>` 存储所有动态元素引用
- 添加 `useEffect` 清理函数，组件卸载时 `remove()` 所有元素
- `onMouseEnter` 先清空再 `push`，避免数组累积已清除的历史元素

### 2. 快速多次悬停引用丢失

**问题**：`subCardsRef.current = [card, arrow, arrowBorder]` 每次赋值替换数组，如果 `onMouseEnter` 在 `onMouseLeave` 之前再次触发，旧引用丢失无法清理。

**修复**：改为 `subCardsRef.current = []; subCardsRef.current.push(card, arrow, arrowBorder)`，既不累积历史元素，又不丢失未清理的引用。

### 3. "!" 悬浮按钮父级 hover 背景透入

**问题**：父级 `.adl-multitree-entry__menu-item:hover` 的 `background: var(--bg-hover)` 覆盖整个菜单项，包括右侧绝对定位的 `!` 区域。用户悬停菜单文字时 `!` 显示灰色背景，误以为 `!` 有独立功能。

**修复**：
- 给 `.adl-menu-item__hint` 添加 `background: var(--bg-card)` + `z-index: 1`，自身背景遮住父级 hover
- 保留 `.adl-menu-item__hint:hover` 背景（直接悬停 `!` 时仍有效）

**效果**：悬停菜单文本 → `!` 区域不受波及；直接悬停 `!` → 正常显示灰色背景 + 高亮文字。

## 经验教训

1. **CSS 三角形方向测试**：不要凭直觉判断 `border-left`/`border-right` 的指向，应通过浏览器 DevTools 实际验证
2. **`position: fixed` 包含块**：Chrome 130+ 后不再为 `position: absolute` 后代创建包含块，需用 `transform` 或改用独立元素
3. **伪元素定位不可靠**：`::before`/`::after` 在 `position: fixed` 父元素中的 `position: absolute` 行为受浏览器版本和 CSS 规范影响，跨浏览器不一致
4. **独立 `position: fixed` 元素最可靠**：每个元素独立定位，无包含块依赖，兼容性好
5. **动态 DOM 元素必须绑定组件生命周期**：手动 `appendChild` 到 `document.body` 的元素必须通过 `useEffect` 清理函数确保卸载时移除，不能仅依赖事件驱动移除
6. **`useRef` 作为元素引用容器优于 DOM 自定义属性**：组件级 `useRef<HTMLElement[]>` 不受 React 生命周期事件影响，可在任何时机安全清理，且不污染 DOM 节点
7. **父级 hover 背景穿透绝对定位子元素**：`position: absolute` 子元素背景透明时，父级 hover 背景会透入；需给子元素显式设置遮罩背景（如 `var(--bg-card)`）以隔离父级视觉影响
