# Themes

Source of truth: `[apps/desktop/renderer/src/styles/themes.css](../../apps/desktop/renderer/src/styles/themes.css)` and `[apps/desktop/renderer/src/design-system/theme.ts](../../apps/desktop/renderer/src/design-system/theme.ts)`.

The desktop renderer ships **2 appearance modes (light / dark)**. The Main process additionally exposes `system` mode that resolves to either light or dark based on the OS preference.

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

## Mode resolution

```ts
type ThemeMode = "light" | "dark" | "system";

function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): "light" | "dark" {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}
```

- `themeMode` and `language` are persisted by **Main** in `config/config.json`.
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
