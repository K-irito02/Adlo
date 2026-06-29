import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeController } from '../theme';

describe('ThemeController color-scheme', () => {
  let controller: ThemeController;
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
    const mq = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList;
    controller = new ThemeController({ root, systemDarkQuery: mq });
  });

  afterEach(() => {
    controller.dispose();
  });

  it('sets color-scheme to dark when resolved theme is dark', () => {
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.style.colorScheme).toBe('dark');
  });

  it('sets color-scheme to light when resolved theme is light', () => {
    controller.setTheme({ mode: 'light', resolvedTheme: 'light' });
    expect(root.style.colorScheme).toBe('light');
  });

  it('sets data-theme attribute alongside color-scheme', () => {
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('switches color-scheme when theme changes', () => {
    controller.setTheme({ mode: 'light', resolvedTheme: 'light' });
    expect(root.style.colorScheme).toBe('light');
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.style.colorScheme).toBe('dark');
  });
});
