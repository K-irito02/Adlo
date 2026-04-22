# Composer Bottom Layout Design

## Scope

Adjust the center-pane bottom interaction area in `ai-digital-life`:

- Make the message composer compact and visually anchored near the bottom.
- Use a capsule-style composer shell.
- Keep the status row directly below the composer, but do not use a capsule style for the status row.
- Reduce both width and height so neither block looks like a large panel.

## Approved Direction

Use a compact bottom-anchored layout:

- The composer and status row stay grouped near the bottom of the center pane.
- The composer becomes a low-height rounded card, not an oversized capsule.
- The composer defaults to a single-line visual height and only grows when content wraps.
- The status row becomes a thin, content-fit inline strip directly under the composer.
- The status row keeps the current information and model switch behavior.
- The final visual treatment may use a floating rounded card instead of a pure capsule if that better matches the shell.

## Layout Rules

- The bottom group should sit close to the lower edge of the center pane, not float in the middle.
- The composer width should be constrained for readability instead of stretching across the full pane.
- The composer should use moderate corner radius and compact vertical padding.
- The composer should visually read as a practical input card instead of a large decorative shell.
- The status row should shrink to the content width and avoid occupying a full-width block.
- The gap between composer and status row should be small so they read as one control group.

## Visual Rules

- Composer: rounded card appearance, soft border, compact interior spacing, balanced horizontal rhythm.
- Composer height must feel intentional and proportional at desktop widths.
- Status row: plain lightweight inline row, low-emphasis text, no pill container.
- Empty-state message above should remain visually separate and not push the bottom group upward more than necessary.

## Interaction Rules

- Existing send / stop / retry behavior stays unchanged.
- Existing model menu behavior stays unchanged.
- Existing tooltip usage stays unchanged.
- Input focus styling should avoid bright blue browser-default rings.
- If the runtime does not provide a visually acceptable native caret, the composer may use a renderer-controlled visible caret while keeping text input behavior unchanged.

## Error Handling

- If the pane becomes narrow, the composer may expand toward available width, but should still prioritize compact height.
- The status row may wrap only as a fallback on small widths.

## Testing

- Typecheck must pass.
- Existing vitest suite must pass.
- Existing workspace-shell Playwright spec must pass.
- E2E assertions should continue to confirm the relocated status row and visible composer.

## Implementation Notes

The implemented result went slightly beyond the original first-pass layout simplification:

- the composer is now a floating bottom control group rather than a normal in-flow footer block
- the prompt field uses a custom visible caret so caret appearance is stable in Electron/Chromium
- the top empty-state helper sentence was removed to keep focus on the bottom interaction group
- panel-collapse motion in the shell was later softened so the composer area is not visually disrupted by side-panel width changes
