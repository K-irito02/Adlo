// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { findRuleGroups } from './testing/cssRules';

const centerCss = readFileSync(new URL('./regions/center.css', import.meta.url), 'utf-8');

describe('welcome recent-workspaces reveal scrollbar', () => {
  it('caps the welcome scroll container above the natural height of 3 rows', () => {
    // Root cause: the welcome recent list renders ~37.5px per row (grid button
    // with icon/name/path + baseline alignment), so 3 rows + 2 gaps measure
    // ~120.5px in a real browser. A max-height of 106px (based on an earlier
    // under-estimate of ~32.4px per row) clipped 3 workspaces and made the
    // container scrollable, so hovering revealed the overlay scrollbar even
    // though the content fits. The StatusBar workspace menu (145px cap) was
    // unaffected because its 3 options + gaps measure ~137px.
    //
    // Guard: the cap must sit between 3 rows (~120.5px) and 4 rows
    // (~120.5px + 37.5px + 4px = ~162px) so exactly 3 workspaces never scroll
    // while 4+ still do.
    const groups = findRuleGroups(centerCss, '.adl-welcome__recent-scroll');
    expect(groups.length).toBeGreaterThan(0);
    const all = groups.join('\n');
    const match = /max-height:\s*([0-9.]+)px/.exec(all);
    expect(match).not.toBeNull();
    const value = Number(match![1]);
    expect(value).toBeGreaterThanOrEqual(121);
    expect(value).toBeLessThan(162);
  });
});

describe('.adl-message-stream layout', () => {
  it('spans the full cross-axis width instead of shrinking to its child (react-window List) width', () => {
    // Root cause: the message stream is a flex item of `.adl-center__body`
    // (flex-direction: column). `margin: 0 auto` + `max-width: 900px` told it
    // to size to its content, but its only child is the react-window `<List>`
    // (position: relative with absolutely-positioned rows plus a `width: 100%`
    // spacer), which contributes zero intrinsic width. The column therefore
    // collapsed to ~10px, stacking every message row vertically (a single
    // assistant row measured 6061px tall) — content invisible, scrollbar
    // appearing in the middle of the center pane instead of at its right edge.
    //
    // Guard: the stream must resolve to the parent's width (width: 100% +
    // min-width: 0) so the List's own scrollbar sits at the center pane's
    // right edge. `margin: 0 auto` and `max-width` on this container are the
    // exact properties that caused the collapse and must not return.
    const groups = findRuleGroups(centerCss, '.adl-message-stream');
    expect(groups.length).toBeGreaterThan(0);
    const all = groups.join('\n');
    expect(all).toMatch(/width:\s*100%/);
    expect(all).toMatch(/min-width:\s*0/);
    expect(all).not.toMatch(/margin:\s*0\s*auto/);
    expect(all).not.toMatch(/max-width/);
  });
});
