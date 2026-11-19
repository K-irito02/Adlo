import { describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import { render } from '@testing-library/react';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import { MultiWorkspaceFileTree } from '@features/workspace-file-tree/MultiWorkspaceFileTree';
import { MultiWorkspaceChangesTree } from '@features/workspace-changes-tree/MultiWorkspaceChangesTree';
import { MultiWorkspaceTreeShell } from '@features/multi-workspace/MultiWorkspaceTreeShell';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: new Proxy({}, { get: (_target, key) => String(key) }),
    locale: 'zh-CN',
    formatT: (value: string) => value,
  }),
}));

const noop = () => {};
const persistRef = { current: false } as MutableRefObject<boolean>;
const clearMenuRef = { current: undefined } as MutableRefObject<(() => void) | undefined>;

function makeWorkspace(id: string): RecentWorkspaceEntry {
  return {
    id,
    path: `C:/${id}`,
    rootPath: `C:/${id}`,
    name: id,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
}

const workspaces = ['ws-1', 'ws-2', 'ws-3'].map(makeWorkspace);
const expandedStates = { 'ws-1': true, 'ws-3': true };

describe('右侧导航树工作区标题吸顶', () => {
  it('文件面板开启吸顶修饰类', () => {
    const { container } = render(
      <MultiWorkspaceFileTree
        workspaces={workspaces}
        activeWorkspaceId={undefined}
        treeData={{}}
        loadingStates={{}}
        errorStates={{}}
        expandedStates={expandedStates}
        selectedFilePath={undefined}
        selectedFileWorkspaceId={undefined}
        clickedPath={undefined}
        clickedWorkspaceId={undefined}
        expandedPaths={{}}
        dirtyPaths={new Set()}
        externalChangePath={undefined}
        onToggleExpand={noop}
        onRefreshOne={noop}
        onSelectWorkspace={noop}
        onHideFromRightPanels={noop}
        onToggleFileTreePath={noop}
        onOpenFileForWorkspace={noop}
        onNodeClicked={noop}
        getContextMenuItems={() => []}
        contextMenuPersistRef={persistRef}
        clearMenuHighlightRef={clearMenuRef}
      />,
    );

    const shell = container.querySelector('.adl-multitree');
    expect(shell?.classList.contains('adl-multitree--sticky-headers')).toBe(true);
    expect(shell?.classList.contains('adl-multitree--dnd')).toBe(true);
  });

  it('变更面板开启吸顶修饰类', () => {
    const { container } = render(
      <MultiWorkspaceChangesTree
        workspaces={workspaces}
        activeWorkspaceId={undefined}
        expandedStates={expandedStates}
        treeData={{}}
        loadingStates={{}}
        errorStates={{}}
        selectedChangePreviewPath={undefined}
        selectedChangePreviewWorkspaceId={undefined}
        clickedPath={undefined}
        clickedWorkspaceId={undefined}
        expandedPaths={{}}
        dirtyPaths={new Set()}
        externalChangePath={undefined}
        onToggleExpand={noop}
        onRefreshOne={noop}
        changeCounts={{}}
        onHideFromRightPanels={noop}
        onToggleFileTreePath={noop}
        onOpenChangePreview={noop}
        onNodeClicked={noop}
        onWorkspaceRootClick={noop}
        onClearSelection={noop}
        getContextMenuItems={() => []}
        contextMenuPersistRef={persistRef}
        clearMenuHighlightRef={clearMenuRef}
      />,
    );

    const shell = container.querySelector('.adl-multitree');
    expect(shell?.classList.contains('adl-multitree--sticky-headers')).toBe(true);
    // 变更面板不支持拖拽（只保留吸顶与共享显示顺序）。
    expect(shell?.classList.contains('adl-multitree--dnd')).toBe(false);
  });

  it('默认不开启吸顶与拖拽（空态 shell 保持原行为）', () => {
    const { container } = render(
      <MultiWorkspaceTreeShell
        visibleWorkspaces={[]}
        expandedState={{}}
        emptyText={null}
        onClearSelection={noop}
        renderContent={() => null}
      />,
    );

    const shell = container.querySelector('.adl-multitree');
    expect(shell?.classList.contains('adl-multitree--sticky-headers')).toBe(false);
    expect(shell?.classList.contains('adl-multitree--dnd')).toBe(false);
  });
});
