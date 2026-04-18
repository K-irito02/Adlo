# Design System

This is the canonical design-system reference for the **AI Digital Life** desktop renderer.

The design intent originates in [`digitalLife/aiFunction-Implementation/stageOne-UI`](../../../digitalLife/aiFunction-Implementation/stageOne-UI/) (Phase 0 specification). This folder is the **implementation contract**: anything the renderer ships must match the rules below, and any spec change must update both.

## Goals

- **Standardised, structured UI** that scales with future stages.
- **Five color schemes × three theme modes** (`light`, `dark`, `system`) with consistent semantic tokens.
- **WCAG AA** color contrast, full keyboard accessibility, screen-reader friendly markup.
- **Responsive** down to a 640 px window (Phase 0 minimum supported width).
- **Performance-first**: tree-shake friendly modules, virtualisation for big lists, debounced inputs, no synchronous layout thrash.
- **Test coverage** for every public design-system helper.

## Layered Architecture

```
apps/desktop/renderer/src/
├── styles/
│   ├── tokens.css         # 1. Atomic CSS custom properties
│   ├── themes.css         # 2. 5 schemes × light/dark
│   ├── base.css           # 3. Resets, focus, scrollbar
│   ├── layout.css         # 4. App shell, sidebar, grid presets
│   ├── components.css     # 5. Buttons, cards, pills, modal, ...
│   ├── utilities.css      # 6. sr-only, skip link, gap helpers
│   └── index.css          # Single import surface
└── design-system/
    ├── html.ts            # html`` template + escape + classNames
    ├── icons.ts           # SVG icon registry (currentColor, no emoji)
    ├── theme.ts           # ThemeController (scheme + mode)
    ├── components.ts      # renderButton / renderCard / renderPill / ...
    └── index.ts           # Single import surface
```

## Quick Start

In renderer code:

```ts
import {
  ThemeController,
  renderButton,
  renderCard,
  renderIcon,
  html,
} from "./design-system";
import "./styles/index.css";

const theme = new ThemeController();
theme.hydrate();
theme.setColorScheme("scheme-3");

document.body.innerHTML = renderHtml(html`
  ${renderCard({
    title: "Workspace",
    children: html`
      ${renderButton({ label: "Open", icon: "folder" })}
    `
  })}
`);
```

## Module Index

| Document | Topic |
| --- | --- |
| [`tokens.md`](./tokens.md) | Spacing / typography / radius / shadow / z-index / motion tokens |
| [`themes.md`](./themes.md) | The 5 color schemes × light/dark resolution rules |
| [`components.md`](./components.md) | Button / Input / Card / Pill / Banner / Modal / Tooltip / etc. |
| [`accessibility.md`](./accessibility.md) | Keyboard, screen reader, contrast, reduced motion |
| [`responsive.md`](./responsive.md) | Breakpoints, app-shell adaptations, grid presets |
| [`testing.md`](./testing.md) | Unit + integration coverage strategy |

## Non-Negotiables

1. Components **MUST** consume CSS custom properties (`var(--…)`); raw colors are a hard error in code review.
2. Icons **MUST** ship as SVG that inherits `currentColor`. **No emojis** anywhere in the UI.
3. Every interactive control exposes default / hover / focus-visible / active / disabled / loading states with adequate contrast.
4. The renderer never mutates persisted theme state directly — it forwards via the IPC bridge (`window.digitalLife.app.updatePreferences`). Color scheme is a renderer-only preference (see [`themes.md`](./themes.md)).
5. Reduced motion is honored automatically through `@media (prefers-reduced-motion: reduce)`.
6. The desktop minimum supported window width is **640 px**.
