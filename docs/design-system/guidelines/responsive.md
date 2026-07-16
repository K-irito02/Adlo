# Responsive Design

Implementation: [`frontend/src/styles/layout.css`](../../frontend/src/styles/layout.css).

The desktop renderer is a single window app; it is therefore tuned for **resizable desktop windows** rather than full mobile layouts, but it remains usable down to 640 px wide.

## Breakpoints

| Breakpoint | Trigger | Effect |
| --- | --- | --- |
| ≤ 1280 px | tablet-class window | `grid--dashboard` collapses from 3 columns to 2; `grid--cols-3` becomes 2 columns. |
| ≤ 960 px | small tablet / split window | Sidebar collapses to icon-only (`--sidebar-width-collapsed`); page padding shrinks; all dashboard grids stack into one column. |
| ≤ 640 px | minimum supported | Sidebar hides, the entire app shell becomes a single column, page title scales down to `--text-2xl`. |

Use `min-width` queries sparingly. The base styles target the smallest layout; larger windows are progressive enhancements via `min-width` only when absolutely needed.

## Containers

| Class | Max width | Use case |
| --- | --- | --- |
| `.container` | 1280 px | Dashboard, lists, settings. |
| `.container--wide` | `--content-max-width` (1440 px) | Logs / monitoring boards. |
| `.container--narrow` | 960 px | Onboarding / detail pages. |

## Stacks & Clusters

- `.stack` (`stack--sm`, `stack--lg`) — vertical rhythm with `gap`-based spacing.
- `.cluster` — horizontal flow that wraps gracefully (used for tag rows, button groups, status rows).

## App shell adaptation

```text
≥ 1280 px : titlebar | sidebar (248px) | main (3-col dashboard) | statusbar
≤ 1280 px : titlebar | sidebar (248px) | main (2-col dashboard) | statusbar
≤ 960  px : titlebar | sidebar (64px collapsed)  | main (single col) | statusbar
≤ 640  px : titlebar | main (single col) | statusbar (sidebar hidden)
```

## Density toggles (planned)

A future iteration will expose `data-density="comfortable" | "compact"` on the shell to scale spacing down by ~25 % for power users on very small windows. The CSS variable `--density-multiplier` is reserved for that purpose.

## Touch & hover

The renderer uses `:hover` for affordances but never relies on it for required interactions, so it remains usable on touch hardware where pointer hover does not exist.

## Testing matrix

| Width | Manual smoke check |
| --- | --- |
| 1920 px | Default Tauri window — all dashboards in 3 columns. |
| 1280 px | Common laptop window — dashboards in 2 columns. |
| 960 px | Half-screen split — sidebar collapses, single column dashboards. |
| 640 px | Minimum supported — sidebar hidden, banners stay readable. |
