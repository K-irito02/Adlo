# Components

> `render*` helpers in `design-system/components.ts` are **legacy string renderers** （仅设计约束参考；React 消费端以 `Toast`/`Tooltip` 等组件为准，`styles/index.css` 亦注明 `renderNavItem`/`renderStatTile` 为历史遗留）。

Source of truth: `[frontend/src/styles/components.css](../../../ai-digital-life/frontend/src/styles/components.css)` (visual rules) and `[frontend/src/design-system/components.ts](../../../ai-digital-life/frontend/src/design-system/components.ts)` (renderer helpers).

All renderer helpers return `RawHtml` from the `[html](../../../ai-digital-life/frontend/src/design-system/html.ts)` tagged template, so they compose safely with each other while interpolated user data is automatically HTML-escaped.

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
| `[disabled]`         | Opacity 0.55, `cursor: not-allowed`, pointer events off.|
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
| `unavailable` / `danger`           | `.pill--unavailable` / `.pill--danger` | `--danger-soft` |
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

### Card-contained row hover (full-width background)

When rows inside a card need a hover background that extends to the card's left/right edges (e.g., timeline steps in a GitHub job card), use the `::after` pseudo-element with a local stacking context:

```css
.row {
  position: relative;
  z-index: 0;
}
.row:hover {
  z-index: 1;
}
.row:hover::after {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  left: calc(-1 * (parent-padding-left + parent-margin-left + ...));
  right: calc(-1 * parent-padding-right);
  background: var(--surface-hover);
  z-index: -1;
  pointer-events: none;
}
```

**Key constraint**: `z-index: 0` on the row creates a local stacking context. Without it, `z-index: -1` on `::after` paints behind the card's background in the root stacking context and becomes invisible.

Reference implementation: `communication-panel.css` → `.adl-github-timeline__step:hover::after`.

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
  description: "Start indexing to generate the repo map (available in logs / retrieval snapshot).",
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

Renders as `<a class="nav__item">` with `aria-current="page"` when `current` is `true`. The label automatically collapses on small screens.

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

Each generated button carries `data-segmented-name` + `data-segmented-value`, so a single delegated click handler can route the change.

## Icon strip

