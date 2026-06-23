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

## Context menu (Minimap scrollbar)

Source of truth: `[frontend/src/app/regions/right-panel/cmMinimap.ts](../../frontend/src/app/regions/right-panel/cmMinimap.ts)` (component logic) and
`[frontend/src/styles/regions.css](../../frontend/src/styles/regions.css)` (visual rules, lines ~5883).

The minimap scrollbar right-click menu uses CSS `.adl-cm-minimap-context-menu` and its sub-components:

| Sub-component | CSS class | Description |
|--------------|-----------|-------------|
| Segmented control | `.adl-cm-minimap-menu-segmented` | Underline tabs — "缩略图 / 标准" |
| Group label | `.adl-cm-minimap-menu-group-label` | Uppercase group headers |
| Menu item | `.adl-cm-minimap-menu-item` | Flat button with `::before` left indicator line |
| Active item | `.adl-cm-minimap-menu-item--active` | Active state: darker bg + solid left indicator |
| Separator | `.adl-cm-minimap-menu-separator` | Horizontal divider |

The visual design is 方案 C · 极简线条风: underline segmented control + `::before` left indicator bar + right-angle backgrounds + highlight-only selection (no checkmark).

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

## Sticky Context

Source of truth:

- `[frontend/src/app/regions/right-panel/stickyContext.ts](../../frontend/src/app/regions/right-panel/stickyContext.ts)`
- `[frontend/src/app/regions/right-panel/stickyContextView.tsx](../../frontend/src/app/regions/right-panel/stickyContextView.tsx)`
- `[frontend/src/styles/regions.css](../../frontend/src/styles/regions.css)`

This is the shared sticky navigation layer for the right-panel file viewer surfaces used by `文件` and `变更`.

Design rules:

- Sticky rows are rendered **inside the editor surface**, not above the entire panel shell, so Monaco layout and scroll math stay anchored to the real editor viewport.
- The sticky block must reserve the right-side minimap gutter (`--adl-editor-minimap-width`) and may never paint over or capture space from the minimap column.
- The first sticky row is a full-width "回到顶部 / 文件顶部" action, but it only appears when the real first line of the current file is no longer visible in the viewport.
- Total sticky height is adaptive with a hard cap of **4 rows**. The optional top row counts toward that cap.
- Context rows follow the current/modified side in diff-backed views and may carry lightweight insert / delete / modified rails, but navigation still targets the current readable side only.
- Sticky surfaces must use existing theme tokens (`--surface`, `--surface-hover`, `--border-*`, `--text-*`) rather than local hard-coded colors.
- Hover and active states must remain obvious in both light and dark themes without relying on native `title` tooltips.

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

## File-type badge icons

Source of truth: `[frontend/src/app/icons/badges.tsx](../../frontend/src/app/icons/badges.tsx)` (icon components), `[frontend/src/app/features/file-tree/fileTreeVisuals.ts](../../frontend/src/app/features/file-tree/fileTreeVisuals.ts)` (tone→icon mapping).

File-type badge icons render inside the file tree's `adl-filetree__file-icon` slot (20×18 px area). Unlike the generic icon system, badge icons are **semantic**: each file type or language gets a distinct shape paired with its tone color.

### Icon catalogue

