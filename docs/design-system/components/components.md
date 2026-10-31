# Components

> `render*` helpers in `design-system/components.ts` 仅作设计约束参考；React 消费端以 `Toast`/`Tooltip` 等组件为准。

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

Reference implementation:暂缺（原 `communication-panel.css` 示例已随通信面板删除）；新增同类实现时须按上节约束自证层叠上下文与负值累加。

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

Empty states are rendered with the shared classes in
`frontend/src/styles/regions/rightpanel/tree-shared.css` (`.adl-empty-hint`) or the
`EmptyRow` component for list/tree rows. Both use one typography baseline
(`--text-xs` / `--text-muted` / line-height 1.5 / centered); panels may override layout
only. `.adl-sortable-empty` (drop zone) and `.adl-welcome__empty` (center welcome) are the
documented exceptions.

## Auto-resolved note（自动检测·真实状态提示行）

Source of truth: `frontend/src/app/components/settings/AutoResolvedNote.tsx`;
style `.adl-settings-row__label small.adl-settings-auto-note` in
`frontend/src/styles/components/settings.css`.

```tsx
<AutoResolvedNote>{formatT(t, 'settingsAutoResolved', { value })}</AutoResolvedNote>
```

- A `select` shows the user's preference (`自动检测` / Automatic); the note under the label states what that preference **actually resolves to** (host-managed / system install / external running, proxy endpoint, registry).
- Render only while the mode is `auto` **and** the resolved value is known; never render it in explicit modes.
- The note reports **source**, not availability: "当前实际使用：宿主托管" stays even when nothing is installed yet — availability belongs to the status pill and the warning line below.
- Colour uses the same dark-blue mix as the harness note (`color-mix(in srgb, var(--accent) 72%, var(--text-secondary))`; dark theme 62% mixed with `--text-muted`). This is the approved exception to the neutral hint rule: it describes state, not a warning.
- Specificity trap: the generic `.adl-settings-row__label small` rule is 0-1-1, so the class must be scoped as `.adl-settings-row__label small.adl-settings-auto-note`; a bare class selector renders grey in the light theme.
- Data comes from the server (`proxyEffective` and similar), not from draft form state: gate the note on the **persisted** mode so a just-changed draft can never display the previous resolution.

## Row refresh（行级刷新·悬停显现）

Source of truth: `frontend/src/app/components/settings/SettingsRefreshButton.tsx`;
styles `.adl-settings-row__refresh` / `.adl-settings-refresh` in
`frontend/src/styles/components/settings.css`.

```tsx
<SettingsRowRefresh refresh={{ label, spinning, onRefresh }} disabled={disabled} />
```

- Row-level refresh lives in the row's title line, **after** the title text; when the row has a status pill, it goes **after the pill** (never reserve a permanent gap between title and pill).
- The slot is `width: 0; opacity: 0` at rest and expands to 22px on row `:hover` / `:focus-within`; `@media (hover: none)` keeps it visible on touch. The button stays focusable while collapsed, so keyboard users can reveal it with Tab. While collapsed the slot also carries `margin-left: -var(--space-1)` to cancel the title line's flex `gap`, so no permanent gap is reserved.
- `title` is always `刷新` (Refresh); `aria-label` is `刷新：{target}` (`Refresh: {target}`) so multiple buttons on one page remain distinguishable.
- Block-level refresh reuses the same component with `block` (26px) in the section header's `action` slot and refreshes every item in that block, including rows without their own icon. The card reports its busy state through `onBusyChange` (host hook `useHarnessBlockRefresh`), so the block button is genuinely `disabled` while an install/uninstall/check is in flight instead of silently no-oping.
- Explicit refresh disables itself while in flight (`aria-busy` + spinner) and must surface failures; values are kept during refresh (shimmer on the control), never blanked.
- **No cross-row coupling**: one row's refresh must not disable or dim buttons in other rows. If refreshes share one backend load, serialize them internally and keep a per-row spinner; only genuine card-busy state (install/uninstall/check in flight) disables actions.
- **No height jump**: the loading pill overlays the control that is still in the layout (`visibility: hidden` on the original, absolute pill on top), so the row and card keep their height while the capsule shimmer is visible.
- Environment independence: block/row refresh sends only its own dependency set; the backend merges the probed fields into the cached snapshot and returns the rest untouched.

## Paged list field（直连名单·单行翻页）

Source of truth: `frontend/src/app/features/network/NoProxyField.tsx`;
styles `.adl-network-no-proxy*` in `frontend/src/styles/components/settings.css`.

