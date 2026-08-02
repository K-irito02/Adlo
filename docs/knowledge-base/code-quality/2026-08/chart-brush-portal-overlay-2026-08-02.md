# ChartBrush 门户 Overlay 与 CSS 级联陷阱 — 2026-08-02

来源：Git 可视化缩略条（ChartBrush）对齐 bklit-ui 官方 + 斜纹固定灰色双主题修复（见 `docs/root-cause-resolution/progress-2026-08-02-115245.md`）。

## 1. SVG 子元素上的 backdrop-filter 不可靠 → 用 HTML div 门户 overlay

- 现象：暗淡区（选区外）最初用 SVG `<rect>` + `backdrop-filter`，审查确认 Chromium 上 SVG 子元素 backdrop-filter 支持不一致（crbug.com/993644 等），失败时暗淡区完全不可见（无填充兜底）。
- 修复：参照上游 bklit-ui `chart-brush-track-overlay.tsx`，用 `createPortal` 把模糊覆盖层渲染为图表容器（`position: relative`）内的 HTML `<div>`，按 `margin.left/top` + `innerWidth/innerHeight` 定位 pane。
- 要点：
  - 容器必须是 `position: relative`（LineChart 根 `div.relative.w-full` 满足），overlay `position: absolute; inset: 0` + `pointer-events: none`（不挡 SVG 拖拽命中）+ `z-index: 1`。
  - pane 坐标为：`top = margin.top`、`left = margin.left`（或 `margin.left + x1`）、宽 = `x0` / `innerWidth - x1`、高 = `innerHeight` —— 即 scale 绘图区原点与尺寸。
  - 需要 `mounted` state 守卫 `containerRef.current` 就绪后再 portal（SSR/hydration 安全）。
  - `blurPx` 钳制 `[0, 5]`、补 `WebkitBackdropFilter` 前缀、边缘淡出用 `mask-image` 15%（对齐上游）。

## 2. CSS `:root` 同特异性靠后覆盖主题块值（级联陷阱）

- 现象：亮/暗主题 token（`--chart-brush-pattern` 等）在 `[data-theme='light']`/`[data-theme='dark']` 块里定义正确，但页面始终渲染暗色值。
- 根因：文件末尾 `:root`「Theme-Independent Tokens」块也定义了同名变量。`:root` 与 `[data-theme='light']`/`[data-theme='dark']` 特异性同为 (0,1,0)，但 `:root` 更靠后 → 级联胜出 → 覆盖所有主题块值（亮色值从未生效）。
- 教训：**主题相关 token 严禁放在文件末尾的无条件 `:root` 块**（或任何与主题块同特异性且靠后的位置）。`themes.css` 亮色块实际是 `:root, [data-theme='light']` 复合选择器——注意跨行选择器不匹配 `:root {` 子串。
- 回归防护：`src/styles/themes-brush-tokens.test.ts` 用花括号配平提取所有 `:root {` 块，断言均不含 `--chart-*:` token；另断言 Theme-Independent 标记后无任何 chart token。

## 3. 拖拽像素 delta 换算用 scale range（innerWidth），不是 SVG 全宽

- ChartBrush 拖拽 `deltaFrac = dx / rect.width` 用 SVG 全宽（含左右 margin 共 32px）作分母，而 scale range 是 `[0, innerWidth]` → 拖拽比例偏差 ~3%。
- 修复：`deltaFrac = dx / innerWidthRef.current`（ref 保持 useCallback 稳定，不进 deps）。dx 为指针位移差，margin 在减法中抵消，无需再扣偏移。

## 4. 测试环境注意

- jsdom 无 `PointerEvent`（`ReferenceError: PointerEvent is not defined`），`fireEvent.pointerMove` 不触发 React 的 onPointerMove。需要模拟拖拽时：测试内定义 `class TestPointerEvent extends MouseEvent`（带 `clientX/clientY/pointerId`）+ mock `Element.prototype.getBoundingClientRect` / `setPointerCapture` / `releasePointerCapture`，直接 `dispatchEvent`。
- CSS 文件内容断言（`themes-brush-tokens.test.ts`）：`?raw` 在 vitest 中被 CSS 插件拦截返回空串，改用 `readFileSync(new URL('./xxx.css', import.meta.url), 'utf-8')` + `// @vitest-environment node`（仓库先例 `changesEditorHighlight.test.ts` 同款）。
