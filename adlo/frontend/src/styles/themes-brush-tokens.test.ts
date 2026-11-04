// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const themesCss = readFileSync(new URL('./themes.css', import.meta.url), 'utf-8');

/** Brace-matched rule blocks for a selector (handles inner braces / repeated selectors). */
function findBlocks(css: string, selector: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from < css.length) {
    const open = css.indexOf(`${selector} {`, from);
    if (open === -1) {
      break;
    }
    const bodyStart = css.indexOf('{', open);
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
    blocks.push(css.slice(open, i));
    from = i;
  }
  return blocks;
}

function valueOf(block: string, token: string): string | undefined {
  return block.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1]?.trim();
}

describe('themes.css brush pattern tokens', () => {
  const lightBlocks = findBlocks(themesCss, "[data-theme='light']");
  const darkBlocks = findBlocks(themesCss, "[data-theme='dark']");

  it('defines the brush pattern tokens in the first (main) light and dark theme blocks', () => {
    const lightBlock = lightBlocks[0];
    const darkBlock = darkBlocks[0];
    expect(lightBlock).toBeDefined();
    expect(darkBlock).toBeDefined();
    expect(lightBlock).toContain('--chart-brush-pattern:');
    expect(lightBlock).toContain('--chart-brush-pattern-opacity:');
    expect(darkBlock).toContain('--chart-brush-pattern:');
    expect(darkBlock).toContain('--chart-brush-pattern-opacity:');
  });

  it('uses different values per theme (guard against cross-theme override regressions)', () => {
    const lightColor = valueOf(lightBlocks[0], '--chart-brush-pattern');
    const darkColor = valueOf(darkBlocks[0], '--chart-brush-pattern');
    const lightOpacity = valueOf(lightBlocks[0], '--chart-brush-pattern-opacity');
    const darkOpacity = valueOf(darkBlocks[0], '--chart-brush-pattern-opacity');
    expect(lightColor).toBe('#94a3b8');
    expect(lightOpacity).toBe('0.5');
    expect(darkColor).toBe('rgba(203, 213, 225, 0.12)');
    expect(darkOpacity).toBe('1');
    expect(lightColor).not.toBe(darkColor);
    expect(lightOpacity).not.toBe(darkOpacity);
  });

  it('keeps the theme-independent :root block free of theme-dependent chart tokens', () => {
    const markerStart = themesCss.indexOf('Theme-Independent Tokens');
    expect(markerStart).toBeGreaterThanOrEqual(0);
    const themeIndependent = themesCss.slice(markerStart);
    expect(themeIndependent).not.toContain('--chart-brush-pattern');
    expect(themeIndependent).not.toContain('--chart-brush-pattern-opacity');
    // Generic guard: no chart token may live after the theme-independent marker
    // (same root cause — a `:root` block overriding themed tokens by cascade order).
    expect(themeIndependent).not.toMatch(/--chart-[a-z0-9-]+:/);
  });

  it('keeps every :root block in themes.css free of theme-dependent chart tokens', () => {
    const rootBlocks = findBlocks(themesCss, ':root');
    expect(rootBlocks.length).toBeGreaterThan(0);
    for (const block of rootBlocks) {
      expect(block).not.toMatch(/--chart-[a-z0-9-]+:/);
    }
  });
});
