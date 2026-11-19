import { describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import { render } from '@testing-library/react';
import { IconFolderPlus } from '@icons';
import { MultiWorkspaceFileTree } from '@features/workspace-file-tree/MultiWorkspaceFileTree';
import { MultiWorkspaceChangesTree } from '@features/workspace-changes-tree/MultiWorkspaceChangesTree';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      workspaceEmptyAddWorkspacePrefix: 'PREFIX',
      workspaceEmptyAddWorkspaceSuffix: 'SUFFIX',
    },
    locale: 'zh-CN',
    formatT: vi.fn(),
  }),
}));

const noop = () => {};
const persistRef = { current: false } as MutableRefObject<boolean>;
const clearMenuRef = { current: undefined } as MutableRefObject<(() => void) | undefined>;

function expectFolderPlusIcon(container: HTMLElement) {
  const actual = container.querySelector('.adl-empty-hint__icon svg');
  expect(actual).not.toBeNull();
  const { container: reference } = render(<IconFolderPlus size={14} decorative />);
  expect(actual?.innerHTML).toBe(reference.querySelector('svg')?.innerHTML);
}

describe('无工作区空态提示', () => {
  it('文件面板渲染「标题栏添加工作区」提示，并嵌入同款图标', () => {
    const { container } = render(
      <MultiWorkspaceFileTree
        workspaces={[]}
        activeWorkspaceId={undefined}
        treeData={{}}
        loadingStates={{}}
        errorStates={{}}
        expandedStates={{}}
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

    expect(container.textContent).toContain('PREFIX');
    expect(container.textContent).toContain('SUFFIX');
    expectFolderPlusIcon(container);
  });

  it('变更面板渲染「标题栏添加工作区」提示，并嵌入同款图标', () => {
    const { container } = render(
      <MultiWorkspaceChangesTree
        workspaces={[]}
        activeWorkspaceId={undefined}
        expandedStates={{}}
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

    expect(container.textContent).toContain('PREFIX');
    expect(container.textContent).toContain('SUFFIX');
    expectFolderPlusIcon(container);
  });
});
