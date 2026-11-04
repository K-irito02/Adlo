// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ruleBody } from './testing/cssRules';

const themesCss = readFileSync(new URL('./themes.css', import.meta.url), 'utf-8');
const settingsCss = readFileSync(new URL('./components/settings.css', import.meta.url), 'utf-8');
// 不用 indexOf：亮色块注释里也出现过 "[data-theme='dark']" 字样，必须匹配真正的规则块。
const darkStart = themesCss.search(/\[data-theme='dark'\]\s*\{/);
const lightCss = themesCss.slice(0, darkStart);
const darkCss = themesCss.slice(darkStart);

const TONES = ['success', 'info', 'warning', 'danger'] as const;

function variable(css: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  return match?.[1] ?? null;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('settings status badge palette', () => {
  it.each(TONES)('%s compact badge uses dedicated tokens (both themes)', (tone) => {
    for (const [theme, css] of [
      ['light', lightCss],
      ['dark', darkCss],
    ] as const) {
      expect(variable(css, `--status-badge-${tone}-bg`), `${theme} bg`).not.toBeNull();
      expect(variable(css, `--status-badge-${tone}-fg`), `${theme} fg`).not.toBeNull();
    }
    const compact = ruleBody(
      settingsCss,
      `.adl-settings-status--compact.adl-settings-status--${tone}`,
    );
    expect(compact).not.toBeNull();
    expect(compact).toContain(`var(--status-badge-${tone}-bg)`);
    expect(compact).toContain(`--adl-row-label-color: var(--status-badge-${tone}-fg)`);
    // 通用 pastel 仍服务长文本状态块，紧凑徽章不得再共享它们。
    expect(compact).not.toContain('--pastel-');
    // 非紧凑（句级文案）保持旧 pastel，避免高饱和色块过度强调。
    const base = ruleBody(settingsCss, `.adl-settings-status--${tone}`);
    expect(base).toContain('--pastel-');
  });

  it.each(TONES)('%s badge text keeps WCAG AA contrast in both themes', (tone) => {
    for (const [theme, css] of [
      ['light', lightCss],
      ['dark', darkCss],
    ] as const) {
      const bg = variable(css, `--status-badge-${tone}-bg`);
      const fg = variable(css, `--status-badge-${tone}-fg`);
      expect(bg, `${theme} bg`).not.toBeNull();
      expect(fg, `${theme} fg`).not.toBeNull();
      expect(contrast(fg as string, bg as string), `${theme} ${tone}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(TONES)('%s badge separates from the real card surface in both themes', (tone) => {
    for (const [theme, css] of [
      ['light', lightCss],
      ['dark', darkCss],
    ] as const) {
      const bg = variable(css, `--status-badge-${tone}-bg`) as string;
      const card = variable(css, '--surface-raised') as string;
      // 旧 pastel 与 --surface-raised 仅 1.11–1.15（亮）/ 1.04–1.14（暗），用户反馈“糊在一起”；
      // 1.25 是回归底线。
      expect(contrast(bg, card), `${theme} ${tone} bg vs card`).toBeGreaterThanOrEqual(1.25);
    }
  });

  it.each(TONES)('%s dark badge is visibly deeper than its light counterpart', (tone) => {
    const lightBg = variable(lightCss, `--status-badge-${tone}-bg`) as string;
    const darkBg = variable(darkCss, `--status-badge-${tone}-bg`) as string;
    expect(darkBg).not.toBe(lightBg);
    expect(luminance(darkBg)).toBeLessThan(luminance(lightBg));
  });

  it('adds an inset outline to compact pills so the edge stays visible', () => {
    const body = ruleBody(settingsCss, '.adl-settings-status--compact');
    expect(body).not.toBeNull();
    expect(body).toContain('box-shadow: inset 0 0 0 1px');
  });

  it('keeps the generic label-text selector at 0-2-1 and reads the tone via a custom property', () => {
    // 通用规则若加 :not() 会升到 0-3-1，压掉 DSH/OpenCode 的 0-3-0 摘要守卫。
    expect(settingsCss).toMatch(
      /\.adl-settings-row__label > \.adl-settings-row__label-text span,\s*\n\s*\.adl-settings-row__label > \.adl-settings-row__label-text label\s*\{/,
    );
    expect(settingsCss).not.toMatch(/label-text span:not\(/);
    expect(settingsCss).toContain('color: var(--adl-row-label-color, var(--text-primary))');
  });
});
