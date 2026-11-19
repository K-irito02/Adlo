import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TCopyProvider } from '@i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zhCN as t } from '@i18n/zh-CN';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import { useAppStore } from '@stores/slicedStore';
import { WorkspaceFileTreeEntry } from '../WorkspaceFileTreeEntry';

const noop = vi.fn();
const persistRef = { current: false };
const highlightRef: { current: (() => void) | undefined } = { current: undefined };

const workspace = {
  id: 'ws-empty',
  name: 'empty-ws',
  path: 'C:/tmp/empty-ws',
  rootPath: 'C:/tmp/empty-ws',
  lastOpenedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  status: 'ready',
  type: 'unknown',
  gitSnapshot: {
    isRepo: false,
    branch: null,
    ahead: null,
    behind: null,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
    head: null,
    capturedAt: 1,
  },
} as unknown as RecentWorkspaceEntry;

function renderEntry(overrides: { isLoading?: boolean } = {}) {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <WorkspaceFileTreeEntry
        workspace={workspace}
        isCurrent={false}
        isExpanded
        treeNodes={[]}
        isLoading={overrides.isLoading ?? false}
        isRefreshing={false}
        error={undefined}
        selectedFilePath={undefined}
        selectedFileWorkspaceId={undefined}
        clickedPath={undefined}
        expandedPaths={{}}
        dirtyPaths={new Set()}
        externalChangePath={undefined}
        onToggleExpand={noop}
        onSelectWorkspace={noop}
        onHideFromRightPanels={noop}
        onRefreshTree={noop}
        onToggleFileTreePath={noop}
        onOpenFile={noop}
        onNodeClicked={noop}
        getContextMenuItems={() => []}
        contextMenuPersistRef={persistRef}
        clearMenuHighlightRef={highlightRef}
        expandLabel="expand"
        collapseLabel="collapse"
        t={t}
      />
    </TCopyProvider>,
  );
}

describe('WorkspaceFileTreeEntry empty branch', () => {
  it('uses the workspace-level empty message, not the global no-workspace one', () => {
    renderEntry();
    expect(screen.getByText(t.workspaceTreeEmpty)).toBeTruthy();
    expect(screen.queryByText(t.workspaceEmpty)).toBeNull();
  });

  it('shows the loading row instead of the empty message while loading', () => {
    renderEntry({ isLoading: true });
    expect(screen.queryByText(t.workspaceTreeEmpty)).toBeNull();
    expect(screen.getByText(t.loading)).toBeTruthy();
  });
});

describe('WorkspaceFileTreeEntry work区菜单粘贴', () => {
  const originalDuplicate = useAppStore.getState().duplicateWorkspaceFile;

  afterEach(() => {
    useAppStore.setState({ duplicateWorkspaceFile: originalDuplicate });
    useAppStore.getState().clearClipboard();
  });

  it('无剪贴板时「粘贴」禁用，有剪贴板时可用', () => {
    renderEntry();
    fireEvent.click(screen.getByLabelText(t.fileMoreActions));

    expect(screen.getByRole('menuitem', { name: t.fileContextPaste })).toBeDisabled();

    act(() => {
      useAppStore.getState().setClipboard('copy', 'a.txt', 'file', 'C:/tmp/empty-ws');
    });
    expect(screen.getByRole('menuitem', { name: t.fileContextPaste })).toBeEnabled();
  });

  it('粘贴到工作区根目录：目标相对路径 = 源文件名', async () => {
    const duplicate = vi.fn(async () => {});
    useAppStore.setState({ duplicateWorkspaceFile: duplicate });
    useAppStore.getState().setClipboard('copy', 'docs/a.txt', 'file', 'C:/tmp/empty-ws');
    renderEntry();
    fireEvent.click(screen.getByLabelText(t.fileMoreActions));

    fireEvent.click(screen.getByRole('menuitem', { name: t.fileContextPaste }));

    await waitFor(() =>
      expect(duplicate).toHaveBeenCalledWith('docs/a.txt', 'a.txt', 'C:/tmp/empty-ws'),
    );
  });
});
