# Components

Source of truth: `[frontend/src/styles/components.css](../../frontend/src/styles/components.css)` (visual rules) and `[frontend/src/design-system/components.ts](../../frontend/src/design-system/components.ts)` (renderer helpers).

All renderer helpers return `RawHtml` from the `[html](../../frontend/src/design-system/html.ts)` tagged template, so they compose safely with each other while interpolated user data is automatically HTML-escaped.

## Button

```ts
renderButton({
  label: "Open workspace",
  icon: "folder",
  variant: "primary",  // primary | secondary | ghost | danger
  size: "md",          // sm | md | lg
  loading: false,
  disabled: false,
  iconOnly: false,
  ariaLabel: "Open workspace",
  data: { "approval-decision": "approved" }
});
```

States covered by CSS:


| State                | Behavior                                                 |
| -------------------- | -------------------------------------------------------- |
| `:hover`             | Darkens accent (or background for ghost / secondary).    |
| `:active`            | Translates 1 px down, deeper accent.                     |
| `:focus-visible`     | 3 px focus ring (`--focus-ring`).                        |
| `[disabled]`         | Opacity 0.55, `cursor: not-allowed`, pointer events off. |
| `[aria-busy="true"]` | Spinner, hides label, disables pointer events.           |


`renderButton` always renders `type="button"` unless `type="submit"` is requested explicitly.

## Pill / Badge

```ts
renderPill({ label: "running", tone: "degraded" });
```

Tone → CSS class table:


| Tone                               | Class                                  | Token            |
| ---------------------------------- | -------------------------------------- | ---------------- |
| `neutral`                          | `.pill`                                | `--bg-muted`     |
| `healthy` / `success`              | `.pill--healthy` / `.pill--success`    | `--success-soft` |
| `degraded` / `pending` / `warning` | `.pill--degraded` etc.                 | `--warning-soft` |
| `unavailable` / `danger`           | `.pill--unavailable` / `.pill--danger` | `--danger-soft`  |
| `info`                             | `.pill--info`                          | `--info-soft`    |
| `accent`                           | `.pill--accent`                        | `--accent-soft`  |


## Card

```ts
renderCard({
  title: "Health snapshot",
  subtitle: "Updated just now",
  toolbar: renderButton({ label: "Refresh", variant: "ghost", icon: "refresh" }),
  children: html`<ul>...</ul>`,
  variant: "default",   // default | inset
  ariaLabel: "Health snapshot",
});
```

The card semantically renders as a `<section>` (override via `as`). Use `inset` for nested groups inside another card.

## Banner / Inline alert

```ts
renderBanner({
  text: "Workspace opened.",
  tone: "success",
  live: "polite"   // polite (default) | assertive | off
});
```

Banners render with `role="status"` and `aria-live`, and reserve their vertical space when `empty: true` is passed so the layout never shifts.

## Empty state

```ts
renderEmptyState({
  icon: "search",
  title: "No retrieval yet",
  description: "Start indexing to populate the repo map.",
  action: renderButton({ label: "Start", icon: "play" })
});
```

## Navigation item

```ts
renderNavItem({
  href: "#",
  icon: "tasks",
  label: "Tasks",
  current: true,
});
```

Renders as `<a class="nav__item">` with `aria-current="page"` when `current` is `true`. The label automatically collapses on small screens (controlled by `nav__item-label` in `layout.css`).

## Segmented control

```ts
renderSegmentedControl({
  name: "language",
  ariaLabel: "Language",
  value: "zh-CN",
  options: [
    { value: "zh-CN", label: "中文" },
    { value: "en-US", label: "English" }
  ]
});
```

Each generated button carries `data-segmented-name` + `data-segmented-value`, so a single delegated click handler in `main.ts` can route the change.

## Icon strip

Source of truth: `[frontend/src/styles/regions.css](../../frontend/src/styles/regions.css)` via
`.adl-iconstrip`, `.adl-iconstrip__button`, `.adl-iconstrip__button--label`, `.adl-iconstrip__button--labelwide`, `.adl-iconstrip__button--window`,
`.adl-iconstrip__separator`, `.adl-iconstrip__badge`.

