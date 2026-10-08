# Design Tokens

Source of truth: `[frontend/src/styles/tokens.css](../../../ai-digital-life/frontend/src/styles/tokens.css)`（除行级 Source 另注者外；Hint 节 token 定义于 `themes.css`）。

Tokens are the only acceptable way to express atomic design decisions in the codebase. Components MUST refer to them via CSS custom properties — `color: #fff` is forbidden, `color: var(--text-on-accent)` is required.

## Spacing (4 px grid)


| Token         | Value |
| ------------- | ----- |
| `--space-px`  | 1 px  |
| `--space-0-5` | 2 px  |
| `--space-1`   | 4 px  |
| `--space-2`   | 8 px  |
| `--space-3`   | 12 px |
| `--space-4`   | 16 px |
| `--space-5`   | 20 px |
| `--space-6`   | 24 px |
| `--space-8`   | 32 px |
| `--space-10`  | 40 px |
| `--space-12`  | 48 px |
| `--space-16`  | 64 px |
| `--space-20`  | 80 px |
| `--space-24`  | 96 px |


## Typography

- Family: `--font-sans` (Inter + system stack), `--font-mono` (JetBrains Mono / Fira Code), `--font-display` (alias of sans), `--font-serif` (Georgia / Times New Roman system stack — settings panel section titles only, no webfont bundled).
- Size scale: `--text-xs` (12 px) → `--text-5xl` (48 px) on a 1.25 ratio.
- Weights: `--font-light` (300) → `--font-extrabold` (800).
- Line heights: `--leading-none` (1) → `--leading-relaxed` (1.625).
- Tracking: `--tracking-tight` (-0.025em) → `--tracking-widest` (0.1em).

## Radius

`--radius-none`, `--radius-sm` (2 px), `--radius` (4 px), `--radius-md` (6 px), `--radius-lg` (8 px), `--radius-xl` (12 px), `--radius-2xl` (16 px), `--radius-3xl` (24 px), `--radius-full` (pill).

## Shadow

`--shadow-sm`, `--shadow`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-2xl`, `--shadow-inner`, plus `--shadow-soft` (theme-aware ambient).

## Motion


| Group     | Tokens                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| Duration  | `--duration-75` … `--duration-1000`, `--duration-editorial` (600 ms)                                                 |
| Easing    | `--ease-default` (220 emphasis), `--ease-enter`, `--ease-exit`, `--ease-spring`, `--ease-snap`, `--ease-linear`, `--ease-editorial` |
| Composite | `--transition-colors`, `--transition-shadow`, `--transition-transform`, `--transition-opacity`, `--transition-modal` |


`prefers-reduced-motion: reduce` automatically collapses every duration to 1 ms.

## Z-Index

Strict layering tokens — nothing else may declare arbitrary z-index numbers:

`--z-base` (0), `--z-raised` (10), `--z-dropdown` (20), `--z-sticky` (30), `--z-overlay` (40), `--z-modal-backdrop` (50), `--z-modal` (60), `--z-popover` (70), `--z-toast` (80), `--z-tooltip` (90), `--z-max` (9999).

## Icons

`--icon-xs` (12 px) → `--icon-2xl` (48 px). All icons inherit `currentColor`. For animated click-feedback icons, `lucide-animated` is the permitted third-party library.

## Layout

- `--titlebar-height` (36 px), `--statusbar-height` (28 px)
- `--sidebar-width` (248 px), `--sidebar-width-collapsed` (64 px)
- `--content-max-width` (1440 px)
- `--adl-editor-minimap-width` (84 px) - Minimap 宽度，用于编辑器内容区域的右侧 padding

## Surface (interactive)

| Token | Light | Dark | Source |
|-------|-------|------|--------|
| `--surface-hover` | `rgba(34, 34, 34, 0.06)` | `rgba(255, 255, 255, 0.08)` | `themes.css` |
| `--surface-active` | `rgba(34, 34, 34, 0.08)` | `rgba(255, 255, 255, 0.12)` | `themes.css` |

`--surface-hover` 用于鼠标悬停态的轻微底色（如菜单项 hover）。
`--surface-active` 用于选中/激活态的稍深底色（如菜单项 active）。
`--surface-raised` 是弹出层（菜单、popover）的背景，定义在 `themes.css` 中。

## Hint / 提示色

拖拽手柄 / 分界线的悬停提示使用**中性色**，禁用 accent 蓝色（避免与选中 / 焦点语义混淆）：

| Token | Light | Dark | Source |
|-------|-------|------|--------|
| `--text-secondary`（提示色首选） | `#767676` | `#9a9a9a` | `themes.css` |

