// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const centerCss = readFileSync(new URL('./regions/center.css', import.meta.url), 'utf-8');

function findRuleGroups(css: string, selector: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from < css.length) {
    const open = css.indexOf(selector, from);
    if (open === -1) {
      break;
    }
    from = open + selector.length;
    const lastCommentEnd = css.lastIndexOf('*/', open);
    const lastCommentStart = css.lastIndexOf('/*', open);
    if (lastCommentStart > lastCommentEnd) {
      continue;
    }
    const prev = open === 0 ? '' : css[open - 1];
    if (prev && !/[\s,{>+~]/.test(prev)) {
      continue;
    }
    const groupStart = Math.max(css.lastIndexOf('}', open), css.lastIndexOf(';', open)) + 1;
    const bodyStart = css.indexOf('{', open);
    if (bodyStart === -1) {
      break;
    }
    let depth = 1;
    let i = bodyStart + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') {
        depth += 1;
      } else if (css[i] === '}') {
        depth -= 1;
      }
      i += 1;
    }
    blocks.push(css.slice(groupStart, i));
  }
  return blocks;
}

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
