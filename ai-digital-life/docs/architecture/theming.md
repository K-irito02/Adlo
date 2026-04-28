# Theming

The full visual contract lives in the `[docs/design-system/](../design-system/README.md)` folder. This page only documents the architectural rules — i.e. **who owns what** between the Rust backend and the WebView frontend.

## Ownership

- The **Rust backend** owns the persisted appearance preferences (`language`, `themeMode`, `logLevel`, …) and writes them to `config/config.json` via the `config` crate.
  - `themeMode` is `"light" | "dark" | "system"`.
  - When `system`, the backend resolves the active theme via Tauri's window theme APIs and exposes `resolvedTheme` to the WebView.
- The **WebView** never mutates `data-theme` directly. It calls `themeController.setTheme({ mode, resolvedTheme })` which centralises all DOM mutation.
- The **WebView** never mutates persisted `themeMode` directly. It calls the `app_update_preferences` Tauri Command and rebuilds from the returned `AppInfo`.

## DOM contract

```html
<html data-theme="light">
```

- `data-theme` reflects the **resolved** appearance (`light | dark`).
- The default is `light`. The attribute is pre-stamped on `<html>` in `index.html` so the very first paint avoids a FOUC.

## Runtime rules

- `ThemeController` is the only allowed mutator of `document.documentElement.dataset`.
- Components MUST consume CSS custom properties (`var(--accent)`); raw colors are forbidden by code review.
- All component styles MUST live under `frontend/src/styles/` (see [Design System README](../design-system/README.md)).
- Switching `themeMode` to `system` re-subscribes to `prefers-color-scheme: dark` and updates `data-theme` reactively without a Tauri Command round-trip.
- Theme tokens default to a restrained, low-saturation look. Prefer neutral text and soft/subtle semantic variants (`--text-secondary`, `--text-muted`, `--surface-hover`, `--accent-soft`, `--success-soft`, `--warning-soft`, `--danger-soft`) unless stronger emphasis is required for accessibility, critical feedback, or a primary call to action.
- Saturated semantic base colors (`--accent`, `--success`, `--warning`, `--danger`) are reserved for narrow emphasis zones such as focus rings, destructive confirmations, hard errors, or other states where a softer variant would weaken clarity.
- Third-party renderers that cannot read CSS custom properties directly, such as Monaco, must derive their programmatic theme from the same resolved light/dark state and the documented shell background baseline rather than inventing an independent palette.
- When a third-party renderer needs a programmatic theme object, the renderer layer MUST resolve semantic tokens to concrete color literals before registration. Passing raw CSS values such as `var(--surface)` or keyword values such as `transparent` into the third-party theme API is forbidden because those APIs may treat invalid tokens as error colors or fallback markers.
- Monaco gutter folding controls are treated as a constrained interoperability exception: if the internal DOM cannot reliably host the product tooltip component, the editor integration layer may assign a localized native `title` to the folding control only, and that exception must not bleed into ordinary UI components.

## Design intent

- The theme is calibrated to keep the home shell legible under both desktop and mobile-class widths (down to 640 px).
- `--accent` always carries the brand recognisability; semantic status colors (`--success`, `--warning`, `--danger`) stay perceptually distinct in every theme.
- The shell now uses a unified neutral canvas for most structural regions so title bar, sidebars, center header, tool switcher, tool panes, and status bar read as one continuous workspace.
- The current shell background baseline is `rgb(248, 248, 248)` in light mode and `rgb(20, 20, 20)` in dark mode; higher-elevation elements such as inputs, menus, and popovers keep a restrained secondary surface for separation.
- Embedded editing surfaces inside the shell are expected to visually merge into this baseline, including editor body, gutter, and minimap regions.