- 终端底色亮 `#f8f8f8` / 暗 `#0c0c0c` 下对比度亮 ≈4.3:1 / 暗 ≈7.0:1（非文本指示器 ≥3:1 即满足位置提示要求）；需更强对比时可升级为 `--text-primary`，不得引入彩色。
- 明度变化只走中性灰阶（白 → 灰 → 黑方向）。
- 适用（完整清单见真源规则，hover/active/拖拽态均为 `--text-secondary`）：
  - `.adl-terminal-divider`
  - `.adl-terminal-col-divider` / `.adl-terminal-row-divider`（终端均分模式分割边界线）
  - `.adl-terminal-free-handle--move`（终端自由模式移动手柄，默认小圆点、悬停/拖拽展开）
  - `.adl-tool-navigator__resize-handle`
  - `.adl-rightpanel__resize-handle`
  - `.adl-leftbar__resize-handle` / `.adl-leftbar__conversation-resize`
  - `.adl-cm-diff-viewer .adl-cm-diff-resizer`（拖拽中为 `--dragging` 类，同色）
- 规则真源见 [.agents/rules/hint-color-usage.md](../../../.agents/rules/hint-color-usage.md)（同步到 `.opencode/rules/`、`.trae/rules/`；改 docs 侧数值前先读真源规则）。

## 特殊提示警醒色 / 填充色（用户指令）

特殊提示、警醒、填充等场景一律使用白 / 灰 / 黑中性色（明度、纯度、配比自行设计，须同时兼顾亮、暗主题可见性）。未经用户允许，不得擅自使用蓝色（含 `var(--accent)` 系）或其他彩色；需其它颜色时先与用户确认。选中态、焦点环、主操作、链接仍走 `var(--accent)` 系。

## Focus

- `--focus-ring-width` (3 px, boosted to 4 px under `prefers-contrast: more`)
- `--focus-ring` (theme-aware, see `themes.css`)

## Tooltip

| Token | Value | Source |
|-------|-------|--------|
| `--tooltip-bg` | `var(--bg-elevated)` (solid fallback under the gradient) | `tokens.css` |
| `--tooltip-bg-top` / `--tooltip-bg-bottom` | `#ffffff` / `#e8eaee` (light), `#33363d` / `#212329` (dark) | `tokens.css`, `themes.css` |
| `--tooltip-fg` | `var(--text-primary)` (both themes) | `tokens.css` |
| `--tooltip-shadow` | 3D button stack, theme-specific (see `tooltip.css`) | `tokens.css`, `themes.css` |
| `--tooltip-radius` | `7px` | `tokens.css` |
| `--duration-350` | `350ms` (tooltip enter; `1ms` under reduced-motion) | `tokens.css` |

Tooltip uses same-theme 3D button surfaces (no inverse theming, no arrow, no border). Animation is slide-in `opacity + translateY(8px→0)` with `--ease-editorial` enter / `--ease-exit` exit. See `tooltip.css` and `.agents/rules/ui-patterns.md` §9.

## Reduced Motion / Reduced Data

- All transition + animation durations collapse to 1 ms when `prefers-reduced-motion: reduce` is set.
- Decorative gradients in `body` background are dropped when `prefers-reduced-data: reduce` is set.