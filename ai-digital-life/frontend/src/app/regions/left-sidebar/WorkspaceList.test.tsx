import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import type { CopyDict } from '../../i18n/types';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import { WorkspaceList } from './WorkspaceList';

// DOM containers must be cleaned up between tests — otherwise
// document.querySelector returns the first match from a prior test's render.
afterEach(cleanup);

// WorkspaceList calls useTCopy(), which requires a TCopyProvider in scope.
// Mock the copy dict with a Proxy that returns the key for any access —
// sufficient for rendering without depending on real i18n strings.
// Cast via `unknown` because `Record<string, string>` is not structurally
// assignable to `CopyDict` (which has ~1296 specific keys); the Proxy
// satisfies the runtime contract of `Record<CopyKey, string>`.
const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

// Build a minimal RecentWorkspaceEntry. Only the fields WorkspaceList reads.
function buildItem(
  id: string,
  overrides: Partial<RecentWorkspaceEntry> = {},
): RecentWorkspaceEntry {
  return {
    id,
    path: `/path/${id}`,
    rootPath: `/path/${id}`,
    name: id,
    lastOpenedAt: Date.now(),
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
    ...overrides,
  };
}

function buildProps(overrides: Partial<Parameters<typeof WorkspaceList>[0]> = {}) {
  return {
    workspaceItems: [] as RecentWorkspaceEntry[],
    currentWorkspace: undefined,
    onReorderWorkspaces: vi.fn(),
    onPinWorkspace: vi.fn(),
    onUnpinWorkspace: vi.fn(),
    onTriggerCreateWorkspace: vi.fn(),
    onContextMenu: vi.fn(),
    ...overrides,
  };
}

describe('WorkspaceList rendering', () => {
  it('renders items in workspaceItems order on initial mount', () => {
    const items = [buildItem('a'), buildItem('b'), buildItem('c')];
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items })} />
      </TestProvider>,
    );
    const list = document.querySelector('.adl-workspace-list');
    expect(list).not.toBeNull();
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id'),
    );
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('filters out entries removed from the sidebar', () => {
    const items = [buildItem('a'), buildItem('b', { removedFromSidebar: true }), buildItem('c')];
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items })} />
      </TestProvider>,
    );
    const ids = Array.from(document.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id'),
    );
    expect(ids).toEqual(['a', 'c']);
  });

  it('shows an empty hint when there are no visible workspaces', () => {
    render(
      <TestProvider>
        <WorkspaceList {...buildProps()} />
      </TestProvider>,
    );
    expect(document.querySelector('.adl-empty-hint')).not.toBeNull();
  });

  it('marks the current workspace row as current by id', () => {
    const items = [buildItem('a'), buildItem('b')];
    render(
      <TestProvider>
        <WorkspaceList
          {...buildProps({
            workspaceItems: items,
            currentWorkspace: { id: 'b', path: '/path/b' },
          })}
        />
      </TestProvider>,
    );
    const rows = Array.from(document.querySelectorAll('li[data-ws-id]'));
    expect(rows[0]!.className).not.toContain('is-current');
    expect(rows[1]!.className).toContain('is-current');
  });

  it('marks the current workspace row as current by normalized path', () => {
    const items = [buildItem('legacy', { path: 'E:\\Live-Workspace' })];
    render(
      <TestProvider>
        <WorkspaceList
          {...buildProps({
            workspaceItems: items,
            currentWorkspace: { id: 'workspace_live', path: 'E:/live-workspace' },
          })}
        />
      </TestProvider>,
    );
    const row = document.querySelector('li[data-ws-id]');
    expect(row!.className).toContain('is-current');
  });
});

describe('WorkspaceList localOrder sync', () => {
  it('preserves current order when an item is removed externally', () => {
    const items = [buildItem('a'), buildItem('b'), buildItem('c')];
    const { rerender } = render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items })} />
      </TestProvider>,
    );

    // Remove 'b' externally.
    const nextItems = [buildItem('a'), buildItem('c')];
    rerender(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: nextItems })} />
      </TestProvider>,
    );

    const list = document.querySelector('.adl-workspace-list');
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id'),
    );
    expect(ids).toEqual(['a', 'c']);
  });

  it('appends new items at the end when added externally', () => {
    const items = [buildItem('a'), buildItem('b')];
    const { rerender } = render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items })} />
      </TestProvider>,
    );

    const nextItems = [buildItem('a'), buildItem('b'), buildItem('c'), buildItem('d')];
    rerender(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: nextItems })} />
      </TestProvider>,
    );

    const list = document.querySelector('.adl-workspace-list');
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id'),
    );
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('re-syncs order when an item is unpinned externally and workspaceItems re-sorts', () => {
    const items = [buildItem('p1', { isPinned: true }), buildItem('u1')];
    const { rerender } = render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items })} />
      </TestProvider>,
    );

    // Backend re-sorts on unpin: p1 becomes unpinned, moves after u1.
    const nextItems = [buildItem('u1'), buildItem('p1')];
    rerender(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: nextItems })} />
      </TestProvider>,
    );

    const list = document.querySelector('.adl-workspace-list');
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id'),
    );
    expect(ids).toEqual(['u1', 'p1']);
  });
});

describe('WorkspaceList workspace row actions', () => {
  it('calls onPinWorkspace when unpinned row pin is clicked', () => {
    const onPin = vi.fn();
    const items = [buildItem('a', { isPinned: false })];
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items, onPinWorkspace: onPin })} />
      </TestProvider>,
    );

    fireEvent.click(document.querySelector('.adl-workspace-row__pin')!);

    expect(onPin).toHaveBeenCalledWith('a');
  });

  it('calls onUnpinWorkspace when pinned row pin is clicked', () => {
    const onUnpin = vi.fn();
    const items = [buildItem('a', { isPinned: true })];
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items, onUnpinWorkspace: onUnpin })} />
      </TestProvider>,
    );

    fireEvent.click(document.querySelector('.adl-workspace-row__pin')!);

    expect(onUnpin).toHaveBeenCalledWith('a');
  });

  it('opens the context menu when a row is right-clicked', () => {
    const onContextMenu = vi.fn();
    const items = [buildItem('a')];
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items, onContextMenu })} />
      </TestProvider>,
    );

    fireEvent.contextMenu(document.querySelector('.adl-workspace-row')!, {
      clientX: 11,
      clientY: 22,
    });

    expect(onContextMenu).toHaveBeenCalledWith('a', 11, 22);
  });

  it('opens the context menu when the row more button is clicked', () => {
    const onContextMenu = vi.fn();
    const items = [buildItem('a')];
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items, onContextMenu })} />
      </TestProvider>,
    );

    const button = document.querySelector('.adl-workspace-row__actions .adl-icon-btn');
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0]![0]).toBe('a');
  });

  it('triggers create workspace from the toolbar plus button', () => {
    const onTriggerCreateWorkspace = vi.fn();
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ onTriggerCreateWorkspace })} />
      </TestProvider>,
    );

    const button = document.querySelector('.adl-workspace-toolbar .adl-icon-btn');
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    expect(onTriggerCreateWorkspace).toHaveBeenCalledTimes(1);
  });
});

describe('WorkspaceList mouseup persistence', () => {
  it('does not call onReorderWorkspaces when no drag happened', () => {
    const onReorder = vi.fn();
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ onReorderWorkspaces: onReorder })} />
      </TestProvider>,
    );
    // Simulate a stray pointerup with no preceding mousedown (hook listens on window).
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onReorder).not.toHaveBeenCalled();
  });
});
