# Tooltip 组件优化计划

## 摘要

对项目中自定义的 Tooltip 组件系统进行全面优化：视觉风格、动画、CSS 架构。涉及核心组件 `Tooltip.tsx`、`useTooltip.ts`、`tooltipPosition.ts`、`components.css`，以及新增语义 token。

---

## 当前状态分析

### 架构全览

```
Tooltip.tsx (372 行)         → React 组件：Tooltip / TooltipTrigger / TooltipContent / TooltipSimple
useTooltip.ts (320 行)       → Hook：状态管理、显示/隐藏延迟、自动定位
tooltipPosition.ts (266 行)  → 位置计算：翻转检测、箭头定位、viewport clamp
components.css (L583-724)    → 样式：反色背景、scale+fade 动画、CSS 箭头
tokens.css (L150-161)        → z-index 层级：--z-tooltip: 90
themes.css                   → 颜色 token：--text-primary / --bg（被 tooltip 借用做反色）
FoldTooltipOverlay.tsx       → 独立 tooltip（折叠 gutter 专用，使用相同 .tooltip CSS）
```

### 已确认的三项决策

| 决策 | 选择 |
|------|------|
| 视觉风格 | **纯文本简约风格** — 半透明底、轻阴影、中性低调（类似 macOS/Windows 11 原生 tooltip） |
| 动画 | **简化动画** — 仅 opacity fade（0↔1），去掉 scale，避免与 arrow transform 冲突 |
| 样式架构 | **全面重构** — 新增 `--tooltip-bg` / `--tooltip-fg` / `--tooltip-shadow` 语义 token |

### 发现的额外问题

1. `.tooltip__close` 按钮使用 emoji `✕` — 违反"禁用 emoji"规则
2. `.tooltip` 用 `var(--text-primary)` 做背景色、`var(--bg)` 做文字色 — 非语义用法
3. `useTooltip.test.ts` 仅有占位测试，无实质内容
4. 箭头 CSS `rotate: 45deg` 与动画的 `transform: scale(...)` 在 CSS 同一层冲突
5. 组件 `cloneElementWithRef` 实现过于复杂（12+ 个 props 手动透传）

---

## 设计方案

### A. 语义 Token 系统（新增到 tokens.css）

```css
:root {
  --tooltip-bg: rgba(48, 48, 48, 0.92);
  --tooltip-fg: var(--white, #fff);
  --tooltip-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
  --tooltip-radius: var(--radius-md, 6px);
}
[data-theme="dark"] {
  --tooltip-bg: rgba(212, 212, 212, 0.92);
  --tooltip-fg: var(--black, #111);
  --tooltip-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
}
```

### B. 三套视觉方案

以下三套方案使用相同的 "无 border、纯 opacity fade 动画、语义 token" 基底，仅在 **颜色、不透明度、边框/高斯模糊** 上产生差异。

| 维度 | 方案 A：macOS 毛玻璃 | 方案 B：Windows 11 暖灰 | 方案 C：Chrome DevTools 风格 |
|------|---------------------|----------------------|---------------------------|
| 背景 Light | `rgba(50,50,50,0.88)` + `backdrop-filter: blur(16px)` | `rgba(32,32,32,0.92)` | `rgba(0,0,0,0.86)` |
| 背景 Dark | `rgba(228,228,228,0.88)` + `backdrop-filter: blur(16px)` | `rgba(232,232,232,0.92)` | `rgba(255,255,255,0.86)` |
| 阴影 | 软扩散 `0 6px 20px rgba(0,0,0,0.16)` | 紧实 `0 4px 10px rgba(0,0,0,0.22)` | 标准 `0 4px 12px rgba(0,0,0,0.28)` |
| 圆角 | `8px` | `4px` | `6px` |
| 箭头 | clip-path 菱形 | clip-path 菱形 | clip-path 菱形 |
| 暖光/冷光 | 中性偏冷 | 中性偏暖 | 纯中性 |
| 特点 | 毛玻璃半透效果，层次感强 | 高对比度，文字清晰利落 | 稳定可靠、高通用性 |

### C. Arrow 实现变更（关键修复）

**当前问题**：`.tooltip__arrow` 使用 `rotate: 45deg` + `z-index: -1` 实现箭头，与动画的 `transform: scale()` 在同一 CSS 层冲突。

**修复方案**：改用 `clip-path` 生成箭头形状，将 `rotate` 替换为纯几何裁剪：

