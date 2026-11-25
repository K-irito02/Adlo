# Design System

> 定位：本目录为 Adlo 桌面渲染器的设计系统实现契约（中英双语：canonical design-system reference + implementation contract）。

This is the canonical design-system reference for the **Adlo** desktop renderer.

This folder is the **implementation contract**: anything the renderer ships must match the rules below, and any spec change must update both.

## Goals

- **Standardised, structured UI** for the complete product form (desktop host + third-party harness integration).
- **Two theme modes** (`light`, `dark`) + `system` resolution, with consistent semantic tokens.
- **WCAG AA** color contrast, full keyboard accessibility, screen-reader friendly markup.
- **Responsive** down to a 640 px window (minimum supported width).
- **Performance-first**: tree-shake friendly modules, virtualisation for big lists, debounced inputs, no synchronous layout thrash.
- **Test coverage** for every public design-system helper.

## Directory Structure

> **Pattern quick reference**: the per-pattern checklist lives in
> [`.agents/rules/ui-patterns.md`](../../.agents/rules/ui-patterns.md) (on-demand, not injected every session).

```
docs/design-system/
├── README.md                # This file — overview & index
├── action-flash-triad.md    # Action flash triad pattern
├── allowlist-manage-dropdown.md  # Allowlist manage dropdown pattern
├── button-loading-overlay.md     # Button loading overlay pattern
├── drag-drop-feedback.md         # Drag drop feedback & lifted copy pattern
├── browser-landing-surfaces.md   # 着陆页卡片表面 + 视频音量控件
├── foundations/             # Core design primitives
│   ├── README.md
│   ├── tokens.md            # Design tokens (spacing/typography/radius/shadow/...)
│   └── themes.md            # light/dark modes, system resolution, ThemeController
├── components/
│   ├── README.md
│   └── components.md        # UI component specs (Button/Card/Pill/Modal/Toast/...)
└── guidelines/              # Quality & usage practices
    ├── README.md
    ├── accessibility.md     # WCAG AA, keyboard nav, screen reader, contrast
    ├── responsive.md        # Breakpoints, app-shell adaptation
    ├── testing.md           # Unit/integration/build coverage strategy
    └── data-visualization.md # Dynamic heatmap levels + branch categorical palette
```

## Layered Architecture

```
frontend/src/
├── main.tsx               # Vite/React 入口：挂载根节点、全局样式
├── app/
│   ├── App.tsx            # 根组件（TCopyProvider 注入）
│   ├── stores/            # Zustand 切片合并状态管理
│   │   ├── slicedStore.ts # 基于切片合并的完整 Store（真源，切片数以本文件实测为准）
│   │   ├── StoreState.ts  # 完整类型接口
│   │   ├── slices/        # 状态切片（含浏览器 + GitHub 系列）
│   │   └── actions/       # 跨切片 action 模块（数量以目录实测为准）
│   ├── i18n/              # 国际化（25 领域 × 中英，TCopyContext + useTCopy 驱动）
│   ├── icons/             # SVG 图标（actions/core/file/helper/status/terminal-*）
│   ├── features/          # 功能模块（30 个，含 center/dsh/storage-settings）
│   └── regions/           # 布局区域（TitleBar/CenterPane/LeftSidebar/RightPanel）
├── styles/
│   ├── tokens.css         # 1. Atomic CSS custom properties
│   ├── themes.css         # 2. light/dark theme variables
│   ├── base.css           # 3. Resets, focus, scrollbar
│   ├── components.css     # 4. Buttons, cards, pills, modal, ...
│   ├── components/        # 5. Per-component styles (~30 files)
│   ├── regions/           # 6. Shell region styles (rightpanel/)
│   ├── testing/           # 7. Test-only styles
│   ├── utilities.css      # 8. sr-only, skip link, gap helpers
│   ├── tailwind.css       # 9. Tailwind entry
│   └── index.css          # Single import surface
└── design-system/
    ├── tokens.ts          # Design token types（真源：Spacing/Shadow/Radius/Duration/Icon/Layout/ZIndex）
    ├── html.ts            # html`` template + escape + classNames
    ├── icons.ts           # SVG icon registry (currentColor, no emoji)
    ├── theme.ts           # ThemeController (setTheme({ mode }) + subscribe/dispose/getState)
    ├── components.ts      # string renderers (renderButton/renderCard/…，仅设计约束参考)
    ├── __tests__/        # icons/theme tests
    └── index.ts           # Single import surface
```

## Quick Start

Theme control (real API):

