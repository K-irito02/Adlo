import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { WorkspaceTabBar } from './WorkspaceTabBar';

const mockSetActiveWorkspaceTab = vi.fn();
const mockRecentWorkspaces: {
  id: string;
  name: string;
  rootPath: string;
  path: string;
  lastOpenedAt: number;
  isPinned: boolean;
  pinnedOrder: number;
  unpinnedOrder: number;
  removedFromSidebar: boolean;
  available: boolean;
}[] = Array.from({ length: 27 }, (_, i) => ({
  id: `workspace-${i + 1}`,
  name: `Workspace ${i + 1}`,
  rootPath: `/path/workspace-${i + 1}`,
  path: `/path/workspace-${i + 1}`,
  lastOpenedAt: Date.now(),
  isPinned: false,
  pinnedOrder: 0,
  unpinnedOrder: i,
  removedFromSidebar: false,
  available: true,
}));

vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeWorkspaceTab: 'workspace-1',
      setActiveWorkspaceTab: mockSetActiveWorkspaceTab,
      recentWorkspaces: mockRecentWorkspaces,
    }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {},
    formatT: vi.fn(),
  })),
}));

afterEach(() => {
  cleanup();
  mockSetActiveWorkspaceTab.mockClear();
  // 隐藏工作区用例会临时追加条目。
  for (let index = mockRecentWorkspaces.length - 1; index >= 0; index -= 1) {
    if (mockRecentWorkspaces[index].removedFromSidebar) {
      mockRecentWorkspaces.splice(index, 1);
    }
  }
});

describe('WorkspaceTabBar', () => {
  it('renders all workspace tabs', () => {
    const { container } = render(<WorkspaceTabBar />);
    const tabs = container.querySelectorAll('.adl-workspace-tab__tab');
    expect(tabs.length).toBe(27);
  });

  it('marks the first tab as active by default', () => {
    const { container } = render(<WorkspaceTabBar />);
    const activeTab = container.querySelector('.adl-workspace-tab__tab--active');
    expect(activeTab).toBeTruthy();
    expect(activeTab?.textContent?.trim()).toBe('Workspace 1');
  });

  it('calls setActiveWorkspaceTab on click', () => {
    const { container } = render(<WorkspaceTabBar />);
    const tabs = container.querySelectorAll('.adl-workspace-tab__tab');
    fireEvent.click(tabs[2]);
    expect(mockSetActiveWorkspaceTab).toHaveBeenCalledWith('workspace-3');
  });

  it('sets title attribute on each tab for tooltip', () => {
    const { container } = render(<WorkspaceTabBar />);
    const firstTab = container.querySelector('.adl-workspace-tab__tab');
    expect(firstTab?.getAttribute('title')).toBe('Workspace 1');
  });

  it('renders pagination dots when tabs overflow', () => {
    const originalFn = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      if (this.classList?.contains('adl-workspace-tab__container')) {
        return { width: 200, height: 32, top: 0, left: 0, right: 200, bottom: 32 } as DOMRect;
      }
      if (this.classList?.contains('adl-workspace-tab__scroll-container')) {
        return { width: 200, height: 32, top: 0, left: 0, right: 200, bottom: 32 } as DOMRect;
      }
      if (this.classList?.contains('adl-workspace-tab__tab')) {
        return { width: 80, height: 32, top: 0, left: 0, right: 80, bottom: 32 } as DOMRect;
      }
      return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 } as DOMRect;
    });

    const { container } = render(<WorkspaceTabBar />);
    const dots = container.querySelectorAll('.adl-workspace-tab__dot');
    expect(dots.length).toBeGreaterThan(1);

    HTMLElement.prototype.getBoundingClientRect = originalFn;
  });

  it('does not render pagination controls when all tabs fit', () => {
    const { container } = render(<WorkspaceTabBar />);
    const tabs = container.querySelectorAll('.adl-workspace-tab__tab');
    expect(tabs.length).toBe(27);
  });

  it('filters out workspaces hidden from the sidebar', () => {
    mockRecentWorkspaces.push({
      id: 'external-hidden',
      name: 'Hidden Downloads',
      rootPath: 'E:/Downloads',
      path: 'E:/Downloads',
      lastOpenedAt: Date.now(),
      isPinned: false,
      pinnedOrder: 0,
      unpinnedOrder: 27,
      removedFromSidebar: true,
      available: true,
    });
    const { container } = render(<WorkspaceTabBar />);
    // 隐藏根不产生标签，也不会改变可见标签的数量。
    expect(container.querySelectorAll('.adl-workspace-tab__tab').length).toBe(27);
    expect(container.textContent).not.toContain('Hidden Downloads');
  });
});
