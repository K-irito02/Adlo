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

  it('sets color-scheme when transitioning from light to dark', () => {
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.style.colorScheme).toBe('dark');
  });

  it('sets color-scheme when transitioning from dark to light', () => {
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    controller.setTheme({ mode: 'light', resolvedTheme: 'light' });
    expect(root.style.colorScheme).toBe('light');
  });

  it('sets data-theme alongside color-scheme', () => {
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('switches color-scheme both ways', () => {
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.style.colorScheme).toBe('dark');
    controller.setTheme({ mode: 'light', resolvedTheme: 'light' });
    expect(root.style.colorScheme).toBe('light');
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.style.colorScheme).toBe('dark');
  });

  it('does not emit when resolved theme is unchanged on second call', () => {
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setTheme({ mode: 'light', resolvedTheme: 'light' });
    const callCount = listener.mock.calls.length;
    controller.setTheme({ mode: 'light', resolvedTheme: 'light' });
    expect(listener.mock.calls.length).toBe(callCount);
  });
});