- A multi-value list is stored newline-separated. The inline field shows **one entry at a time** with an `n/total` counter and up/down chevrons; both appear only on field hover / `:focus-within` (always visible on touch).
- The expand button is absolutely positioned in the card's right padding gutter, **not** in the control row, so the sibling inputs keep the same width and right edge (no reserved space inside the row). In the narrow container stage (≤460px) the control column reserves the 28px gutter with `padding-right`, because the card padding shrinks to 16px / 12px.
- The popover edits the whole list in a textarea with the **native vertical scrollbar** (no `RevealScrollbar`). Its title bar is draggable and clamped inside the settings content area; it deliberately does **not** follow the anchor on scroll (dragging and follow would fight), it only re-clamps on scroll / resize. The footer states that changes save automatically; close is an icon button (no text button).
- Legacy comma-separated values are split for display. Inline edits are written back newline-separated; the popover textarea passes the typed text through unchanged (the backend matcher accepts both separators).

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

## Markdown preview surfaces

Preview surfaces render markdown through `markdown-it`, then style it with the vendored `github-markdown-css` variable sheet (`styles/vendor/markdown-theme-vars.css`, generated by `scripts/generate-md-theme-vars.mjs`). The vendor sheet owns `.markdown-body` typography and also sets properties on descendants you may not expect.

**Review checklist for any custom block inside `.markdown-body`:**

- Explicitly reset every vendor property you do not want to inherit: `padding`, `margin`, `font-style` (e.g. `dl dt`), `line-height`, list markers.
- Do not assume "my selector is more specific" is enough: undeclared properties still fall through to the vendor rule. Real example: `.markdown-body dl dd { padding: 0 1rem }` silently inset a custom property table by 16px.
- Pin the reset with a CSS contract test (`styles/*.test.ts` + `findRuleGroups`), not just the intended value.
- Scope custom classes under the preview root so the reset cannot leak into other surfaces.

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
| Single-line modifier | `.tooltip--single-line` forces `.tooltip__content` to `nowrap` (for short icon-button labels; long hints go through `HintCardTrigger`, never Tooltip) |
| Placement | `data-side="top\|bottom\|left\|right"` (viewport flip/clamp + Webview2 avoid-rects + cross-axis slide) |

React API entry points: `Tooltip` (provider), `TooltipTrigger` (event wiring), `TooltipContent` (portal surface), `TooltipSimple` (one-shot wrapper). Source: `[Tooltip.tsx](../../../ai-digital-life/frontend/src/app/components/Tooltip.tsx)`.

Fold gutter tooltips use `FoldTooltipOverlay` (React portal to `document.body`, 实位 `frontend/src/app/features/editor/FoldTooltipOverlay.tsx`).

### Context menu

Right-click menus (`.adl-sidebar-menu`, `.adl-multitree-entry__menu`) share four standards:

| Standard | Rule |
|----------|------|
| Danger hover-only | `.is-danger` items render in default text color; red text + `var(--danger-soft)` background apply on `:hover`/`:focus-visible` only — never persistently red |
| Nested badge | Scope suffixes like `[嵌套]` must not be baked into i18n copy; render `.adl-menu-item__badge` capsule after the label (`t.nestedBadge`) |
| Viewport clamp | Portal menus clamp to viewport with 8px margin (shared `useClampedMenuPosition`; `ContextMenu` has the same logic built in) — bottom rows flip upward instead of clipping |
| Hint marker | `!` marker (`.adl-menu-item__hint`) opens a `HintCard` on hover; danger variant follows the hover-only rule |

## State coverage matrix


| Component        | Default | Hover | Focus | Active | Disabled | Loading | Empty                     |
| ---------------- | ------- | ----- | ----- | ------ | -------- | ------- | ------------------------- |
| Button           | ✅       | ✅     | ✅     | ✅      | ✅        | ✅       | n/a                       |
| Input / Textarea | ✅       | ✅     | ✅     | n/a    | n/a      | n/a     | n/a                       |
| Card             | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | use `.adl-empty-hint` / `EmptyRow`    |
| Pill             | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | n/a                       |
| Nav item         | ✅       | ✅     | ✅     | n/a    | n/a      | n/a     | n/a                       |
| Segmented        | ✅       | ✅     | ✅     | n/a    | n/a      | n/a     | n/a                       |
| Banner           | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | empty mode reserves space |
| Modal            | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | n/a                       |
| Toast            | ✅       | n/a   | n/a   | n/a    | n/a      | n/a     | n/a                       |
