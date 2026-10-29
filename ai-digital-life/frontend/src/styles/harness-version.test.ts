// @vitest-environment node
// 通用版本卡片「压暗蓝」提示小字色守卫：旧 `--dsh-note-fg` 推导逐字恢复为
// `--harness-note-fg`（用户特殊设计，2026-10-29 明确批准保留；hint-color 规则的
// “需确认”条件已满足，不视为违规）。改回中性色会让本文件变红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ruleBody, findRuleGroups } from './testing/cssRules';

const harnessCss = readFileSync(new URL('./regions/harness-version.css', import.meta.url), 'utf-8');

describe('harness version note color (user-approved dimmed blue)', () => {
  it('defines the dimmed-blue token on the card scope and the portalled menu', () => {
    const bodies = findRuleGroups(harnessCss, '.adl-harness-version').map((block) =>
      block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')),
    );
    expect(bodies.some((body) => body.includes('--harness-note-fg:'))).toBe(true);
    expect(
      bodies.some((body) =>
        body.includes('--harness-note-fg: color-mix(in srgb, var(--accent) 72%'),
      ),
    ).toBe(true);
    const dark = findRuleGroups(harnessCss, "[data-theme='dark'] .adl-harness-version").map(
      (block) => block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')),
    );
    expect(
      dark.some((body) => body.includes('--harness-note-fg: color-mix(in srgb, var(--accent) 62%')),
    ).toBe(true);
  });

  it('paints row warnings with the dimmed blue, not the neutral text color', () => {
    const body = ruleBody(harnessCss, '.adl-harness-version small.adl-harness-version__row-warn');
    expect(body).not.toBeNull();
    expect(body).toContain('color: var(--harness-note-fg)');
  });

  it('paints the current-version menu item with the dimmed blue', () => {
    const body = ruleBody(harnessCss, '.adl-harness-version__version-menu-item-current');
    expect(body).not.toBeNull();
    expect(body).toContain('color: var(--harness-note-fg)');
  });
});
