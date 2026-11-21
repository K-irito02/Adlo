import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TitleBar } from '../TitleBar';
import type { MenuItem } from '../titleBarMenus';

/**
 * 事项 5 的接线回归：TitleBar 必须把「帮助 → 查看许可证」接到 openAboutLicense。
 * titleBarMenus.test 只证明菜单项会调用传入的回调，这里补上 TitleBar 这一环。
 */

const noop = () => undefined;
const openAboutLicense = vi.hoisted(() => vi.fn());

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: new Proxy({}, { get: (_target, key) => String(key) }),
  }),
}));

vi.mock('@stores/slicedStore', () => {
  const state = {
    leftCollapsed: false,
    rightCollapsed: false,
    toggleLeft: vi.fn(),
    toggleRight: vi.fn(),
    toggleBoth: vi.fn(),
    navigateRightTool: vi.fn(),
    setActiveSettingsGroup: vi.fn(),
    setActiveRightTool: vi.fn(),
    openAboutLicense,
    isTauri: false,
    appInfo: undefined,
  };
  const useAppStore = Object.assign(
    (selector: (snapshot: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return { useAppStore };
});

vi.mock('../../hooks/useAppZoom', () => ({
  useAppZoom: () => ({ zoomBy: vi.fn(), resetZoom: vi.fn() }),
}));

vi.mock('../HamburgerMenu', () => ({
  HamburgerMenu: ({ helpItems }: { helpItems: MenuItem[] }) => {
    const license = helpItems.find((item) => item.id === 'license');
    return (
      <button type="button" onClick={() => license?.action?.()}>
        license
      </button>
    );
  },
}));
vi.mock('../WindowControls', () => ({ WindowControls: () => null }));
vi.mock('../TitleBarNotifications', () => ({ TitleBarNotifications: () => null }));
vi.mock('../CenterTabStrip', () => ({ CenterTabStrip: () => null }));
vi.mock('../../components/Tooltip', () => ({
  TooltipSimple: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('TitleBar license menu wiring', () => {
  it('invokes openAboutLicense from the help menu', () => {
    render(
      <TitleBar
        onOpenSettings={noop}
        onTriggerCreateWorkspace={noop}
        onOpenFolder={noop}
        isOpeningWorkspace={false}
      />,
    );

    fireEvent.click(screen.getByText('license'));

    expect(openAboutLicense).toHaveBeenCalledTimes(1);
  });
});
