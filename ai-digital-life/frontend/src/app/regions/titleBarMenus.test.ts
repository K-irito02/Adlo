import { describe, expect, it, vi } from 'vitest';
import { useFileMenuItems, useHelpMenuItems, useViewMenuItems } from './titleBarMenus';
import { zhCN } from '../i18n/zh-CN';

Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });

const t = zhCN;

describe('titleBarMenus derived shortcuts', () => {
  it('file menu contains only new/open/exit (panels moved to view)', () => {
    const items = useFileMenuItems(t, {}, vi.fn(), vi.fn(), vi.fn());
    expect(items.map((i) => i.id)).toEqual(['new-ws', 'open-folder', 'sep-1', 'exit']);
  });

  it('view menu hosts the four open-panel rows with derived shortcuts', () => {
    const items = useViewMenuItems(t, {}, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    const ids = items.filter((i) => !i.separator).map((i) => i.id);
    expect(ids).toEqual([
      'open-files-panel',
      'open-changes-panel',
      'open-browser-panel',
      'open-terminal-panel',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'settings',
    ]);
    expect(items.find((i) => i.id === 'open-terminal-panel')?.shortcut).toBe('Ctrl+Shift+`');
    expect(items.find((i) => i.id === 'settings')?.shortcut).toBe('Ctrl+Shift+Comma');
  });

  it('help menu drops palette, keeps shortcuts row without chord text', () => {
    const items = useHelpMenuItems(t, {}, vi.fn());
    expect(items.map((i) => i.id)).toEqual(['shortcuts', 'license']);
    expect(items.find((i) => i.id === 'shortcuts')?.shortcut).toBeUndefined();
  });

  it('shortcuts row shows a hint once the user binds settings.shortcuts', () => {
    const items = useHelpMenuItems(t, { 'settings.shortcuts': 'mod+k' }, vi.fn());
    expect(items.find((i) => i.id === 'shortcuts')?.shortcut).toBe('Ctrl+K');
  });

  it('reflects user-customized keybinds', () => {
    const items = useViewMenuItems(
      t,
      { 'zoom.reset': 'mod+r' },
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    expect(items.find((i) => i.id === 'zoom-reset')?.shortcut).toBe('Ctrl+R');
  });
});
