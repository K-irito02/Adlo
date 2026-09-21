import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FileTree } from './fileTree';
import type { FileTreeRenderableNode } from './fileTree.utils';

describe('FileTree', () => {
  it('renders the shared tree row chrome inside the dedicated scroll wrapper', () => {
    const nodes: FileTreeRenderableNode[] = [
      {
        path: 'src',
        name: 'src',
        kind: 'directory',
        children: [
          {
            path: 'src/file.ts',
            name: 'file.ts',
            kind: 'file',
            children: [],
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <FileTree
        nodes={nodes}
        selectedFilePath="src/file.ts"
        expandedPaths={{ src: true }}
        onToggle={() => undefined}
        onOpenFile={() => undefined}
        expandLabel="Expand"
        collapseLabel="Collapse"
      />,
    );

    expect(markup).toContain('adl-filetree-scroll');
    expect(markup).toContain('adl-filetree-scrollbar');
    expect(markup).toContain('adl-tree-root');
    expect(markup).toContain('adl-tree-node__toggle');
    expect(markup).toContain('adl-filetree__row');
    expect(markup).toContain('adl-tree-node is-selected');
  });

  it('renders multiple nodes with proper structure', () => {
    const nodes: FileTreeRenderableNode[] = [
      {
        path: 'src',
        name: 'src',
        kind: 'directory',
        children: [
          {
            path: 'src/utils.ts',
            name: 'utils.ts',
            kind: 'file',
            children: [],
          },
          {
            path: 'src/components',
            name: 'components',
            kind: 'directory',
            children: [
              {
                path: 'src/components/Button.tsx',
                name: 'Button.tsx',
                kind: 'file',
                children: [],
              },
            ],
          },
        ],
      },
      {
        path: 'README.md',
        name: 'README.md',
        kind: 'file',
        children: [],
      },
    ];

    const markup = renderToStaticMarkup(
      <FileTree
        nodes={nodes}
        selectedFilePath="src/utils.ts"
        expandedPaths={{ src: true, 'src/components': true }}
        onToggle={() => undefined}
        onOpenFile={() => undefined}
        expandLabel="Expand"
        collapseLabel="Collapse"
      />,
    );

    expect(markup).toContain('utils.ts');
    expect(markup).toContain('Button.tsx');
    expect(markup).toContain('README.md');
    expect(markup).toContain('adl-tree-node is-selected');
  });

  it('renders context menu target state', () => {
    const nodes: FileTreeRenderableNode[] = [
      {
        path: 'src/file.ts',
        name: 'file.ts',
        kind: 'file',
        children: [],
      },
    ];

    const markup = renderToStaticMarkup(
      <FileTree
        nodes={nodes}
        selectedFilePath="src/file.ts"
        expandedPaths={{}}
        onToggle={() => undefined}
        onOpenFile={() => undefined}
        expandLabel="Expand"
        collapseLabel="Collapse"
      />,
    );

    expect(markup).toContain('is-selected');
    expect(markup).not.toContain('is-context-menu-target');
  });

  it('highlights an extra selected path (clicked directory) alongside the active file', () => {
    const nodes: FileTreeRenderableNode[] = [
      {
        path: 'src',
        name: 'src',
        kind: 'directory',
        children: [
          {
            path: 'src/file.ts',
            name: 'file.ts',
            kind: 'file',
            children: [],
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <FileTree
        nodes={nodes}
        selectedFilePath="src/file.ts"
        extraSelectedPath="src"
        activePathIsWeak
        expandedPaths={{ src: true }}
        onToggle={() => undefined}
        onOpenFile={() => undefined}
        expandLabel="Expand"
        collapseLabel="Collapse"
      />,
    );

    // 点击选中的目录（extraSelectedPath）为强选中；编辑器当前打开的文件为弱选中
    expect(markup.match(/adl-tree-node is-selected/g)).toHaveLength(1);
    expect(markup).toContain('adl-tree-node is-weak-selected');
  });

  it('weak mode: clicked file is strong, editor-active file is weak (deselectable)', () => {
    const nodes: FileTreeRenderableNode[] = [
      {
        path: 'src/file.ts',
        name: 'file.ts',
        kind: 'file',
        children: [],
      },
      {
        path: 'src/other.ts',
        name: 'other.ts',
        kind: 'file',
        children: [],
      },
    ];

    const clickedMarkup = renderToStaticMarkup(
      <FileTree
        nodes={nodes}
        selectedFilePath="src/file.ts"
        extraSelectedPath="src/file.ts"
        activePathIsWeak
        expandedPaths={{}}
        onToggle={() => undefined}
        onOpenFile={() => undefined}
        expandLabel="Expand"
        collapseLabel="Collapse"
      />,
    );
    // 点击的文件同时是编辑器文件：强选中与弱选中同时保留，
    // 弱选中（淡蓝）标识"被当前编辑器打开"，不因点击而被屏蔽
    expect(clickedMarkup.match(/adl-tree-node is-selected/g)).toHaveLength(1);
    expect(clickedMarkup).toContain('adl-tree-node is-selected is-weak-selected');

    const noClickedMarkup = renderToStaticMarkup(
      <FileTree
        nodes={nodes}
        selectedFilePath="src/file.ts"
        extraSelectedPath={undefined}
        activePathIsWeak
        expandedPaths={{}}
        onToggle={() => undefined}
        onOpenFile={() => undefined}
        expandLabel="Expand"
        collapseLabel="Collapse"
      />,
    );
    // 点击外部清除 extraSelectedPath 后：编辑器文件仅保留弱选中，不再强选中
    expect(noClickedMarkup).not.toContain('adl-tree-node is-selected');
    expect(noClickedMarkup).toContain('adl-tree-node is-weak-selected');
  });

  it('legacy mode: active file remains strongly selected when no click selection is tracked', () => {
    const nodes: FileTreeRenderableNode[] = [
      {
        path: 'src/file.ts',
        name: 'file.ts',
        kind: 'file',
        children: [],
      },
    ];

    const markup = renderToStaticMarkup(
      <FileTree
        nodes={nodes}
        selectedFilePath="src/file.ts"
        expandedPaths={{}}
        onToggle={() => undefined}
        onOpenFile={() => undefined}
        expandLabel="Expand"
        collapseLabel="Collapse"
      />,
    );

    expect(markup).toContain('adl-tree-node is-selected');
    expect(markup).not.toContain('is-weak-selected');
  });
});
