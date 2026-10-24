# 最近工作区：两处统一滚动显示 — 设计文档

日期：2026-08-07
状态：已确认设计，待实现

## 背景与目标

中心欢迎区（`center-pane/WelcomeState.tsx`）与状态栏工作区菜单（`StatusBar.tsx`）各有一份「最近工作区」列表。当前问题：

- 两处分别截断：WelcomeState `.slice(0, 5)`，StatusBar `.slice(0, 6)`，超出的工作区无法看到。
- 两处显示口径/交互不一致：WelcomeState 为图标+名称+路径三列；StatusBar 为名称+路径两列，且 StatusBar 已有 `max-height:180px` 原生滚动条常驻。

目标：

1. **数据统一**：两处显示同一份「未从侧栏移除」的全量工作区列表，无数量限制（不引入 slice 截断）。
2. **可见区域**：两处可见区域最多显示 3 个工作区，超出部分通过垂直滚动查看。
3. **滚动条显隐**：鼠标悬停于区域时显示垂直滚动条，移出区域即隐藏；滚动条滑块可拖拽。

行样式各自保留（WelcomeState 图标+名称+路径；StatusBar 名称+路径），仅数据、可见区域与滚动条交互统一。

## 范围界定

- 数据源沿用 store `recentWorkspaces`（后端 `workspace_list_recent` 已过滤 `removedFromSidebar`，置顶在前 + 最近打开排序），数据层不做改动。
- 只改前端展示与交互，不涉及 Rust/桥接层。
- 仅处理上述两个展示位；左侧工作区树等其余位置不受影响。
- 旧版 `app/components/WelcomeState.tsx`（未被使用）不在本次改动范围。

## 设计

### 1. 数据与可见区域

- 两处渲染 `recentWorkspaces` 全量，删除 `.slice()`。
- 列表容器 `max-height = 恰好 3 行`，`overflow-y: auto`。
- 行高以共享 CSS 变量 `--adl-recent-row-height` 统一口径；每处 `max-height: calc(3 * var(--adl-recent-row-height) + 行间距)`，具体像素在实现时用测试校准（保证第 3 项完整可见、第 4 项溢出）。
- ≤3 项时无溢出 → 无滚动条、不可滚动。

### 2. 共享滚动条机制

#### 共享 hook — `frontend/src/app/hooks/useRevealScrollbar.ts`

返回控制器 `RevealScrollbarController`：

| 字段 | 说明 |
|------|------|
| `scrollRef` | 绑定到滚动容器 |
| `visible` | `hovered && scrollable`，控制滚动条显隐 |
| `scrollable` | `scrollHeight > clientHeight + 1`，内容是否溢出 |
| `thumbStyle` | `{ height, transform }`，滑块高度与位移 |
| `thumbListeners` | `onPointerDown` 拖拽起始，捕获指针 |

内部逻辑：

- `mouseenter` → `hovered=true`；`mouseleave` → `hovered=false`。
- 容器 `scroll` 事件 → 更新 `progress` / `thumbRatio`。
- 几何重算时机：挂载时、`ResizeObserver`、消费者传入的 `deps`（如 `recentWorkspaces.length`）变化时。
- 拖拽换算：`滑块top = scrollTop / (scrollHeight - clientHeight) × (轨道高 - 滑块高)`；`新scrollTop = 起始scrollTop + 指针位移 / (轨道高 - 滑块高) × (scrollHeight - clientHeight)`，钳制于 `[0, max]`。`pointerup` / `pointercancel` 释放。

#### 共享展示组件 — `frontend/src/app/components/RevealScrollbar.tsx`

纯渲染：`<div class="adl-reveal-scrollbar" data-visible={visible}>` 内套 `<div class="adl-reveal-scrollbar__thumb" style={thumbStyle} {...thumbListeners}>`，`aria-hidden`。两处复用同一 DOM 结构。

#### CSS — 新增 `frontend/src/styles/components/reveal-scrollbar.css`（按项目机制挂入 index）

- 容器类 `.adl-reveal-scroll`：`position: relative; overflow-y: auto;` 并隐藏原生滚动条（`scrollbar-width: none` + `::-webkit-scrollbar { display: none; }`）。
- 轨道：绝对定位贴右缘，宽约 8px，默认 `opacity: 0`；`data-visible=true` 时 `opacity: 1`，150ms 过渡；隐藏态 `pointer-events: none`（不挡行点击）。
- 滑块：宽约 4px、圆角、`background: var(--text-muted)`、`cursor: pointer`、`touch-action: none`（支持触控拖拽）；可见态才接收指针事件。
- 双端一致：WebView2 与浏览器同为 Chromium，覆盖条为纯 div，无原生滚动条差异。

