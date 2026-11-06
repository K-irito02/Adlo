# Data Visualization

Reusable rules for chart palettes that must stay readable as data changes.

## Dynamic heatmap levels

**Use** `buildHeatmapLevelResolver(counts)` from `adlo/frontend/src/components/charts/heatmap/heatmap-data.ts` (re-exported by the heatmap barrel) when a heatmap needs data-driven five-level thresholds.

- Level `0` is reserved for empty cells (`count <= 0`).
- Positive counts are spread across levels `1–4` around P25 / P50 / P75.
- Boundaries step across distinct values, so tied quantiles cannot collapse levels 2/3 into the darkest level.
- A dataset with fewer than two distinct positive values falls back to the fixed semantic scale: `1 → level 1`, `2 → level 2`, `3 → level 3`, `≥4 → level 4`.
- The same resolver MUST drive the cell fill scale, cell hover matching, the level-hover cell dimming, and the legend tooltip highlight. Pass it to `HeatmapChart` and `HeatmapLegend`; do not rebuild a second thresholds function in the legend. Legend swatch hover produces a level index directly; the resolver is used when that level is matched back to cells.

For Git visualization keep the per-tab count collection in `adlo/frontend/src/app/features/git-visualization/utils/heatmapLevelScale.ts` — it clips calendar/activity counts to the same year / `since…until` window the chart renders.

Verification: a CSS text assertion is not enough. Read `getComputedStyle(cell).fill` in a real browser/WebView for both themes, and check that the representative values land on different `--chart-scale-0x` stops.

## Branch categorical palette

**Use** the 12-slot palette in `adlo/frontend/src/app/features/git-visualization/utils/branchLabelColors.ts` and the `--branch-color-01…12` variables in `adlo/frontend/src/styles/regions/rightpanel/git-visualization.css`.

- Consecutive slots are 150° apart on the hue wheel; `oklch(0.48 0.13 <hue>)` keeps white label text readable in both themes.
- The mapping is persisted under `adl-git-vis:branch-colors` in `localStorage`. Valid recorded slots are preserved verbatim, including duplicates once more than 12 branches share the palette; only names without a recorded slot consume a free slot.
- History for temporarily absent branches is retained (bounded to 200 history entries; current branches are never evicted) so a returning branch can reclaim its slot while it is still free.
- Branch labels, left lane segments, and commit nodes MUST all resolve through the same `branchColorMap`; never let one of them fall back to a per-name hash color.

Verification: read `getComputedStyle(label).backgroundColor` and the lane/node `stroke`/`fill` in a real browser/WebView, in both themes, and confirm the current branch set plus an add/remove transition keep existing colors stable.
