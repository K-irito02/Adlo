import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { CopyDict } from '../i18n';
import { TCopyProvider } from '../i18n/TCopyContext';
import { useAppStore } from '../stores/slicedStore';
import { StatusBar } from './StatusBar';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function ws(id: string, path: string, name: string): RecentWorkspaceEntry {
  return {
    id,
    path,
    rootPath: path,
    name,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
}

const baseProps = {
  appInfo: undefined,
  currentWorkspace: undefined,
  recentWorkspaces: [] as RecentWorkspaceEntry[],
  gitSnapshot: undefined,
  gitBranches: [],
  modelHealth: undefined,
  isStreaming: false,
  activeRun: undefined,
  workspaceContextMode: 'global' as const,
  onOpenWorkspace: vi.fn(),
  onClearWorkspaceContext: vi.fn(),
  onPickWorkspaceDirectory: vi.fn(),
  onRefreshGitBranches: vi.fn(),
  onSwitchGitBranch: vi.fn(),
  onCreateGitBranch: vi.fn(),
};

beforeEach(() => {
  useAppStore.setState({ providers: [] });
});

function renderStatusBar(count: number) {
  const props = {
    ...baseProps,
    recentWorkspaces: Array.from({ length: count }, (_, i) =>
      ws(`w${i}`, `E:/ws-${i}`, `WS ${i}`),
    ),
  };
  return render(
    <TestProvider>
      <StatusBar {...props} />
    </TestProvider>,
  );
}

function openWorkspaceMenu(container: HTMLElement) {
  const trigger = Array.from(container.querySelectorAll<HTMLElement>('.adl-statusbar__item')).find(
    (item) =>
      item.getAttribute('aria-haspopup') === 'dialog' &&
      !(item as HTMLButtonElement).disabled,
  );
  if (!trigger) {
    throw new Error('workspace menu trigger not found');
  }
  fireEvent.click(trigger);
}

describe('StatusBar recent workspaces', () => {
  it('renders all recent workspaces without truncation', () => {
    const { container } = renderStatusBar(9);
    openWorkspaceMenu(container);
    for (let i = 0; i < 9; i += 1) {
      expect(screen.getByText(`WS ${i}`)).toBeInTheDocument();
    }
  });

  it('does not render a scrollbar with few workspaces', () => {
    const { container } = renderStatusBar(2);
    openWorkspaceMenu(container);
    expect(container.querySelector('.adl-reveal-scrollbar')).toBeNull();
  });

  it('shows the overlay scrollbar on hover when scrollable', () => {
    const { container } = renderStatusBar(9);
    openWorkspaceMenu(container);
    const list = container.querySelector('.adl-statusbar__menu-list') as HTMLElement;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 400 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
    fireEvent.scroll(list);
    fireEvent.mouseEnter(list);
    const track = container.querySelector('.adl-reveal-scrollbar') as HTMLElement;
    expect(track).not.toBeNull();
    expect(track.getAttribute('data-visible')).toBe('true');
  });
});
