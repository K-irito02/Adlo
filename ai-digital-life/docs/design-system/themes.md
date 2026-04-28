# Themes

Source of truth: `[frontend/src/styles/themes.css](../../frontend/src/styles/themes.css)` and `[frontend/src/design-system/theme.ts](../../frontend/src/design-system/theme.ts)`.

The desktop renderer ships **2 appearance modes (light / dark)**. The Tauri backend additionally exposes `system` mode that resolves to either light or dark based on the OS preference.

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

Background: `--bg`, `--bg-strong`, `--bg-elevated`, `--bg-muted`, `--bg-overlay`
Surface: `--surface`, `--surface-elevated`, `--surface-sunken`
Text: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled`, `--text-inverse`, `--text-on-accent`
Border: `--border-subtle`, `--border-default`, `--border-strong`
Accent: `--accent`, `--accent-hover`, `--accent-active`, `--accent-soft`, `--accent-contrast`
Status: `--info` / `--info-soft`, `--success` / `--success-soft`, `--warning` / `--warning-soft`, `--danger` / `--danger-soft`
Misc: `--focus-ring`, `--shadow-soft`

## Shell background baseline

- The renderer shell prefers a mostly uniform structural background to reduce panel fragmentation and visual noise.
- Light mode uses `--bg: rgb(248, 248, 248)` as the primary shell canvas.
- Dark mode uses `--bg: rgb(20, 20, 20)` as the primary shell canvas.
- Structural containers such as the title bar, left rail, center shell header, right tool rail, tool panes, and status bar should prefer `--bg` unless a stronger separation is necessary.
- Raised controls and overlays such as inputs, composer shells, dropdowns, menus, and popovers may use `--bg-input`, `--surface-elevated`, or `--surface-raised` to preserve interaction clarity.

## Embedded editor surfaces

- Embedded editors that do not consume CSS custom properties directly, such as Monaco, must still resolve against the same shell background baseline.
- The default editor canvas, gutter, and minimap background should use `rgb(248, 248, 248)` in light mode and `rgb(20, 20, 20)` in dark mode unless a documented product requirement overrides it.
- When an embedded editor requires a programmatic theme definition, that theme should be treated as an implementation mirror of the design tokens rather than a separate visual system.
- Programmatic editor themes must be registered with resolved color literals (`#RRGGBB`, `#RRGGBBAA`, or concrete `rgb/rgba` values accepted by the target API). Raw CSS custom-property references and CSS keyword colors should be normalized before registration.
- Transparent editor states should be expressed using the target API's accepted transparent literal, not by assuming browser CSS parsing rules apply inside the programmatic theme layer.
- Monaco folding controls may use a localized native `title` as a narrow fallback for gutter hover guidance when the editor's internal DOM cannot stably host the shared tooltip component. This exception applies only inside the Monaco integration layer, not to normal product UI controls.

## Mode resolution

```ts
type ThemeMode = "light" | "dark" | "system";

function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): "light" | "dark" {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}
```

- `themeMode` and `language` are persisted by the **Tauri backend** and surfaced to the WebView bridge.
- When `themeMode === "system"`, the renderer subscribes to `prefers-color-scheme: dark` and updates `data-theme` on the fly without an IPC round-trip.

## ThemeController API

```ts
const controller = new ThemeController({ root, systemDarkQuery });

controller.hydrate();                                    // apply attributes once
controller.setTheme({ mode: "dark", resolvedTheme: "dark" });
controller.subscribe((state) => console.log(state));     // listen for changes
controller.dispose();                                    // remove media listener
```

The controller is the **only** place that touches `document.documentElement.dataset`. Tests can pass a fake `MediaQueryList` to verify behavior in jsdom (see `[tests/unit/design-system/theme.test.ts](../../tests/unit/design-system/theme.test.ts)`).

## Contrast targets

Each theme is tuned to meet:

- **WCAG AA** for body text on `--bg` (≥ 4.5:1).
- **WCAG AA** for icons + small UI text on `--surface` (≥ 4.5:1).
- **WCAG AA** for `--text-on-accent` over `--accent` (≥ 4.5:1).

When `prefers-contrast: more` is requested, `themes.css` boosts border opacity and focus-ring width to keep separation under accessibility tools.