Source of truth: `frontend/src/styles/regions/tool-switcher.css` (`.adl-iconstrip` 系列） + `titlebar.css` + `leftbar.css`（已分散，无单体 `regions.css`）。

This is the application-specific compact icon switcher language extracted from the right-panel tool switcher so future shell surfaces can
reuse the same visual grammar instead of re-inventing local toolbar styles. It is now also the shared style language for the desktop titlebar.

Design rules (icon strip):

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

## Sticky Context

Source of truth:

- `frontend/src/app/regions/right-panel/editor-support/stickyContext.ts`
- `frontend/src/app/regions/right-panel/editor-support/stickyContextView.tsx`
- `frontend/src/styles/regions/rightpanel/editor-surface.css`（`.adl-sticky-context`）

This is the shared sticky navigation layer for the right-panel file viewer surfaces used by `文件` and `变更`.

Design rules:

- Sticky rows are rendered **inside the editor surface**, not above the entire panel shell, so CodeMirror layout and scroll math stay anchored to the real editor viewport.
- The sticky block must reserve the right-side minimap gutter and may never paint over or capture space from the minimap column.
- The first sticky row is a full-width "回到顶部 / 文件顶部" action, but it only appears when the real first line of the current file is no longer visible in the viewport.
- Total sticky height is adaptive with a hard cap of **4 rows**. The optional top row counts toward that cap.
- Context rows follow the current/modified side in diff-backed views and may carry lightweight insert / delete / modified rails, but navigation still targets the current readable side only.
- Sticky surfaces must use existing theme tokens (`--surface`, `--surface-hover`, `--border-*`, `--text-*`) rather than local hard-coded colors.
- Hover and active states must remain obvious in both light and dark themes.（自定义 Tooltip 与原生 `title` 均可使用，具体方案开发时由用户决策。）

Interaction rules:

- Sticky navigation appears automatically when the active entry changes (e.g., during scrolling) and auto-hides after 1.8 seconds of inactivity.
- **Hover behavior**: When the mouse hovers over the sticky area, the auto-hide timer is paused and will only resume when the mouse leaves.
- Each row provides hover feedback with a subtle background highlight; no border or box-shadow effects.
- Empty files and outline-less files still render a stable sticky model; the UI may collapse to zero rows only when the top row is hidden and no context rows are available.
- The sticky view must not own editor height. Any "fill the remaining surface" rule must explicitly exclude `.adl-sticky-context`.

Visual design:

- The sticky area uses **full transparency** (no background, no blur effects) to avoid obstructing editor content.
- Content is right-aligned with the "向上箭头" icon appearing inline before the "文件顶部" label.
- Line numbers display as "行 xxx" (localized) instead of "Lxxx".
- Hover states show only background color change without borders or shadows.

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
- `.tooltip__arrow` — removed (no arrow design since 2026-10; `data-side` is positioning-only).
- `.tooltip__content` — content wrapper with `white-space: pre-line`.
- `.tooltip__close` — dismiss button for `dismissible` mode.

## Toast Notification

React API: `Toast` and `ToastContainer` from `frontend/src/app/components/Toast.tsx`.

```tsx
// Single toast
<Toast message="保存成功" type="success" duration={3000} onClose={() => {}} />

// Toast container with source grouping
<ToastContainer 
  toasts={[
    { id: '1', message: '操作完成', type: 'success', source: 'browser' },
    { id: '2', message: '保存成功', type: 'success', source: 'editor' }
  ]} 
  onRemove={(id) => {}} 
/>
```

### Toast Types

| Type | Icon | Color | Use Case |
|------|------|-------|----------|
| `success` | Circle + checkmark (`check-circle`) | `var(--color-success)` (green) | Success confirmations |
| `warning` | Triangle (`alert-triangle`) | `var(--color-warning)` (orange) | Warnings, prompts |
| `error` | Circle + cross (`x-circle`) | `var(--color-danger)` (red) | Error messages |

### Design Specifications

| Feature | Value |
|---------|-------|
| Position | Fixed, top center (`top: 24px`) |
| Animation | Top-drop with spring easing (`var(--ease-spring)`) |
| Duration | 300ms enter, 300ms exit |
| Background | `var(--bg-card)` |
| Border | `1px solid var(--border-default)` |
| Border radius | `4px` (slight rounded corners) |
| Shadow | `var(--shadow-md)` |
| Padding | `var(--space-2) var(--space-3)` |
| Font size | `var(--text-xs)` |
| Icon size | 16×16px |
| Gap | `var(--space-2)` between icon and text |
| Stacking | Multiple toasts stack vertically with 8px gap, first toast at top: 24px |
| Source grouping | Same source toasts stay at same position, replacing each other |

### Stacking Layout

| Parameter | Value |
|-----------|-------|
| Base top | 24px (`TOAST_BASE_TOP`) |
| Toast height | 36px (`TOAST_HEIGHT`) |
| Gap between toasts | 8px (`TOAST_GAP`) |
| Calculation | `top = 24 + position * (36 + 8)`; `position` prop 按 source 分组 |

**Source-based Stacking Logic:**
- Toasts with the same `source` value stay at the same fixed position
- Toasts with different `source` values stack vertically in order of appearance
- `source` can be any string identifier (e.g. 'browser', 'editor', 'terminal')
- When a toast is removed, remaining toasts automatically adjust positions

### Source Grouping Example

```typescript
// Same source (same position)
showToast('First warning', 'warning', 'browser') // position 0
showToast('Another warning', 'warning', 'browser') // same position 0

// Different sources (stack)
showToast('Browser error', 'error', 'browser')     // position 0
showToast('Editor saved', 'success', 'editor')    // position 1
showToast('Terminal ready', 'success', 'terminal') // position 2
```

### Tooltip design

| Feature | Value |
|---------|-------|
| Background | Same-theme 3D button gradient (`--tooltip-bg-top → --tooltip-bg-bottom`, no inverse) |
| Text color | `var(--tooltip-fg)` (= `var(--text-primary)`) |
| Border radius | `var(--tooltip-radius)` (7px) |
| Border | None (depth from inner/outer shadows only) |
| Shadow | `var(--tooltip-shadow)` (top inner highlight + bottom inner shade + contact/ambient projection) |
| Animation | Slide-in `opacity + translateY(8px→0)` (350ms expo enter / 200ms exit (`TOOLTIP_EXIT_MS`), no scale) |
| Arrow | None (removed; `data-side` kept for positioning only) |
| Wrapping | `overflow-wrap: anywhere`; width via `maxWidth` prop (default 240) |
| Placement | `data-side="top\|bottom\|left\|right"` (viewport flip/clamp + Webview2 avoid-rects + cross-axis slide) |

React API entry points: `Tooltip` (provider), `TooltipTrigger` (event wiring), `TooltipContent` (portal surface), `TooltipSimple` (one-shot wrapper). Source: `[Tooltip.tsx](../../../ai-digital-life/frontend/src/app/components/Tooltip.tsx)`.

Fold gutter tooltips use `FoldTooltipOverlay` (React portal to `document.body`, 实位 `frontend/src/app/features/editor/FoldTooltipOverlay.tsx`).

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
