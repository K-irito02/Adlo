import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import type { CopyDict } from '../../i18n/types';
import type { SidebarWorkspaceItem } from '../../utils/sidebarViewModel';
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

// Build a minimal SidebarWorkspaceItem. Only the fields WorkspaceList reads.
function buildItem(id: string, isPinned = false, isCurrent = false): SidebarWorkspaceItem {
  return {
    workspace: {
      id,
      path: `/path/${id}`,
      rootPath: `/path/${id}`,
      name: id,
      lastOpenedAt: Date.now(),
      isPinned,
      pinnedOrder: 0,
      unpinnedOrder: 0,
      removedFromSidebar: false,
      available: true,
      hiddenFromRightPanels: false,
    },
    isCurrent,
    sessions: [],
    archivedSessions: [],
    rollupStatus: 'read',
    statusCounts: { processing: 0, 'pending-approval': 0, abnormal: 0, completed: 0, read: 0 },
  };
}

function buildProps(overrides: Partial<Parameters<typeof WorkspaceList>[0]> = {}) {
  return {
    workspaceItems: [] as SidebarWorkspaceItem[],
    expandedSessionWorkspaces: {},
    toggleSessionWorkspace: vi.fn(),
    onReorderWorkspaces: vi.fn(),
    onSwitchToWorkspace: vi.fn(),
    onPinWorkspace: vi.fn(),
    onUnpinWorkspace: vi.fn(),
    onCreateSession: vi.fn(),
    onTriggerCreateWorkspace: vi.fn(),
    onSelectSession: vi.fn(),
    onContextMenu: vi.fn(),
    renderSessionRows: () => null,
    workspaceToolbarRef: { current: null },
    ...overrides,
  };
}

describe('WorkspaceList localOrder sync', () => {
  it('renders items in workspaceItems order on initial mount', () => {
    const items = [buildItem('a'), buildItem('b'), buildItem('c')];
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items })} />
      </TestProvider>
    );
    const list = document.querySelector('.adl-workspace-list');
    expect(list).not.toBeNull();
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id')
    );
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('preserves current order when an item is removed externally', () => {
    const items = [buildItem('a'), buildItem('b'), buildItem('c')];
    const { rerender } = render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items })} />
      </TestProvider>
    );

    // Remove 'b' externally.
    const nextItems = [buildItem('a'), buildItem('c')];
    rerender(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: nextItems })} />
      </TestProvider>
    );

    const list = document.querySelector('.adl-workspace-list');
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id')
    );
    expect(ids).toEqual(['a', 'c']);
  });

  it('appends new items at the end when added externally', () => {
    const items = [buildItem('a'), buildItem('b')];
    const { rerender } = render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items })} />
      </TestProvider>
    );

    const nextItems = [buildItem('a'), buildItem('b'), buildItem('c'), buildItem('d')];
    rerender(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: nextItems })} />
      </TestProvider>
    );

    const list = document.querySelector('.adl-workspace-list');
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id')
    );
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('re-syncs order when an item is unpinned externally and workspaceItems re-sorts', () => {
    const items = [buildItem('p1', true), buildItem('u1', false)];
    const { rerender } = render(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: items })} />
      </TestProvider>
    );

    // Backend re-sorts on unpin: p1 becomes unpinned, moves after u1.
    const nextItems = [buildItem('u1', false), buildItem('p1', false)];
    rerender(
      <TestProvider>
        <WorkspaceList {...buildProps({ workspaceItems: nextItems })} />
      </TestProvider>
    );

    const list = document.querySelector('.adl-workspace-list');
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id')
    );
    expect(ids).toEqual(['u1', 'p1']);
  });
});

describe('WorkspaceList mouseup persistence', () => {
  it('does not call onReorderWorkspaces when no drag happened', () => {
    const onReorder = vi.fn();
    render(
      <TestProvider>
        <WorkspaceList {...buildProps({ onReorderWorkspaces: onReorder })} />
      </TestProvider>
    );
    // Simulate a stray mouseup with no preceding mousedown.
    fireEvent.mouseUp(document);
    expect(onReorder).not.toHaveBeenCalled();
  });
});
