# Internationalization

## Current Scope

The renderer currently supports:

- `zh-CN`
- `en-US`

Language selection is owned by `Main`, persisted in `config/config.json`, and exposed to `Renderer` only through typed IPC.

## Runtime Rules

- `Renderer` must not write config files directly.
- Locale messages live under `apps/desktop/renderer/src/locales/`.
- All new user-facing strings for the desktop home shell must be added to both locale files in the same change.
- Fallback behavior is conservative: unsupported values resolve to `zh-CN`.

## Phase 0 Expectation

Phase 0 only needs home-shell bilingual support for:

- workspace open and restore flows
- retrieval status
- health and log summaries
- approval shell labels
- settings toggles

Later phases can extend this to richer formatting, pluralization, and validation automation.
