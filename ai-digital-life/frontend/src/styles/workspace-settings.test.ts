// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const settingsCss = readFileSync(new URL('./components/settings.css', import.meta.url), 'utf-8');
const hintCardCss = readFileSync(new URL('./components/hintCard.css', import.meta.url), 'utf-8');

function ruleBody(css: string, selector: string): string | null {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    return null;
  }
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('workspace settings styles (narrow input + right angles + merged-card cleanup)', () => {
  it('provides a narrow modifier for the numeric input', () => {
    const body = ruleBody(settingsCss, '.adl-settings-input--narrow');
    expect(body).not.toBeNull();
    const widthMatch = /width:\s*(\d+)px/.exec(body!);
    expect(widthMatch).not.toBeNull();
    expect(Number(widthMatch![1])).toBeLessThan(200);
  });

  it('keeps settings inputs right-angled with --radius-sm', () => {
    const body = ruleBody(settingsCss, '.adl-settings-input');
    expect(body).not.toBeNull();
    expect(body).toContain('var(--radius-sm)');
  });

  it('makes workspace tags and the empty drop zone right-angled', () => {
    const item = ruleBody(settingsCss, '.adl-sortable-item');
    const empty = ruleBody(settingsCss, '.adl-sortable-empty');
    expect(item).not.toBeNull();
    expect(empty).not.toBeNull();
    expect(item).toContain('var(--radius-sm)');
    expect(empty).toContain('var(--radius-sm)');
    expect(item).not.toContain('var(--radius-md)');
    expect(empty).not.toContain('var(--radius-md)');
  });

  it('drops dead grid-card rules after the four blocks merged into one', () => {
    expect(settingsCss).not.toContain('.workspace-grid--cards');
    expect(settingsCss).not.toContain('.adl-settings-card--grid');
  });

  it('workspace block header drops the divider and heavy spacing to the card', () => {
    const header = ruleBody(settingsCss, '.adl-settings-workspace__header');
    expect(header).not.toBeNull();
    expect(header).not.toContain('border-bottom');
    expect(header).not.toContain('padding-bottom');
    // 真正的分隔线在内层 SettingsHeader 上（外层容器本就没有）
    const inner = ruleBody(settingsCss, '.adl-settings-workspace__header .adl-settings-header');
    expect(inner).not.toBeNull();
    expect(inner).toContain('border-bottom: none');
    expect(inner).toContain('padding-bottom: 0');
  });

  it('tightens the gap between the workspace title block and the card', () => {
    const body = ruleBody(settingsCss, '.adl-settings-section.adl-settings-workspace');
    expect(body).not.toBeNull();
    expect(body).toContain('gap: var(--space-3)');
  });

  it('drops the divider between the max-concurrent row and the lists', () => {
    const body = ruleBody(
      settingsCss,
      '.adl-settings-workspace .adl-settings-card > .adl-settings-row--flush',
    );
    expect(body).not.toBeNull();
    expect(body).toContain('border-bottom: none');
  });

  it('keeps grid columns from blowing out on long workspace names', () => {
    const body = ruleBody(settingsCss, '.workspace-grid > .adl-sortable-section');
    expect(body).not.toBeNull();
    expect(body).toContain('min-width: 0');
  });

  it('matches the empty drop zone box to a real workspace item', () => {
    const empty = ruleBody(settingsCss, '.adl-sortable-empty');
    const item = ruleBody(settingsCss, '.adl-sortable-item');
    expect(empty).not.toBeNull();
    expect(item).not.toBeNull();
    const paddingOf = (s: string) =>
      /padding:\s*([^;]+);/.exec(s)?.[1]?.replace(/\s+/g, ' ').trim();
    expect(paddingOf(empty!)).toBe(paddingOf(item!));
    expect(empty).toContain('font-size: var(--text-sm)');
  });

  it('provides a titled section style for hint cards', () => {
    const title = ruleBody(hintCardCss, '.hint-card__title');
    expect(title).not.toBeNull();
    expect(title).toContain('font-weight');
    expect(hintCardCss).toContain('.hint-card__title:first-child');
    expect(hintCardCss).toContain('.hint-card__title + .hint-card__line');
  });

  it('keeps settings nav hover on the light surface token', () => {
    const hover = ruleBody(settingsCss, '.adl-settings-nav__row:hover');
    expect(hover).not.toBeNull();
    expect(hover).toContain('background: var(--surface-hover)');
  });

  it('paints a selected settings nav row deeper than hover (file-tree bg-active)', () => {
    const active = ruleBody(settingsCss, '.adl-settings-nav__row.is-active');
    expect(active).not.toBeNull();
    expect(active).toContain('background: var(--bg-active)');
    expect(active).not.toContain('pastel-neutral-bg');
  });

  it('keeps a selected settings nav row deep while hovered', () => {
    const activeHover = ruleBody(settingsCss, '.adl-settings-nav__row.is-active:hover');
    expect(activeHover).not.toBeNull();
    expect(activeHover).toContain('background: var(--bg-active)');
  });

  it('matches a selected nav item to the row and keeps its bold label', () => {
    const item = ruleBody(settingsCss, '.adl-settings-nav__item.is-active');
    expect(item).not.toBeNull();
    expect(item).toContain('font-weight: var(--font-semibold)');
    // 背景由 row.is-active 控制，item 层不设——防止 bg-active 透明叠色
    expect(item).not.toContain('background');
  });

  it('composes list hints with a shared intro title and single-newline sections', () => {
    const src = readFileSync(
      new URL('../app/features/workspace-settings/WorkspaceSettings.tsx', import.meta.url),
      'utf-8',
    );
    expect(src).toContain('listHintIntroTitle');
    expect(src).not.toContain('\\n\\n${t.');
  });
});