This is the application-specific compact icon switcher language extracted from the right-panel tool switcher so future shell surfaces can
reuse the same visual grammar instead of re-inventing local toolbar styles. It is now also the shared style language for the desktop titlebar.

```tsx
<div className="adl-iconstrip" role="tablist" aria-label="Tools">
  <button className="adl-iconstrip__button is-active" type="button" aria-label="Files" />
  <span className="adl-iconstrip__separator is-visible" aria-hidden="true" />
  <button className="adl-iconstrip__button" type="button" aria-label="Browser">
    <span className="adl-iconstrip__badge">1</span>
  </button>
</div>
```

Design rules:

- Icon-only buttons by default; visible labels remain optional and are usually hidden while `aria-label` stays required.
- Selected and hovered buttons share the same neutral grey fill; no accent-colored active chrome is used inside the strip.
- Separators are **conditional overlays**, not permanent dividers and not layout gaps. Show them only when adjacent grey states would visually merge.
- The strip must visually bond with its host region edge; no extra inner padding or floating radius.
- Badges are compact neutral counters, inset from the corner instead of touching the container border.
- `--label` expands a button for short text actions such as titlebar menus; `--window` keeps system controls aligned to the strip metric.
- `--labelwide` is the edge-bonded icon + text variant for compact environment controls such as the left sidebar theme / language strip.
- Titlebar usage is a wider full-height track: menu / icon / window controls share the same strip language, but cluster-to-cluster separation uses real border lines while intra-strip highlighted adjacency uses the conditional center separator overlay.

Customisation is done with CSS variables on the container:

- `--adl-iconstrip-height`
- `--adl-iconstrip-button-size`
- `--adl-iconstrip-separator-inset`
- `--adl-iconstrip-badge-top`
- `--adl-iconstrip-badge-right`
- `--adl-iconstrip-badge-min-width`
- `--adl-iconstrip-badge-height`
- `--adl-iconstrip-badge-font-size`

## Stat tile

```ts
renderStatTile({ label: "Scanned", value: "128", detail: "files" });
```

Used in the dashboard health / retrieval grids.

## Icon

```ts
renderIcon("home", { size: "md", decorative: true });
renderIcon("alert-triangle", { size: "lg", title: "Warning" });
```

- `decorative: true` → `aria-hidden="true" focusable="false"`.
- Provide `title` for icons that carry meaning; the helper sets `role="img"` and a properly escaped `aria-label`.
- All icons share `viewBox="0 0 24 24"` and inherit `currentColor`.

To register a new icon, append a path string to `ICON_PATHS` in `icons.ts` and extend the `IconName` union — TypeScript will warn on every invalid usage.

## Component catalogue (CSS only)

The stylesheet also ships ready-to-use classes that helpers don't expose yet but consumers can render directly:

- `.tile` — list-row / status-row container with hover affordance.
- `.field`, `.field__label`, `.field__hint`, `.field__error` — form field scaffolding.
- `.input`, `.textarea`, `.select` — text inputs.
- `.skeleton` — loading shimmer (`@keyframes skeleton-shimmer`).
- `.modal-backdrop`, `.modal`, `.modal__title`, `.modal__actions` — dialog primitives.
- `.tooltip` — absolutely-positioned tooltip surface (paired with custom JS positioning logic when used).
- `.toast-region`, `.toast` — top-right notification stack with `toast-in` animation.

## State coverage matrix


| Component        | Default | Hover | Focus | Active | Disabled | Loading | Empty                     |
| ---------------- | ------- | ----- | ----- | ------ | -------- | ------- | ------------------------- |
| Button           | ✅       | ✅     | ✅     | ✅      | ✅        | ✅       | n/a                       |
| Input / Textarea | ✅       | ✅     | ✅     | n/a    | n/a      | n/a     | n/a                       |
| Card             | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | use `renderEmptyState`    |
| Pill             | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | n/a                       |
| Nav item         | ✅       | ✅     | ✅     | n/a    | n/a      | n/a     | n/a                       |
| Segmented        | ✅       | ✅     | ✅     | n/a    | n/a      | n/a     | n/a                       |
| Banner           | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | empty mode reserves space |
| Modal            | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | n/a                       |
| Toast            | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | n/a                       |
