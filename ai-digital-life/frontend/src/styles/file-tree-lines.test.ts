// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const fileTreeLinesCss = readFileSync(
  new URL('./regions/rightpanel/file-tree-lines.css', import.meta.url),
  'utf-8',
);
const rightPanelCss = readFileSync(new URL('./regions/rightpanel.css', import.meta.url), 'utf-8');
const fileTreeCss = readFileSync(
  new URL('./regions/rightpanel/file-tree.css', import.meta.url),
  'utf-8',
);

/**
 * Brace-matched rule blocks for a selector.
 * Handles selectors that share one rule group (comma-separated).
 */
function findRuleGroups(css: string, selector: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from < css.length) {
    const open = css.indexOf(selector, from);
    if (open === -1) {
      break;
    }
    // Scan back to the start of this selector list (previous `}` or `;` or EOF)
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
    from = i;
  }
  return blocks;
}

describe('file-tree toggle alignment (chevron tip vs trunk line)', () => {
  it('clears the horizontal margin on .adl-filetree__toggle in file-tree-lines.css', () => {
    // Root cause: files-navigator.css sets margin-left/right:2px on the toggle
    // (designed for a 16px box). file-tree-lines.css widens it to 20px but must
    // also clear that horizontal margin so the 20px toggle center lands exactly
    // on the 18px+indent trunk line (expanded chevron tip aligned). Because
    // file-tree-lines.css is imported after files-navigator.css, an explicit
    // margin:0 here wins the cascade for the file-tree toggle only (the generic
    // .adl-tree-node__toggle margin used by the outline tree is untouched).
    const linesGroups = findRuleGroups(fileTreeLinesCss, '.adl-filetree__toggle');
    expect(linesGroups.length).toBeGreaterThan(0);
    // Accept explicit margin:0 shorthand or margin-left/right/inline-start:0.
    const explicit = linesGroups.find(
      (g) =>
        /margin\s*:\s*0/.test(g) ||
        (/margin-left\s*:\s*0/.test(g) && /margin-right\s*:\s*0/.test(g)) ||
        /margin-inline\s*:\s*0/.test(g),
    );
    expect(explicit).toBeDefined();
  });

  it('imports file-tree-lines.css (via file-tree.css) after files-navigator.css', () => {
    // The override only wins if file-tree-lines.css is loaded after
    // files-navigator.css (equal specificity, source order decides).
    const navIdx = rightPanelCss.indexOf("'./rightpanel/files-navigator.css'");
    const treeIdx = rightPanelCss.indexOf("'./rightpanel/file-tree.css'");
    expect(navIdx).toBeGreaterThanOrEqual(0);
    expect(treeIdx).toBeGreaterThan(navIdx);
    const coreIdx = fileTreeCss.indexOf("'./file-tree-core.css'");
    const linesIdx = fileTreeCss.indexOf("'./file-tree-lines.css'");
    expect(coreIdx).toBeGreaterThanOrEqual(0);
    expect(linesIdx).toBeGreaterThan(coreIdx);
  });

  it('keeps the file-tree trunk line at 18px + indent', () => {
    expect(fileTreeLinesCss).toContain('left: calc(18px + var(--adl-tree-indent, 0px));');
  });

  it('keeps the toggle box at 20px (center = 18px + indent when margin is zero)', () => {
    const groups = findRuleGroups(fileTreeLinesCss, '.adl-filetree__toggle');
    const all = groups.join('\n');
    expect(all).toMatch(/width:\s*20px/);
  });
});
