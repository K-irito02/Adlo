import { describe, it, expect, beforeEach } from 'vitest';
import { persistField } from '../persisted/apply';
import { hydrateAll, resetHydrationForTest } from '../persisted/hydrate';
import { flushCrossSliceWrites } from '../storageHelpers';
import type { LightMarkdownTheme, DarkMarkdownTheme } from '../slices/uiSliceTypes';

describe('MarkdownTheme', () => {
  it('accepts the light group values', () => {
    const themes: LightMarkdownTheme[] = ['light', 'light-colorblind'];
    expect(themes).toHaveLength(2);
  });

  it('accepts the dark group values', () => {
    const themes: DarkMarkdownTheme[] = [
      'dark',
      'dark-dimmed',
      'dark-high-contrast',
      'dark-colorblind',
    ];
    expect(themes).toHaveLength(4);
  });
});

describe('markdownTheme persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('defaults to light/dark when nothing is stored', () => {
    expect(hydrateAll().patch.lightMarkdownTheme).toBe('light');
    expect(hydrateAll().patch.darkMarkdownTheme).toBe('dark');
  });

  it('restores persisted light and dark themes independently', () => {
    persistField('adl:files.markdownThemeLight', 'light-colorblind');
    persistField('adl:files.markdownThemeDark', 'dark-dimmed');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.lightMarkdownTheme).toBe('light-colorblind');
    expect(hydrateAll().patch.darkMarkdownTheme).toBe('dark-dimmed');
  });

  it('falls back to defaults for invalid values', () => {
    localStorage.setItem('adl:files.markdownThemeLight', '"bogus"');
    localStorage.setItem('adl:files.markdownThemeDark', '"light"');
    expect(hydrateAll().patch.lightMarkdownTheme).toBe('light');
    // 亮暗不混用：暗组拒绝亮组取值，回退 dark
    expect(hydrateAll().patch.darkMarkdownTheme).toBe('dark');
  });
});
