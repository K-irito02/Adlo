# Themes

Source of truth: `[apps/desktop/renderer/src/styles/themes.css](../../apps/desktop/renderer/src/styles/themes.css)` and `[apps/desktop/renderer/src/design-system/theme.ts](../../apps/desktop/renderer/src/design-system/theme.ts)`.

The desktop renderer ships **5 color schemes × 2 appearance modes (light / dark)** — 10 themes total. The Main process additionally exposes `system` mode that resolves to either light or dark based on the OS preference.

## DOM contract

Themes are applied via two attributes on `<html>`:

```html
<html data-color-scheme="scheme-3" data-theme="dark">
```


| Attribute           | Allowed values                                         |
| ------------------- | ------------------------------------------------------ |
| `data-color-scheme` | `scheme-1` ... `scheme-5`                              |
| `data-theme`        | `light`, `dark` (system mode resolves to one of these) |


Every component reads only semantic tokens (`--text-primary`, `--accent`, …) so they remain palette-agnostic.

## Color schemes


| ID         | 中文名   | English name   | Light accent | Dark accent | Notes                      |
| ---------- | ----- | -------------- | ------------ | ----------- | -------------------------- |
| `scheme-1` | 炭黑甜酷粉 | Charcoal Pink  | `#e6397c`    | `#ff5b9b`   | High-energy, bold contrast |
| `scheme-2` | 深海柔奶白 | Deep Sea Cream | `#122e8a`    | `#f5efea`   | Default, calm + serious    |
| `scheme-3` | 藤紫钛啡绿 | Wisteria Green | `#5e55a2`    | `#a59ce6`   | Studio / creative tone     |
| `scheme-4` | 无白茶花红 | Camellia Red   | `#e72d48`    | `#ff6f8a`   | Editorial / warm           |
| `scheme-5` | 捣蓝清水蓝 | Indigo Cyan    | `#113056`    | `#91cfd5`   | Quiet, technical           |


## Semantic tokens (provided per scheme)

Background: `--bg`, `--bg-strong`, `--bg-elevated`, `--bg-muted`, `--bg-overlay`
Surface: `--surface`, `--surface-elevated`, `--surface-sunken`
Text: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled`, `--text-inverse`, `--text-on-accent`
Border: `--border-subtle`, `--border-default`, `--border-strong`
Accent: `--accent`, `--accent-hover`, `--accent-active`, `--accent-soft`, `--accent-contrast`
Status: `--info` / `--info-soft`, `--success` / `--success-soft`, `--warning` / `--warning-soft`, `--danger` / `--danger-soft`
Misc: `--focus-ring`, `--shadow-soft`

## Mode resolution

```ts
type ThemeMode = "light" | "dark" | "system";

function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): "light" | "dark" {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}
```

- `themeMode` and `language` are persisted by **Main** in `config/config.json`.
- `colorScheme` is a **renderer-only** preference, persisted under `localStorage["ai-digital-life:color-scheme"]` (defaults to `scheme-2`).
- When `themeMode === "system"`, the renderer subscribes to `prefers-color-scheme: dark` and updates `data-theme` on the fly without an IPC round-trip.

## ThemeController API

```ts
const controller = new ThemeController({ root, storage, systemDarkQuery });

controller.hydrate();                                    // apply attributes once
controller.setColorScheme("scheme-4");                   // persist + re-render
controller.setTheme({ mode: "dark", resolvedTheme: "dark" });
controller.subscribe((state) => console.log(state));     // listen for changes
controller.dispose();                                    // remove media listener
```

The controller is the **only** place that touches `document.documentElement.dataset`. Tests can pass an in-memory `Storage` and a fake `MediaQueryList` to verify behavior in jsdom (see `[tests/unit/design-system/theme.test.ts](../../tests/unit/design-system/theme.test.ts)`).

## Contrast targets

Each scheme is tuned to meet:

- **WCAG AA** for body text on `--bg` (≥ 4.5:1).
- **WCAG AA** for icons + small UI text on `--surface` (≥ 4.5:1).
- **WCAG AA** for `--text-on-accent` over `--accent` (≥ 4.5:1).

When `prefers-contrast: more` is requested, `themes.css` boosts border opacity and focus-ring width to keep separation under accessibility tools.