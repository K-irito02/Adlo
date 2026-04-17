# Theming

## Current Scope

The desktop shell currently exposes two explicit UI choices:

- `light`
- `dark`

The persisted config model still keeps `system` as a valid internal mode, but the current home shell intentionally surfaces only the explicit light/dark switch requested for Phase 0 usability.

## Runtime Rules

- Theme state is owned by `Main` and persisted in `config/config.json`.
- `Renderer` reads only the resolved theme and never mutates native theme state directly.
- Theme application happens through `document.documentElement.dataset.theme`.
- Shared CSS tokens must be defined in `renderer/src/styles.css`; avoid scattering raw colors through markup.

## Design Intent

- Light theme favors warm paper tones and teal accents.
- Dark theme favors restrained blue-charcoal surfaces with the same accent family.
- Home-shell components must remain legible in both themes at desktop and mobile widths.
