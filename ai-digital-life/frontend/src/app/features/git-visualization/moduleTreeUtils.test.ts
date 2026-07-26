import { describe, it, expect } from 'vitest';
import {
  buildModuleTree,
  getChildrenAtPath,
  childrenToHeatmapColumns,
  flattenTreePaths,
} from './moduleTreeUtils';

describe('buildModuleTree', () => {
  it('should build tree from flat paths', () => {
    const paths = [
      'src/components/bar.tsx',
      'src/components/foo.tsx',
      'src/utils/helpers.ts',
      'docs/README.md',
      'package.json',
    ];
    const tree = buildModuleTree(paths);

    expect(tree.isDir).toBe(true);
    expect(tree.children.length).toBe(3); // docs, src, package.json

    const docs = tree.children[0];
    expect(docs.name).toBe('docs');
    expect(docs.isDir).toBe(true);

    const src = tree.children[1];
    expect(src.name).toBe('src');
    expect(src.isDir).toBe(true);

    const pkg = tree.children[2];
    expect(pkg.name).toBe('package.json');
    expect(pkg.isDir).toBe(false);
  });

  it('should handle empty paths', () => {
    const tree = buildModuleTree([]);
    expect(tree.children.length).toBe(0);
  });

  it('should handle single file at root', () => {
    const tree = buildModuleTree(['readme.md']);
    expect(tree.children.length).toBe(1);
    expect(tree.children[0].name).toBe('readme.md');
    expect(tree.children[0].isDir).toBe(false);
  });

  it('should sort directories before files', () => {
    const paths = ['a-file.ts', 'z-dir/something.ts', 'm-dir/other.ts'];
    const tree = buildModuleTree(paths);
    expect(tree.children[0].isDir).toBe(true); // m-dir or z-dir
    expect(tree.children[1].isDir).toBe(true); // whichever is second
    expect(tree.children[2].isDir).toBe(false); // a-file.ts
  });

  it('should handle backslash paths', () => {
    const paths = ['src\\components\\bar.tsx', 'src\\components\\foo.tsx'];
    const tree = buildModuleTree(paths);
    expect(tree.children.length).toBe(1);
    expect(tree.children[0].name).toBe('src');
    expect(tree.children[0].children.length).toBe(1);
    expect(tree.children[0].children[0].name).toBe('components');
    expect(tree.children[0].children[0].children.length).toBe(2);
  });
});

describe('getChildrenAtPath', () => {
  const paths = [
    'src/components/bar.tsx',
    'src/components/foo.tsx',
    'src/utils/helpers.ts',
    'docs/readme.md',
  ];
  const tree = buildModuleTree(paths);

  it('should return root children for empty path', () => {
    const children = getChildrenAtPath(tree, []);
    expect(children.length).toBe(2); // src, docs
  });

  it('should drill into src', () => {
    const children = getChildrenAtPath(tree, ['src']);
    expect(children.length).toBe(2); // components, utils
  });

  it('should drill into src/components', () => {
    const children = getChildrenAtPath(tree, ['src', 'components']);
    expect(children.length).toBe(2); // bar.tsx, foo.tsx
    expect(children[0].isDir).toBe(false);
  });

  it('should return empty for non-existent path', () => {
    const children = getChildrenAtPath(tree, ['nonexistent']);
    expect(children.length).toBe(0);
  });
});

describe('childrenToHeatmapColumns', () => {
  const matrix = [
    {
      author: 'Alice',
      authorEmail: 'alice@test.com',
      modules: [
        { module: 'src/components/bar.tsx', count: 3 },
        { module: 'src/components/foo.tsx', count: 2 },
        { module: 'src/utils/helpers.ts', count: 1 },
      ],
    },
    {
      author: 'Bob',
      authorEmail: 'bob@test.com',
      modules: [
        { module: 'src/components/bar.tsx', count: 1 },
        { module: 'docs/readme.md', count: 4 },
      ],
    },
  ];

  const tree = buildModuleTree([
    'src/components/bar.tsx',
    'src/components/foo.tsx',
    'src/utils/helpers.ts',
    'docs/readme.md',
  ]);

  it('should aggregate counts at root level', () => {
    const children = getChildrenAtPath(tree, []);
    const { columns, rowLabels, columnMeta } = childrenToHeatmapColumns(children, matrix);

    expect(rowLabels).toEqual(['Alice', 'Bob']);
    expect(columns.length).toBe(2); // src, docs

    const srcCol = columns.find((c) => c.columnLabel === 'src')!;
    expect(srcCol.bins[0].count).toBe(6); // Alice: 3+2+1
    expect(srcCol.bins[1].count).toBe(1); // Bob: 1

    expect(columnMeta).toEqual([{ isDir: true }, { isDir: true }]);
  });

  it('should aggregate at deeper level', () => {
    const children = getChildrenAtPath(tree, ['src', 'components']);
    const { columns, columnMeta } = childrenToHeatmapColumns(children, matrix);

    expect(columns.length).toBe(2); // bar.tsx, foo.tsx
    const barCol = columns.find((c) => c.columnLabel === 'bar.tsx')!;
    expect(barCol.bins[0].count).toBe(3); // Alice
    expect(barCol.bins[1].count).toBe(1); // Bob

    expect(columnMeta).toEqual([{ isDir: false }, { isDir: false }]);
  });

  it('should handle empty children', () => {
    const { columns, rowLabels, columnMeta } = childrenToHeatmapColumns([], matrix);
    expect(columns.length).toBe(0);
    expect(rowLabels.length).toBe(2);
    expect(columnMeta).toEqual([]);
  });

  it('should handle empty matrix', () => {
    const children = getChildrenAtPath(tree, []);
    const { columns, rowLabels, columnMeta } = childrenToHeatmapColumns(children, []);
    expect(columns.length).toBe(2);
    expect(rowLabels.length).toBe(0);
    for (const col of columns) {
      expect(col.bins.length).toBe(0);
    }
    expect(columnMeta).toEqual([{ isDir: true }, { isDir: true }]);
  });
});

describe('flattenTreePaths', () => {
  it('should round-trip through buildModuleTree', () => {
    const paths = [
      'src/components/bar.tsx',
      'src/components/foo.tsx',
      'src/utils/helpers.ts',
      'docs/readme.md',
    ];
    const tree = buildModuleTree(paths);
    const flattened = flattenTreePaths(tree);
    expect(flattened.sort()).toEqual([...paths].sort());
  });

  it('should return empty for empty tree', () => {
    const tree = buildModuleTree([]);
    expect(flattenTreePaths(tree)).toEqual([]);
  });
});
