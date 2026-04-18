# Theming

The full visual contract lives in the `[docs/design-system/](../design-system/README.md)` folder. This page only documents the architectural rules — i.e. **who owns what** between Main, Preload, and Renderer.

## Ownership

- **Main** owns the persisted appearance preferences (`language`, `themeMode`, `logLevel`, …) and writes them to `config/config.json` via `@ai-digital-life/config`.
  - `themeMode` is `"light" | "dark" | "system"`.
  - When `system`, Main resolves the active theme via the OS-level `nativeTheme` and exposes `resolvedTheme` to the renderer.
- **Renderer** owns the **color scheme** preference (`scheme-1` … `scheme-5`). It is persisted to `localStorage["ai-digital-life:color-scheme"]` because Phase 0 main config does not yet model it.
  - The renderer never mutates `data-theme` directly. It calls `themeController.setTheme({ mode, resolvedTheme })` which centralises all DOM mutation.
  - The renderer never mutates persisted `themeMode` directly. It calls `window.digitalLife.app.updatePreferences({ themeMode })` and rebuilds from the returned `AppInfo`.

## DOM contract

```html
<html data-color-scheme="scheme-2" data-theme="light">
```

- `data-theme` reflects the **resolved** appearance (`light | dark`).
- `data-color-scheme` reflects the active palette (`scheme-1` … `scheme-5`).
- The default is `scheme-2` + `light`. Both attributes are pre-stamped on `<html>` in `index.html` so the very first paint avoids a FOUC.

## Runtime rules

- `ThemeController` is the only allowed mutator of `document.documentElement.dataset`.
- Components MUST consume CSS custom properties (`var(--accent)`); raw colors are forbidden by code review.
- All component styles MUST live under `apps/desktop/renderer/src/styles/` (see [Design System README](../design-system/README.md)).
- Switching `themeMode` to `system` re-subscribes to `prefers-color-scheme: dark` and updates `data-theme` reactively without an IPC round-trip.

## Color schemes


| ID         | 中文名   | English name             |
| ---------- | ----- | ------------------------ |
| `scheme-1` | 炭黑甜酷粉 | Charcoal Pink            |
| `scheme-2` | 深海柔奶白 | Deep Sea Cream (default) |
| `scheme-3` | 藤紫钛啡绿 | Wisteria Green           |
| `scheme-4` | 无白茶花红 | Camellia Red             |
| `scheme-5` | 捣蓝清水蓝 | Indigo Cyan              |


See `[docs/design-system/themes.md](../design-system/themes.md)` for the per-scheme palette tables and contrast targets.

## Design intent

- Schemes are calibrated to keep the home shell legible under both desktop and mobile-class widths (down to 640 px).
- `--accent` always carries the brand recognisability; semantic status colors (`--success`, `--warning`, `--danger`) stay perceptually distinct in every theme.
- Long-form content surfaces (`--surface`, `--surface-elevated`) keep blue-charcoal restraint in dark mode and warm paper tones in light mode for sustained reading comfort.

