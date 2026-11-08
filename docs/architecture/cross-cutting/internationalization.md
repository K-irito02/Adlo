# Internationalization

## Current Scope

The renderer currently supports:

- `zh-CN`
- `en-US`

Language selection is owned by the Rust backend (default `system`, OS-following), persisted via the unified storage layer, and exposed to the WebView only through typed Tauri Commands.

Current i18n coverage: **25 domains × zh-CN/en-US** (`frontend/src/app/i18n/{zh-CN,en-US}/`, 26 files each incl. `index.ts`).硬约束见 `docs/development/project-engineering-constraints.md`（国际化规则）与 `.agents/rules/`（i18n 相关规则）。

All UI text types are covered: buttons, tooltips, card content, aria-labels, placeholders, empty states, loading states, error messages, filter labels, relative time strings, date formatting.

## Runtime Rules

- The WebView must not write config files directly.
- Locale messages live under `frontend/src/app/i18n/`.
- All new user-facing strings for the desktop home shell must be added to both locale files in the same change.
- Fallback behavior is conservative: unsupported values resolve to `zh-CN`.
- Language switching is runtime-switchable without restart.

## Architecture

- Custom React Context (`TCopyContext`) + `useTCopy()` hook provides `{ t, locale, formatT }` to all components
- Flat key-value dictionary design — no nesting, no plural rules, no ICU MessageFormat
- Type safety via `CopyKey = keyof typeof zhCN` — compile-time catch for invalid keys
- Template interpolation via `formatT(t, key, vars)` with `{varName}` syntax

## Full Coverage Rules

- ALL UI text must use i18n keys: buttons, tooltips, aria-labels, placeholders, empty states, loading states, error messages, filter labels, card content, relative time strings, date formatting
- Utility functions with display text must accept a `locale` parameter (see `githubPanelUtils.ts`)
- Section/header labels must use i18n keys, not hardcoded strings
- Language-switch-safe rendering: breadcrumb/title row visibility must not depend solely on `workspaces` or `selectedGitHubTreePath` from the Zustand store, which may be temporarily cleared during locale change — use `activeCiWorkspaceId / activeCiFolderId` as stability anchors

## Domain Coverage

25 domains under `frontend/src/app/i18n/{zh-CN,en-US}/` (see [frontend-structure.md](../../analysis/adlo/features/frontend-structure.md)). Dictionary organization (per-domain files + barrel) see [i18n-dictionary-domain-split-organization.md](../../../.agents/rules/i18n-dictionary-domain-split-organization.md).

Richer formatting/pluralization ideas are unscoped future thoughts (see `FUTURE-ROADMAP.md`), not planned phases.
