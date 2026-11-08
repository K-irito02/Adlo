# Accessibility

The renderer targets **WCAG 2.1 AA** out of the box. This document captures the contract every contributor must respect.

## Keyboard Navigation

- The first focusable element on the page is a `Skip to main content` link (rendered via `.skip-link` in `utilities.css`). It becomes visible only on `:focus-visible`.
- The `<main>` element is `tabindex="-1"` so the skip link can move focus into it.
- All interactive controls are real `<button>`, `<a>`, or form controls — never `div role="button"`.
- Custom focus rings are powered by `box-shadow: 0 0 0 var(--focus-ring-width) var(--focus-ring)` with `outline: 0`. Never remove `:focus-visible` styles.
- Segmented controls expose `aria-pressed` so assistive tech can speak the toggle state.
- Toggle buttons pick one state channel: a constant name paired with `aria-pressed` / `aria-expanded`, **or** a name that changes with the action and no state attribute. Never both — "Expand toolbar · pressed" is contradictory.
- Banner / status messages use `role="status"` and `aria-live` (assertive only for danger banners).
- The color-scheme picker is a `role="group"` with per-button `aria-label` (the human-readable name) and `aria-pressed`.

## Screen Reader Friendly Markup

- Title bar / sidebars / center / panels expose `role` + `aria-label` landmarks (TitleBar/CenterPane/LeftSidebar/RightPanel).
- Card containers expose `aria-label` so they show up as discoverable landmarks.
- Decorative icons are `aria-hidden="true" focusable="false"`. Meaningful icons require a `title` (rendered as `aria-label`).
- Visually-hidden form labels use the `.sr-only` utility, never inline `style="display:none"` (which would also hide them from AT).

## Color & Contrast

- Each color scheme is hand-tuned against `--bg`, `--surface`, and `--accent` to clear WCAG AA (≥ 4.5:1 for body text, ≥ 3:1 for large text and graphical UI).
- `prefers-contrast: more` boosts `--border-default` and `--focus-ring-width` for users who request more contrast.
- Status color is **never** the only signal: pills always pair color with text and pair text with an icon when conveying critical state (success / warning / danger).

## Motion

- All transitions and animations honor `@media (prefers-reduced-motion: reduce)` by collapsing durations to 1 ms (`base.css` + `tokens.css`).
- Spinners (`.btn[aria-busy="true"]`) are still allowed because they communicate ongoing work, but they are sized small to minimise visual impact.

## Reduced Data

- `@media (prefers-reduced-data: reduce)` drops the gradient backdrop on `body` to avoid heavy paints on metered links.

## Forms

- Every input has either a visible `<label>` or a `.sr-only` label. Implicit labelling via `placeholder` is forbidden (placeholders disappear once typing starts).
- Error states use `aria-invalid="true"` plus `.input` styling to communicate the error.

## Localisation

- The active language is reflected on `<html lang>` so AT pronunciation is correct.
- Strings that drive ARIA labels (e.g. `appShellTitlebar`, `colorSchemeOpenLabel`) live in the locale files alongside visible copy.

## Known follow-ups

- Tooltip 已有完整 React 实现（provider/trigger/content/simple，`maxWidth` 默认 240，`data-side` 定位）；Dialog focus-trap 待办单列。