```ts
import { ThemeController } from "./design-system";

const theme = new ThemeController(); // options: { root?, systemDarkQuery? }
theme.setTheme({ mode: "system" }); // 只传 mode；resolvedTheme 内部经 systemPrefersDark() 解析
const unsub = theme.subscribe((state) => console.log(state.resolvedTheme));
```

> `render*` string helpers in `components.ts` are legacy (React 消费端以 `Toast`/`Tooltip` 等组件为准）。

## Module Index

| Document | Category | Topic |
| --- | --- | --- |
| [`action-flash-triad.md`](./action-flash-triad.md) | Patterns | 行级异步操作三态回显（loading → success/error，约 1.4s 复位） |
| [`allowlist-manage-dropdown.md`](./allowlist-manage-dropdown.md) | Patterns | 白名单管理下拉（下拉 + 添加按钮固定布局） |
| [`button-loading-overlay.md`](./button-loading-overlay.md) | Patterns | 按钮加载占位覆盖（文案隐藏占位 + 居中覆盖层） |
| [`foundations/tokens.md`](./foundations/tokens.md) | Foundations | Spacing / typography / radius / shadow / z-index / motion tokens |
| [`foundations/themes.md`](./foundations/themes.md) | Foundations | light/dark modes + system resolution rules |
| [`components/components.md`](./components/components.md) | Components | Button / Input / Card / Pill / Banner / Modal / Tooltip / etc. |
| [`guidelines/accessibility.md`](./guidelines/accessibility.md) | Guidelines | Keyboard, screen reader, contrast, reduced motion |
| [`guidelines/responsive.md`](./guidelines/responsive.md) | Guidelines | Breakpoints, app-shell adaptations |
| [`guidelines/testing.md`](./guidelines/testing.md) | Guidelines | Unit + integration coverage strategy |
| [`guidelines/data-visualization.md`](./guidelines/data-visualization.md) | Guidelines | Dynamic heatmap levels + branch categorical palette |

> **UI 模式速查**：[`ui-patterns.md`](../../.agents/rules/ui-patterns.md) — 按场景（对话框、菜单、悬停、点击、颜色、Hint Card、按钮、文件树等 20 类）索引到本文档各章节，开发时快速定位。

## Non-Negotiables

1. Components **MUST** consume CSS custom properties (`var(--…)`); raw colors are a hard error in code review. Exception: third-party embedded surfaces that require programmatic theme objects may mirror documented semantic/background values in code, but those values must stay aligned with [`themes.md`](./foundations/themes.md).
2. Icons **MUST** ship as SVG that inherits `currentColor`. **No emojis** anywhere in the UI. Exception: `lucide-animated` (MIT) is a permitted third-party animated icon library for specific click-feedback animation use cases (e.g. copy button). It satisfies the SVG + `currentColor` constraint and uses `motion` (Framer Motion) for its animations.
3. The project has **two** icon systems — React components in `frontend/src/app/icons/` and the string registry in `frontend/src/design-system/icons.ts`. Shared glyph geometry (e.g. the chevron family) MUST stay identical across both; changing one requires syncing the other. Icon-family geometry must remain internally consistent (e.g. left/right/down/up chevrons share one unit box) so expand/collapse toggles don't visually jump.
4. Every interactive control exposes default / hover / focus-visible / active / disabled / loading states with adequate contrast.
5. The renderer never mutates persisted theme state directly — it goes through the store `updatePreferences` (+ localStorage cache `adl-theme-mode`/`adl-resolved-theme`).
6. Reduced motion is honored automatically through `@media (prefers-reduced-motion: reduce)`.
7. The desktop minimum supported window width is **640 px**.

## 设置面板行律

设置行（`.adl-settings-row`）的上下留白与分隔线依赖 `:first-child` / `:last-child`，
即**行必须是卡片的直接子元素**。需要按依赖/主题分组时，包装元素（如环境组的 `<section>`）
必须自己承担行距与分隔线，并中和组内行的首末收边；否则整组会粘连、分组语义倒置。
参考实现：`frontend/src/styles/regions/environment-settings.css`（契约注释在 `settings.css` 的 Rows 段）。

行内控件的垂直对齐有两种来源：组级 `align-items: center`（如 `.adl-settings-controls` /
`.adl-browser-settings` / `.adl-dsh-settings`），以及行级修饰类 `--center` / `--path-center`。
共用行组件（如 `features/harness/sub-components/SourceCard.tsx` 的 `SourceRow`）应自带行级修饰类，
这样新增设置组（例如 OpenCode CLI）不会因为漏写组级规则而贴顶。窄档（容器 ≤600px）由
`@container` 的堆叠规则统一覆盖回 `stretch`。