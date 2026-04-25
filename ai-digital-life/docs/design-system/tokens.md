# Design Tokens

Source of truth: `[frontend/src/styles/tokens.css](../../frontend/src/styles/tokens.css)`.

Tokens are the only acceptable way to express atomic design decisions in the codebase. Components MUST refer to them via CSS custom properties — `color: #fff` is forbidden, `color: var(--text-on-accent)` is required.

## Spacing (4 px grid)


| Token         | Value |
| ------------- | ----- |
| `--space-px`  | 1 px  |
| `--space-0-5` | 2 px  |
| `--space-1`   | 4 px  |
| `--space-2`   | 8 px  |
| `--space-3`   | 12 px |
| `--space-4`   | 16 px |
| `--space-5`   | 20 px |
| `--space-6`   | 24 px |
| `--space-8`   | 32 px |
| `--space-10`  | 40 px |
| `--space-12`  | 48 px |
| `--space-16`  | 64 px |
| `--space-20`  | 80 px |
| `--space-24`  | 96 px |


## Typography

- Family: `--font-sans` (Inter + system stack), `--font-mono` (JetBrains Mono / Fira Code), `--font-display` (alias of sans).
- Size scale: `--text-xs` (12 px) → `--text-5xl` (48 px) on a 1.25 ratio.
- Weights: `--font-light` (300) → `--font-extrabold` (800).
- Line heights: `--leading-none` (1) → `--leading-relaxed` (1.625).
- Tracking: `--tracking-tight` (-0.025em) → `--tracking-widest` (0.1em).

## Radius

`--radius-none`, `--radius-sm` (2 px), `--radius` (4 px), `--radius-md` (6 px), `--radius-lg` (8 px), `--radius-xl` (12 px), `--radius-2xl` (16 px), `--radius-3xl` (24 px), `--radius-full` (pill).

## Shadow

`--shadow-sm`, `--shadow`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-2xl`, `--shadow-inner`, plus `--shadow-soft` (theme-aware ambient).

## Motion


| Group     | Tokens                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| Duration  | `--duration-75` … `--duration-1000`                                                                                  |
| Easing    | `--ease-default` (220 emphasis), `--ease-enter`, `--ease-exit`, `--ease-spring`, `--ease-snap`, `--ease-linear`      |
| Composite | `--transition-colors`, `--transition-shadow`, `--transition-transform`, `--transition-opacity`, `--transition-modal` |


`prefers-reduced-motion: reduce` automatically collapses every duration to 1 ms.

## Z-Index

Strict layering tokens — nothing else may declare arbitrary z-index numbers:

`--z-base` (0), `--z-raised` (10), `--z-dropdown` (20), `--z-sticky` (30), `--z-overlay` (40), `--z-modal-backdrop` (50), `--z-modal` (60), `--z-popover` (70), `--z-toast` (80), `--z-tooltip` (90), `--z-max` (9999).

## Icons

`--icon-xs` (12 px) → `--icon-2xl` (48 px). All icons inherit `currentColor`.

## Layout

- `--titlebar-height` (36 px), `--statusbar-height` (28 px)
- `--sidebar-width` (248 px), `--sidebar-width-collapsed` (64 px)
- `--content-max-width` (1440 px)

## Focus

- `--focus-ring-width` (3 px, boosted to 4 px under `prefers-contrast: more`)
- `--focus-ring` (theme-aware, see `themes.css`)

## Reduced Motion / Reduced Data

- All transition + animation durations collapse to 1 ms when `prefers-reduced-motion: reduce` is set.
- Decorative gradients in `body` background are dropped when `prefers-reduced-data: reduce` is set.