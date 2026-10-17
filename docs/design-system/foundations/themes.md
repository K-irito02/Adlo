# Themes

Source of truth: `[frontend/src/styles/themes.css](../../../ai-digital-life/frontend/src/styles/themes.css)` and `[frontend/src/design-system/theme.ts](../../../ai-digital-life/frontend/src/design-system/theme.ts)`.

The desktop renderer ships **2 appearance modes (light / dark)** plus `system` mode, which is resolved frontend-side via `systemPrefersDark()` (never by the backend, never by direct `window.matchMedia`).

## DOM contract

Themes are applied via the `data-theme` attribute on `<html>`:

```html
<html data-theme="dark">
```

| Attribute    | Allowed values                                         |
| ------------ | ------------------------------------------------------ |
| `data-theme` | `light`, `dark` (system mode resolves to one of these) |

Every component reads only semantic tokens (`--text-primary`, `--accent`, …) so they remain theme-agnostic.

## Semantic tokens (provided per theme)

Background: `--bg`, `--bg-strong`, `--bg-elevated`, `--bg-muted`, `--bg-overlay`, `--bg-input`, `--bg-input-translucent`, `--bg-card`
Surface: `--surface`, `--surface-elevated`, `--surface-raised`, `--surface-sunken`, `--surface-hover`, `--surface-active`
Text: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled`, `--text-inverse`, `--text-on-accent`
Border: `--border-subtle`, `--border-default`, `--border-strong`
Accent: `--accent`, `--accent-hover`, `--accent-active`, `--accent-soft`, `--accent-contrast`
Status: `--info` / `--info-soft`, `--success` / `--success-soft`, `--warning` / `--warning-soft`, `--danger` / `--danger-soft`
Misc: `--focus-ring`, `--shadow-soft`, `--shadow-inset-highlight`, `--shadow-panel`, `--shadow-panel-sm`, `--shadow-divider`, `--ring-neutral`, `--ring-error`

## Shell background baseline

- The renderer shell prefers a mostly uniform structural background to reduce panel fragmentation and visual noise.
- Light mode uses `--bg: rgb(248, 248, 248)` as the primary shell canvas.
- Dark mode uses `--bg: rgb(20, 20, 20)` as the primary shell canvas.
- Structural containers such as the title bar, left rail, center shell header, right tool rail, tool panes, and status bar should prefer `--bg` unless a stronger separation is necessary.
- Raised controls and overlays such as inputs, composer shells, dropdowns, menus, and popovers may use `--bg-input`, `--surface-elevated`, or `--surface-raised` to preserve interaction clarity.

## Embedded editor surfaces

- Embedded editors that do not consume CSS custom properties directly (e.g. CodeMirror extensions) must still resolve against the same shell background baseline.
- The default editor canvas, gutter, and minimap background should use `rgb(248, 248, 248)` in light mode and `rgb(20, 20, 20)` in dark mode unless a documented product requirement overrides it.
- Inline change-preview diff colors are editor semantic tokens, not hard-coded Monaco colors. The content row uses `--editor-diff-insert-bg` / `--editor-diff-remove-bg` as the line-level background, and `--editor-diff-insert-gutter-bg` / `--editor-diff-remove-gutter-bg` for the gutter line-number area. Content-area background is intentionally lighter than gutter to maintain visual hierarchy (content 18-20%, gutter 28-30%). The line-level background via `:has()` on `.cm-line` covers all diff modes (side-by-side A/B, inline deleted chunks). Character-level changes use a diagonal stripe pattern on `.cm-changedText`.
- Change-preview minimap diff indicators reuse the same `--editor-diff-insert-bg` / `--editor-diff-remove-bg` token family as content rows, and should size to the changed content width instead of filling the whole minimap track.
- When an embedded editor requires a programmatic theme definition, that theme should be treated as an implementation mirror of the design tokens rather than a separate visual system.
- Programmatic editor themes must be registered with resolved color literals (`#RRGGBB`, `#RRGGBBAA`, or concrete `rgb/rgba` values accepted by the target API). Raw CSS custom-property references and CSS keyword colors should be normalized before registration.
- Transparent editor states should be expressed using the target API's accepted transparent literal, not by assuming browser CSS parsing rules apply inside the programmatic theme layer.
- Fold gutter tooltips use `FoldTooltipOverlay` (a React portal component) to render tooltip content to `document.body`. Fold events use capture-phase `document.addEventListener` to bypass CodeMirror MergeView's internal `stopPropagation()`. Gutter hover highlights use a `position: fixed` overlay covering the full gutter width, driven by `mousemove` + `requestAnimationFrame`.

## Third-party preview themes (Markdown)

Rendered Markdown previews are a **separate theme axis** from the app chrome tokens above:

- The app chrome (`--bg`, `--text-*`, …) always follows `data-theme` on `<html>`. Markdown previews instead use GitHub's own palettes (`github-markdown-css`), driven by a **generated, variable-parameterized single stylesheet** (`frontend/src/styles/vendor/markdown-theme-vars.css`, produced by `frontend/scripts/generate-md-theme-vars.mjs`) — see the CSS architecture rule for the convention.
- Themes are grouped by appearance: **light group** (`light`, `light-colorblind`) and **dark group** (`dark`, `dark-dimmed`, `dark-high-contrast`, `dark-colorblind`). Only the group matching the resolved app theme is offered; flipping the app theme auto-switches groups. Light and dark selections persist independently (`adl:files.markdownTheme{Light,Dark}`).
- Switching is a single container attribute flip (`data-md-theme` on `.adl-markdown-preview.markdown-body`); no stylesheet reload. Preview surfaces therefore change in lockstep with the rest of the interface.
- Preview typography and colors come entirely from the generated theme sheet — the app does **not** re-declare heading/list/table/quote styles for previews (only layout, the code-block frame, and the font-size zoom hook for the clipboard viewer). Reusable UI pattern for the theme picker: the `ChartColorPresetSelector` dropdown (hover-to-preview / leave-to-restore / check-on-confirm).

## Mode resolution

```ts
type ThemeMode = "light" | "dark" | "system";

function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): "light" | "dark" {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}
```

- `themeMode` and `language` are backend-authoritative (persisted via typed Tauri Commands), with a `localStorage` cache (`adl-theme-mode`/`adl-resolved-theme`) for startup pre-paint + an inline script in `index.html`; `useThemeSync(appInfo)` reconciles backend values at runtime.
- When `themeMode === "system"`, the renderer subscribes to `prefers-color-scheme: dark` and updates `data-theme` on the fly without an IPC round-trip.

## ThemeController API

```ts
const controller = new ThemeController({ root, systemDarkQuery });

controller.setTheme({ mode: "dark" });                  // 只传 mode；resolvedTheme 内部解析
controller.subscribe((state) => console.log(state));     // listen for changes
controller.dispose();                                    // remove media listener
```

The controller is the **only** place that touches `document.documentElement.dataset`. Tests can pass a fake `MediaQueryList` to verify behavior in jsdom (see `frontend/src/design-system/__tests__/theme.test.ts`).

## Contrast targets

Each theme is tuned to meet:

- **WCAG AA** for body text on `--bg` (≥ 4.5:1).
- **WCAG AA** for icons + small UI text on `--surface` (≥ 4.5:1).
- **WCAG AA** for `--text-on-accent` over `--accent` (≥ 4.5:1).

When `prefers-contrast: more` is requested, `themes.css` boosts border opacity and focus-ring width to keep separation under accessibility tools.
