import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import type { BookmarkFolder } from '@stores/slices/browserTypes';
import { BrowserTreeDndOverlay } from '../BrowserTreeDndOverlay';
import { useBrowserTreeDnd } from '../useBrowserTreeDnd';
import type { BrowserCategoryState, BrowserTreeNode } from '../types';

function folderNode(id: string, name: string, children: BrowserTreeNode[] = []): BrowserTreeNode {
  return {
    path: `folder:${id}`,
    name,
    kind: 'directory',
    children,
    nodeType: 'folder',
    folderId: id,
  };
}

function category(label: string, nodes: BrowserTreeNode[]): BrowserCategoryState {
  return { label, nodes };
}

function makeFolder(id: string, name: string): BookmarkFolder {
  return { id, name, createdAt: 0, entries: [] };
}

function Harness({
  categories,
  targetId,
  onRowClick,
}: {
  categories: {
    workspaceCategory: BrowserCategoryState;
    userFolderCategory: BrowserCategoryState;
    historyCategory: BrowserCategoryState;
  };
  targetId: string;
  onRowClick?: () => void;
}) {
  const dnd = useBrowserTreeDnd(categories);
  return (
    <div className="adl-browser-tree-dnd-root" {...dnd.handlers} data-testid="root">
      <div data-path="folder:f-a" data-testid="row-a" onClick={onRowClick}>
        A
      </div>
      <div data-path={targetId} data-testid="row-target">
        Target
      </div>
      <div data-path="folder:f-c" data-testid="row-c">
        C
      </div>
      <div data-dnd-category="userFolder" data-testid="custom-header">
        Custom
      </div>
      <BrowserTreeDndOverlay indicator={dnd.indicator} />
    </div>
  );
}

function setRect(element: HTMLElement, height = 40): void {
  element.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 200,
      bottom: height,
      width: 200,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

type ElementFromPointDocument = Document & {
  elementFromPoint?: (x: number, y: number) => Element | null;
};

function withElementFromPoint<T>(target: HTMLElement, run: () => T): T {
  const doc = document as ElementFromPointDocument;
  const original = doc.elementFromPoint;
  doc.elementFromPoint = () => target;
  try {
    return run();
  } finally {
    doc.elementFromPoint = original;
  }
}

function moveTo(source: HTMLElement, target: HTMLElement, clientY: number): void {
  withElementFromPoint(target, () => {
    fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 0, clientY, pointerId: 1 });
  });
}

function dropAt(target: HTMLElement, clientY: number): void {
  withElementFromPoint(target, () => {
    fireEvent.pointerUp(window, { clientX: 0, clientY, pointerId: 1 });
  });
}

