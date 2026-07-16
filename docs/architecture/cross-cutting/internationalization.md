# Internationalization

## Current Scope

The renderer currently supports:

- `zh-CN`
- `en-US`

Language selection is owned by the Rust backend, persisted in `config/config.json`, and exposed to the WebView only through typed Tauri Commands.

Current i18n coverage: **~932 keys across 13 domains** (common, menu, workspace, conversation, file, changes, terminal, browser, approval, models, CI, communicate).

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

| Domain | File | Approx Keys |
|--------|------|-------------|
| Common | `zh-CN/common.ts` | 137 |
| Menu | `zh-CN/menu.ts` | 23 |
| Workspace | `zh-CN/workspace.ts` | 86 |
| Conversation | `zh-CN/conversation.ts` | 123 |
| File | `zh-CN/file.ts` | 68 |
| Changes | `zh-CN/changes.ts` | 86 |
| Terminal | `zh-CN/terminal.ts` | 56 |
| Browser | `zh-CN/browser.ts` | 134 |
| Approval | `zh-CN/approval.ts` | 24 |
| Models | `zh-CN/models.ts` | 34 |
| CI (GitHub) | `zh-CN/ci.ts` | 249 |
| Communication | `zh-CN/communicate.ts` | 23 |

Later phases can extend this to richer formatting, pluralization, and validation automation.
