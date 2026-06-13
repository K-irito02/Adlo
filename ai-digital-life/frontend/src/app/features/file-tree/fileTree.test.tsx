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
      />
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
      />
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
      />
    );

    expect(markup).toContain('is-selected');
    expect(markup).not.toContain('is-context-menu-target');
  });
});