| Variant | Shape | Semantic | Example tones | Used by |
|---------|-------|----------|---------------|---------|
| `typescript` | Shield | Type safety | `typescript` (blue) | `.ts`, `.tsx`, `.mts`, `.cts` |
| `javascript` | Diamond | Dynamic / versatile | `javascript` (amber) | `.js`, `.jsx`, `.mjs`, `.cjs` |
| `python` | Double wave | Python's snake | `python` (green) | `.py`, `.ipynb` |
| `systems` | Concentric circles | Core / fundamental | `rust`, `go`, `java`, `cfamily`, … | Compiled / JVM / systems languages |
| `markup` | Angle brackets `<>` | HTML tags | `markup` (orange) | `.html`, `.xml`, `.vue`, `.svelte` |
| `style` | Hash `#` | CSS selector | `stylesheet` (blue) | `.css`, `.scss`, `.less` |
| `data` | Curly braces `{}` | JSON / serialization | `json` (amber) | `.json`, `.jsonc` |
| `script` | Prompt `>` | Terminal | `shell` (green), `powershell` (blue) | `.sh`, `.ps1`, `.bat` |
| `config` | Slider control | Settings | `config`, `node`, `yaml` | `.toml`, `.ini`, `package.json`, … |
| `doc` | Page with fold | Document | `doc` (gray), `pdf` (red), `markdown` (blue) | `.pdf`, `.docx`, `.md`, … |
| `text` | Page with lines | Plain text | `text` (gray) | `.txt`, `.log` |
| `sheet` | Grid | Spreadsheet | `sheet` (green) | `.csv`, `.xlsx`, `.ods` |
| `slide` | Screen + stand | Presentation | `slide` (amber) | `.ppt`, `.odp` |
| `image` | Mountain + sun | Visual media | `image` (pink), `vector` (purple) | `.png`, `.jpg`, `.svg` |
| `audio` | Eighth note | Audio | `audio` (teal) | `.mp3`, `.wav`, `.flac` |
| `video` | Play triangle | Video | `video` (amber) | `.mp4`, `.mov` |
| `archive` | Box + dividers | Compressed | `archive` (amber) | `.zip`, `.rar`, `.7z` |
| `database` | Cylinder | Database | `database` (teal) | `.sql`, `.db`, `.sqlite` |
| `font` | Letter A | Font | `font` (purple) | `.ttf`, `.otf`, `.woff` |
| `badge` | Document + line | Fallback | `default` (gray) | Unknown / uncategorised |

### Tone → icon mapping

Defined in `TONE_TO_ICON` (`fileTreeVisuals.ts:53`). Each `FileTreeVisualTone` maps to a `FileBadgeVariant`. The tone also determines the CSS colour via `--adl-file-badge-ink-*` tokens in `themes.css`.

### Adding a new badge variant

1. Add a new icon component via `make()` in `badges.tsx`.
2. Append the variant string to the `FileBadgeVariant` type union.
3. Register it in the `ICON_MAP` constant.
4. Add the tone→icon mapping in `TONE_TO_ICON` (`fileTreeVisuals.ts`).

Visual design rules:
- All badge icons use `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth=2`, round caps/joins.
- Shapes must be recognisable at 14 px rendering (the standard badge size).
- Each variant should have a visually distinct silhouette from other variants.
- The `badge` variant (document + line) serves as the universal fallback.

## Component catalogue (CSS only)

The stylesheet also ships ready-to-use classes that helpers don't expose yet but consumers can render directly:

- `.tile` — list-row / status-row container with hover affordance.
- `.field`, `.field__label`, `.field__hint`, `.field__error` — form field scaffolding.
- `.input`, `.textarea`, `.select` — text inputs.
- `.skeleton` — loading shimmer (`@keyframes skeleton-shimmer`).
- `.modal-backdrop`, `.modal`, `.modal__title`, `.modal__actions` — dialog primitives.
- `.tooltip` — absolutely-positioned tooltip surface (paired with custom JS positioning logic when used).
- `.tooltip__arrow` — CSS-only arrow via `clip-path: polygon(50% 0%, 0% 100%, 100% 100%)` (upward triangle), rotated per `data-side` attribute.
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
| `warning` | Circle + exclamation (`check-circle` with custom SVG) | `var(--color-warning)` (orange) | Warnings, prompts |
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
| Base top | 24px |
| Toast height | ~40px |
| Gap between toasts | 8px |
| Calculation | `top = 24 + position * (40 + 8)` |

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
| Background | `var(--tooltip-bg)` (inverse theming) |
| Text color | `var(--tooltip-fg)` |
| Border radius | `var(--tooltip-radius)` (6px) |
| Shadow | `var(--tooltip-shadow)` |
| Animation | Pure opacity transition (no scale) |
| Arrow | 8px × 8px clip-path triangle |
| Placement | `data-side="top\|bottom\|left\|right"` (auto-flip on viewport overflow) |