### 3. 两处接入

#### WelcomeState（`center-pane/WelcomeState.tsx`）

- 删除 `.slice(0, 5)`，渲染全量。
- `<ul>` 内不能直接放 `<div>`（无效 HTML），改为外层包裹：
  - 滚动容器 `<div class="adl-welcome__recent-scroll adl-reveal-scroll" ref={scrollRef}>`
    - 内层 `<ul class="adl-welcome__recent-list">…</ul>`（行样式不变）
    - 末尾 `<RevealScrollbar controller={…} />`
- 原有行样式（图标+名称+路径、hover/focus）保持不变；`max-height: 3 行` 移至外层容器。

#### StatusBar（`StatusBar.tsx`）

- 删除 `.slice(0, 6)`，渲染全量。
- 列表容器 `<div class="adl-statusbar__menu-list">` 加 `ref={scrollRef}` 与 `adl-reveal-scroll` 类，末尾追加 `<RevealScrollbar controller={…} />`。
- 移除现有 `max-height: 180px`，改为 `calc(3 * var(--adl-recent-row-height) + 间距)`。
- 行样式（名称+路径、hover/active）不变。

#### 每处 max-height（像素实现时校准）

- WelcomeState：`calc(3 * var(--adl-recent-row-height) + 2 * var(--space-1))`
- StatusBar：`calc(3 * var(--adl-recent-row-height) + 2 * 4px)`

### 4. 边界与错误处理

- ≤3 项：无溢出 → 不渲染滚动条、不可滚动。
- 恰好 3 项：`max-height` 精确等于 3 行，第 3 项完整可见且无滚动条。
- 键盘滚动/焦点：容器仍走原生 `overflow-y: auto`，Tab/方向键聚焦滚动不受影响。
- 触控/触摸板：滑块 `touch-action: none` 支持触摸拖拽；触摸板滚轮走原生滚动事件，进度实时更新。
- 隐藏时不挡点击：`pointer-events: none` 仅用于隐藏态；可见态仅 4px 滑块区域可交互。
- 尺寸/内容变化：`ResizeObserver` + `deps`（列表长度）重算。
- 主题一致性：滑块使用设计 token `var(--text-muted)`，亮暗主题自适应。

### 5. 测试策略（红绿 TDD）

#### Hook 单测 — `useRevealScrollbar.test.ts`

- 内容未溢出时 `scrollable=false`，悬停不显示。
- `mouseenter` → `visible=true`（可滚动时）；`mouseleave` → 隐藏。
- 滚动更新滑块高度/位移（progress、thumbRatio 正确）。
- 拖拽：`pointerdown → pointermove → pointerup` 更新容器 `scrollTop`，并钳制在 `[0, max]`；`pointercancel` 释放。
- `deps` 变化（列表增长）后重新测量，未溢出→溢出时 `scrollable` 翻转。
- 布局读取（`scrollHeight/clientHeight`）在 jsdom 下返回 0 → 测试中 mock 元素几何属性。

#### 组件测试

- `RevealScrollbar.test.tsx`：渲染滑块样式正确；`visible=false` 时不显示/隐藏类。
- `WelcomeState` / `StatusBar`（新增或扩展现有测试）：渲染全量工作区（无 slice 截断）；超过 3 项时容器出现 `adl-reveal-scroll` 与滚动条 overlay；≤3 项时无滚动条；行样式 class 保留。

### 6. 质量门禁

- `pnpm --dir frontend run lint`
- `pnpm --dir frontend run test`（含新增测试）
- `tsc --noEmit`

## 涉及文件

新增：

- `frontend/src/app/hooks/useRevealScrollbar.ts`
- `frontend/src/app/components/RevealScrollbar.tsx`
- `frontend/src/styles/components/reveal-scrollbar.css`
- 对应测试文件（`useRevealScrollbar.test.ts`、`RevealScrollbar.test.tsx`）

修改：

- `frontend/src/app/regions/center-pane/WelcomeState.tsx`
- `frontend/src/app/regions/StatusBar.tsx`
- `frontend/src/styles/regions/center.css`
- `frontend/src/styles/regions/statusbar-menu.css`

## 非目标（YAGNI）

- 不做滚动强化（仅悬停显示/移出隐藏）。
- 不引入第三方滚动条库。
- 不统一两处行样式。
- 不改数据层/桥接层。
