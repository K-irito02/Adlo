# Theming

The full visual contract lives in the `[docs/design-system/](../design-system/README.md)` folder. This page only documents the architectural rules — i.e. **who owns what** between Main, Preload, and Renderer.

## Ownership

- **Main** owns the persisted appearance preferences (`language`, `themeMode`, `logLevel`, …) and writes them to `config/config.json` via `@ai-digital-life/config`.
  - `themeMode` is `"light" | "dark" | "system"`.
  - When `system`, Main resolves the active theme via the OS-level `nativeTheme` and exposes `resolvedTheme` to the renderer.
- **Renderer** never mutates `data-theme` directly. It calls `themeController.setTheme({ mode, resolvedTheme })` which centralises all DOM mutation.
- **Renderer** never mutates persisted `themeMode` directly. It calls `window.digitalLife.app.updatePreferences({ themeMode })` and rebuilds from the returned `AppInfo`.

## DOM contract

```html
<html data-theme="light">
```

- `data-theme` reflects the **resolved** appearance (`light | dark`).
- The default is `light`. The attribute is pre-stamped on `<html>` in `index.html` so the very first paint avoids a FOUC.

## Runtime rules

- `ThemeController` is the only allowed mutator of `document.documentElement.dataset`.
- Components MUST consume CSS custom properties (`var(--accent)`); raw colors are forbidden by code review.
- All component styles MUST live under `apps/desktop/renderer/src/styles/` (see [Design System README](../design-system/README.md)).
- Switching `themeMode` to `system` re-subscribes to `prefers-color-scheme: dark` and updates `data-theme` reactively without an IPC round-trip.

## Design intent

- The theme is calibrated to keep the home shell legible under both desktop and mobile-class widths (down to 640 px).
- `--accent` always carries the brand recognisability; semantic status colors (`--success`, `--warning`, `--danger`) stay perceptually distinct in every theme.
- The shell now uses a unified neutral canvas for most structural regions so title bar, sidebars, center header, tool switcher, tool panes, and status bar read as one continuous workspace.
- The current shell background baseline is `rgb(248, 248, 248)` in light mode and `rgb(20, 20, 20)` in dark mode; higher-elevation elements such as inputs, menus, and popovers keep a restrained secondary surface for separation.