React API entry points: `Tooltip` (provider), `TooltipTrigger` (event wiring), `TooltipContent` (portal surface), `TooltipSimple` (one-shot wrapper). Source: `[Tooltip.tsx](../../frontend/src/app/components/Tooltip.tsx)`.

Fold gutter tooltips use `FoldTooltipOverlay` (CodeMirror 6 extension, portal to `document.body`): `[FoldTooltipOverlay.tsx](../../frontend/src/app/regions/right-panel/FoldTooltipOverlay.tsx)`.

## StatusBar menus

Source of truth: `[frontend/src/app/regions/StatusBar.tsx](../../frontend/src/app/regions/StatusBar.tsx)` and `[frontend/src/styles/regions.css](../../frontend/src/styles/regions.css)`.

Applies to the inline StatusBar menus:

- `.adl-statusbar__menu` base container
- `.adl-statusbar__menu--workspace` (workspace binding / recent list)
- `.adl-statusbar__menu--branch` (git branch switch/create)
- `.adl-statusbar__menu--model` (model selection)

### Layout + container

- Menu uses a popover card style: `--surface-raised` background, `--border` outline, `--radius-lg` rounding, `--shadow-lg` shadow.
- Width is constrained to a safe minimum for dense statusbars (`--model` intentionally narrower than other menus).
- Sections (`.adl-statusbar__menu-section`) are separated with a subtle top border (`--border-subtle`).

### Option rows

- `.adl-statusbar__menu-option` is the shared row primitive for menu list items.
- Active + hover states use **background only** (`--surface-hover`); **no visible border outline** in these menus (workspace/branch/model) to keep the card clean and consistent.
- `:focus-visible` removes default outlines and relies on the same background emphasis as hover to avoid "double focus rings" inside the card.

### Inputs

- `.adl-statusbar__input` uses a minimal chrome style (no visible border by default).
- On hover or focus, inputs show a subtle grey background emphasis, and return to transparent when the pointer leaves and the input is not focused.

### Actions

- `.adl-statusbar__menu-actions` buttons are equal-width and centered within their own halves for a stable layout.
- Actions use `--surface-subtle` backgrounds by default and `--surface-hover` on hover/focus, with icon + text inheriting `currentColor`.

### Additional rules

- **No blue chrome**: avoid `adl-btn--primary` in these menus; use `ghost` + a neutral background instead.
- **Consistent action surfaces**: buttons inside `.adl-statusbar__menu-actions` always show the same neutral background, even when disabled.
- **Muted action tone**: action buttons use `color: var(--text-secondary)` so icon + label read as a unified light grey.
- **Workspace bind actions are two-column**: `.adl-statusbar__menu--workspace .adl-statusbar__menu-actions` uses a 2× grid so "选择文件夹 / 绑定该路径" split evenly and center within their cells.
- **Global mode row**: use `.adl-statusbar__menu-option--global` for the "对话模式 / 不用绑定工作空间" row to pin a default subtle background and a slightly stronger title weight.
- **Branch create row**: use `.adl-statusbar__menu-row` (e.g. `adl-statusbar__menu-row--branch-create`) to put "新建分支名称输入框 + 基于当前分支选择" on the same line.
- **Branch base selector is a cascading submenu**: use `.adl-statusbar__submenu-trigger` with a right-chevron and open a sibling `.adl-statusbar__submenu` card aligned to the right, matching the same menu surface tokens.
- **Model menu stays compact**: `.adl-statusbar__menu--model` uses a narrower width; model selection updates provider priority to avoid ties so switching always takes effect.

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
