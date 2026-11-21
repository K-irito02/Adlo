import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TitleBar } from '../TitleBar';

/**
 * 事项 5：添加工作区加载态的接线回归。
 *
 * CSS 契约测试（`styles/add-workspace-spinner.test.ts`）只读样式文本，删掉
 * `is-loading` 拼接它仍会全绿；这里渲染真实按钮，断言加载态的 class 与 Spinner
 * 都随 `isOpeningWorkspace` 出现。
 */

const noop = () => undefined;

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
    isTauri: false,
    appInfo: undefined,
  };
  const useAppStore = Object.assign(
    (selector: (snapshot: typeof state) => unknown) => selector(state),
    {
      getState: () => state,
    },
  );
  return { useAppStore };
});

vi.mock('../../hooks/useAppZoom', () => ({
  useAppZoom: () => ({ zoomBy: vi.fn(), resetZoom: vi.fn() }),
}));

vi.mock('../HamburgerMenu', () => ({ HamburgerMenu: () => null }));
vi.mock('../WindowControls', () => ({ WindowControls: () => null }));
vi.mock('../TitleBarNotifications', () => ({ TitleBarNotifications: () => null }));
vi.mock('../CenterTabStrip', () => ({ CenterTabStrip: () => null }));
vi.mock('../titleBarMenus', () => ({
  useFileMenuItems: () => [],
  useViewMenuItems: () => [],
  useHelpMenuItems: () => [],
}));
vi.mock('../../components/Tooltip', () => ({
  TooltipSimple: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function renderTitleBar(isOpeningWorkspace: boolean) {
  return render(
    <TitleBar
      onOpenSettings={noop}
      onTriggerCreateWorkspace={noop}
      onOpenFolder={noop}
      isOpeningWorkspace={isOpeningWorkspace}
    />,
  );
}

describe('TitleBar 添加工作区加载态', () => {
  it('打开中：按钮带 is-loading 且渲染 Spinner', () => {
    renderTitleBar(true);

    const button = screen.getByRole('button', { name: 'loading' });
    expect(button.className).toContain('is-loading');
    expect(button.querySelector('.adl-spinner')).not.toBeNull();
  });

  it('空闲：按钮不带 is-loading，渲染文件夹图标', () => {
    renderTitleBar(false);

    const button = screen.getByRole('button', { name: 'addWorkspace' });
    expect(button.className).not.toContain('is-loading');
    expect(button.querySelector('.adl-spinner')).toBeNull();
  });
});
