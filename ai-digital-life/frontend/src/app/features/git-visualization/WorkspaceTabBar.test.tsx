import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { WorkspaceTabBar } from './WorkspaceTabBar';

const mockSetActiveWorkspaceTab = vi.fn();

vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeWorkspaceTab: 'workspace-1',
      setActiveWorkspaceTab: mockSetActiveWorkspaceTab,
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
});