```css
/* 当前（冲突） */
.tooltip__arrow {
  position: absolute;
  width: 8px;
  height: 8px;
  background: inherit;
  rotate: 45deg;
  z-index: -1;
}

/* 新方案（无 transform 冲突） */
/* 将 arrow 改为一个单独的元素（±通过 arrow 容器包裹 + clip-path），
   确保动画的 transform 作用在 .tooltip 容器上，arrow 不受影响 */
```

具体实现：将 arrow 放在 `.tooltip` 容器的 `::before` 伪元素中绘制（不占用 `.tooltip__arrow`），这样：
- `.tooltip` 的 `transform: scale()` 动画 → 作用在容器上
- arrow 通过独立伪元素绘制 → 不参与容器 transform → 无冲突
- 箭头位置通过 `clip-path` + 绝对定位实现

### D. 动画变更

```css
/* 当前 */
@keyframes tooltip-in {
  from { opacity: 0; transform: scale(0.96) translateY(2px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* 新 */
@keyframes tooltip-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes tooltip-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

.tooltip[data-state="open"] {
  transition: opacity var(--duration-150) var(--ease-enter);
}
.tooltip[data-state="closed"] {
  transition: opacity var(--duration-100) var(--ease-exit);
}
```

使用 CSS `transition` 替代 `animation`，简化控制、便于调试。

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **修改** | `tokens.css` | 新增 `--tooltip-bg` / `--tooltip-fg` / `--tooltip-shadow` / `--tooltip-radius` 四个语义 token，含 light/dark 两套值 |
| **修改** | `components.css` | 重写 `.tooltip`、`.tooltip__arrow`、`.tooltip__close`、动画。arrow 改为基于 `clip-path` + `::before` 伪元素实现。动画改为纯 opacity transition。背景/文字/阴影使用新语义 token。关闭按钮用 SVG 替代 emoji |
| **修改** | `tokens.css` | 如有必要调整 `--z-tooltip` 或 `--duration-*` 动画时长 |
| **修改** | `FoldTooltipOverlay.tsx` | `data-side` 属性从 `"right"\|"left"` 扩展为完整 `Placement` 类型（`"top"\|"bottom"\|"left"\|"right"`），确保 .tooltip 箭头样式适配。如果 arrow 实现改为伪元素，移除 `<span className="tooltip__arrow" />` |
| **修改** | `Tooltip.tsx` | 移除 `TooltipContentInner` 中的 `transform: scale` 相关逻辑（已由 CSS 处理）。关闭按钮由 `✕` 改为内联 SVG |
| **不修改** | `useTooltip.ts` | 功能正常，Hook 逻辑不变 |
| **不修改** | `tooltipPosition.ts` | 位置计算逻辑不变 |
| **不修改** | 15 个消费者组件 | `TooltipSimple` API 不变，消费者无感知 |

---

## 设计提案的浏览器预览

计划批准后，我将创建一份独立的 HTML 演示页面，用实时的 DOM 渲染三套方案（macOS / Windows 11 / Chrome 风格），方便您在浏览器中直观对比：

```
http://localhost:5175/preview/tooltip-proposals.html
```

每套方案展示：
- Light / Dark mode 效果
- 4 个方向（top / bottom / left / right）
- 箭头对齐
- 带文字的 content

---

## 验证步骤

1. `npm --prefix frontend run typecheck` — 类型检查通过
2. `npm --prefix frontend test` — 所有测试通过
3. 启动 `npm run dev:browser`
4. 逐项检查 15 个使用 `TooltipSimple` 的组件，确保所有 tooltip 正常显示
5. 切换 light/dark 主题，确认 tooltip 颜色正确跟随
6. 验证 4 个方向（top/bottom/left/right）的箭头对齐
7. 验证 `prefers-reduced-motion` 下动画关闭
8. Tauri 桌面模式同样检查

---

## 假设与决策

1. **Arrow 采用伪元素实现**：通过 `.tooltip::before` 绘制箭头，不依赖子元素 `.tooltip__arrow`，彻底隔离动画 transform 冲突
2. **保留 FoldTooltipOverlay 的独立实现**：折叠 gutter tooltip 使用独立定位逻辑，不与通用 Tooltip 系统耦合
3. **useTooltip.ts / tooltipPosition.ts 不变**：核心逻辑和位置算法功能完善，无需修改
4. **消费者 API 不变**：`TooltipSimple` props 签名不变，所有现有消费者组件无需修改
5. **不新增测试**（占位符测试除外）：当前项目测试覆盖度以集成/功能测试为主，Tooltip 的样式变更更适合手动视觉验证