describe('useBrowserTreeDnd', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('moves a folder into another folder', () => {
    const move = vi.fn().mockReturnValue({ ok: true });
    const toast = vi.fn();
    useAppStore.setState({
      browserBookmarkFolders: [makeFolder('f-a', 'A'), makeFolder('f-b', 'B')],
      browserWorkspaceBookmarks: {},
      browserBookmarkChildOrder: {},
      browserMoveBookmarkNode: move,
      showToast: toast,
    });

    const categories = {
      workspaceCategory: category('Workspace', []),
      userFolderCategory: category('Custom', [folderNode('f-a', 'A'), folderNode('f-b', 'B')]),
      historyCategory: category('History', []),
    };

    render(<Harness categories={categories} targetId="folder:f-b" />);

    const source = screen.getByTestId('row-a');
    const target = screen.getByTestId('row-target');
    setRect(source);
    setRect(target);
    moveTo(source, target, 20);
    dropAt(target, 20);

    expect(move).toHaveBeenCalledWith({
      kind: 'folder',
      id: 'f-a',
      target: { kind: 'into', container: 'folder:f-b' },
    });
    expect(document.querySelector('.adl-browser-dnd-lift')).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('rejects a folder moving into its own descendant', () => {
    const move = vi.fn();
    const toast = vi.fn();
    useAppStore.setState({
      browserBookmarkFolders: [
        makeFolder('f-a', 'A'),
        { ...makeFolder('f-b', 'B'), parentId: 'f-a', parentType: 'folder' },
      ],
      browserWorkspaceBookmarks: {},
      browserBookmarkChildOrder: {},
      browserMoveBookmarkNode: move,
      showToast: toast,
    });

    const categories = {
      workspaceCategory: category('Workspace', []),
      userFolderCategory: category('Custom', [folderNode('f-a', 'A', [folderNode('f-b', 'B')])]),
      historyCategory: category('History', []),
    };

    render(<Harness categories={categories} targetId="folder:f-b" />);

    const source = screen.getByTestId('row-a');
    const target = screen.getByTestId('row-target');
    setRect(source);
    setRect(target);
    moveTo(source, target, 20);
    expect(document.body.classList.contains('adl-browser-dnd-not-allowed')).toBe(true);
    expect(screen.queryByText('Folder into descendant')).toBeNull();
    dropAt(target, 20);

    expect(move).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('marks the history category as a disabled drop target', () => {
    const move = vi.fn();
    useAppStore.setState({
      browserBookmarkFolders: [makeFolder('f-a', 'A')],
      browserWorkspaceBookmarks: {},
      browserBookmarkChildOrder: {},
      browserMoveBookmarkNode: move,
      showToast: vi.fn(),
    });
    const categories = {
      workspaceCategory: category('Workspace', []),
      userFolderCategory: category('Custom', [folderNode('f-a', 'A')]),
      historyCategory: category('History', []),
    };

    render(<Harness categories={categories} targetId="history-entry:h1" />);

    const source = screen.getByTestId('row-a');
    const target = screen.getByTestId('row-target');
    setRect(source);
    setRect(target);
    moveTo(source, target, 20);
    expect(document.body.classList.contains('adl-browser-dnd-not-allowed')).toBe(true);
    dropAt(target, 20);

    expect(move).not.toHaveBeenCalled();
    expect(document.body.classList.contains('adl-browser-dnd-not-allowed')).toBe(false);
    expect(document.querySelector('.adl-browser-dnd-lift')).toBeNull();
  });

  it('does not suppress a plain click', () => {
    const onClick = vi.fn();
    useAppStore.setState({
      browserBookmarkFolders: [makeFolder('f-a', 'A')],
      browserWorkspaceBookmarks: {},
      browserBookmarkChildOrder: {},
      browserMoveBookmarkNode: vi.fn(),
      showToast: vi.fn(),
    });
    const categories = {
      workspaceCategory: category('Workspace', []),
      userFolderCategory: category('Custom', [folderNode('f-a', 'A')]),
      historyCategory: category('History', []),
    };

    render(<Harness categories={categories} targetId="folder:f-b" onRowClick={onClick} />);

    const source = screen.getByTestId('row-a');
    fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.click(source);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows a lifted copy while the original row stays in place', () => {
    useAppStore.setState({
      browserBookmarkFolders: [makeFolder('f-a', 'A'), makeFolder('f-b', 'B')],
      browserWorkspaceBookmarks: {},
      browserBookmarkChildOrder: {},
      browserMoveBookmarkNode: vi.fn().mockReturnValue({ ok: true }),
      showToast: vi.fn(),
    });
    const categories = {
      workspaceCategory: category('Workspace', []),
      userFolderCategory: category('Custom', [folderNode('f-a', 'A'), folderNode('f-b', 'B')]),
      historyCategory: category('History', []),
    };

    render(<Harness categories={categories} targetId="folder:f-b" />);

    const source = screen.getByTestId('row-a');
    const target = screen.getByTestId('row-target');
    setRect(source);
    setRect(target);
    moveTo(source, target, 20);
    expect(document.querySelector('.adl-browser-dnd-lift')).not.toBeNull();
    expect(screen.getByTestId('row-a')).toBeInTheDocument();
    // 指示器必须 portal 到 body：面板容器的 transform 会成为 fixed 包含块，
    // 留在面板内会让视口坐标二次偏移（真实应用表现为高亮/插入线错位一行）。
    const overlay = document.querySelector('.adl-browser-dnd-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.parentElement).toBe(document.body);
  });

  it('turns a folder into a custom top-level folder via the category header', () => {
    const move = vi.fn().mockReturnValue({ ok: true });
    const toast = vi.fn();
    useAppStore.setState({
      browserBookmarkFolders: [makeFolder('f-a', 'A')],
      browserWorkspaceBookmarks: {},
      browserBookmarkChildOrder: {},
      browserMoveBookmarkNode: move,
      showToast: toast,
    });

    const categories = {
      workspaceCategory: category('Workspace', []),
      userFolderCategory: category('Custom', [folderNode('f-a', 'A')]),
      historyCategory: category('History', []),
    };

    render(<Harness categories={categories} targetId="folder:f-b" />);

    const source = screen.getByTestId('row-a');
    const header = screen.getByTestId('custom-header');
    setRect(source);
    setRect(header, 24);
    moveTo(source, header, 12);
    dropAt(header, 12);

    expect(move).toHaveBeenCalledWith({
      kind: 'folder',
      id: 'f-a',
      target: { kind: 'new-root' },
    });
    expect(toast).not.toHaveBeenCalled();
  });
});
