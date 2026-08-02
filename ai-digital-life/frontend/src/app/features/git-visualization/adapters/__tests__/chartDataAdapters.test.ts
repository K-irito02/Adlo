import { describe, it, expect } from 'vitest';
import {
  adaptSunburstData,
  adaptHotspotsTree,
  filterFilesByPath,
  computeArcFill,
} from '../chartDataAdapters';
import type { GitVisFileHotspotNode, GitVisFileHotspotFile } from '@/shared/ipc/workspace';

describe('adaptSunburstData', () => {
  it('unwraps { tree } wrapper from backend payload', () => {
    const input = {
      tree: {
        name: 'root',
        type: 'directory',
        children: [{ name: 'src', type: 'directory', children: [] }],
      },
    };
    const result = adaptSunburstData(input);
    expect(result.name).toBe('root');
    expect(result.children).toHaveLength(1);
    expect(result.children?.[0].name).toBe('src');
  });

  it('maps size to value recursively on leaf nodes', () => {
    const input = {
      tree: {
        name: 'root',
        type: 'directory',
        children: [{ name: 'main.js', type: 'file', size: 120 }],
      },
    };
    const result = adaptSunburstData(input);
    expect(result.children?.[0].value).toBe(120);
  });

  it('drops the type field from output nodes', () => {
    const input = {
      tree: {
        name: 'root',
        type: 'directory',
        children: [{ name: 'f.js', type: 'file', size: 1 }],
      },
    };
    const result = adaptSunburstData(input);
    expect((result as unknown as Record<string, unknown>).type).toBeUndefined();
    expect(result.children?.[0]).not.toHaveProperty('type');
  });

  it('returns empty root for null/undefined/{} input', () => {
    expect(adaptSunburstData(null)).toEqual({ name: '', children: [] });
    expect(adaptSunburstData(undefined)).toEqual({ name: '', children: [] });
    expect(adaptSunburstData({})).toEqual({ name: '', children: [] });
  });

  it('accepts bare root node without { tree } wrapper', () => {
    const input = { name: 'root', children: [{ name: 'a', size: 1 }] };
    const result = adaptSunburstData(input);
    expect(result.name).toBe('root');
    expect(result.children?.[0].value).toBe(1);
  });
});

describe('adaptHotspotsTree', () => {
  const buildNode = (overrides: Partial<GitVisFileHotspotNode> = {}): GitVisFileHotspotNode => ({
    name: 'root',
    nodeType: 'directory',
    changeCount: 10,
    additions: 20,
    deletions: 5,
    lastModified: '2026-08-01',
    children: [],
    ...overrides,
  });

  it('filters out file leaves and keeps directories', () => {
    const root = buildNode({
      changeCount: 30,
      children: [
        buildNode({
          name: 'src',
          nodeType: 'directory',
          changeCount: 30,
          children: [
            buildNode({
              name: 'engine.ts',
              nodeType: 'file',
              changeCount: 24,
              children: undefined,
            }),
            buildNode({
              name: 'core',
              nodeType: 'directory',
              changeCount: 6,
              children: [
                buildNode({
                  name: 'lib.ts',
                  nodeType: 'file',
                  changeCount: 6,
                  children: undefined,
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const { tree, arcMeta } = adaptHotspotsTree(root);

    // root + src + core (3 directories), engine.ts and lib.ts filtered out
    expect(tree.name).toBe('root');
    expect(tree.value).toBe(30);
    expect(tree.children).toHaveLength(1);
    expect(tree.children?.[0].name).toBe('src');
    expect(tree.children?.[0].children).toHaveLength(1);
    expect(tree.children?.[0].children?.[0].name).toBe('core');
    expect(tree.children?.[0].children?.[0].children).toEqual([]);

    // arcMeta excludes root (matches buildArcs' depth > 0): src + core only
    expect(arcMeta.size).toBeGreaterThanOrEqual(2);
  });

  it('keeps directories that become empty after filtering as leaf nodes', () => {
    const root = buildNode({
      changeCount: 10,
      children: [
        buildNode({
          name: 'empty-dir',
          nodeType: 'directory',
          changeCount: 5,
          children: [
            buildNode({
              name: 'only-file.ts',
              nodeType: 'file',
              changeCount: 5,
              children: undefined,
            }),
          ],
        }),
      ],
    });

    const { tree } = adaptHotspotsTree(root);
    // empty-dir's only child is a file, so after filtering empty-dir has empty children.
    // The directory is kept as a leaf node (children: []) so it still renders as an arc
    // on the sunburst — downstream consumers iterate arcMeta by index (see Task 5
    // countDescendants usage) and would miss arcs if empty-leaf directories were dropped.
    expect(tree.children).toHaveLength(1);
    expect(tree.children?.[0].name).toBe('empty-dir');
    expect(tree.children?.[0].children).toEqual([]);
  });

  it('preserves root node even when all children are filtered', () => {
    const root = buildNode({
      changeCount: 0,
      children: [
        buildNode({ name: 'f.ts', nodeType: 'file', changeCount: 0, children: undefined }),
      ],
    });

    const { tree } = adaptHotspotsTree(root);
    expect(tree.name).toBe('root');
    expect(tree.value).toBe(0);
    expect(tree.children).toEqual([]);
  });

  it('populates arcMeta with hotspot metadata', () => {
    const root = buildNode({
      changeCount: 30,
      children: [
        buildNode({
          name: 'src',
          nodeType: 'directory',
          changeCount: 30,
          additions: 100,
          deletions: 40,
          lastModified: '2026-08-01',
          children: [],
        }),
      ],
    });

    const { arcMeta } = adaptHotspotsTree(root);
    const metas = Array.from(arcMeta.values());
    // arcMeta excludes root (matches buildArcs' depth > 0): src only
    expect(metas.length).toBeGreaterThanOrEqual(1);
    const srcMeta = metas.find((m) => m.additions === 100);
    expect(srcMeta).toBeDefined();
    expect(srcMeta?.changeCount).toBe(30);
    expect(srcMeta?.lastModified).toBe('2026-08-01');
  });
});

describe('filterFilesByPath', () => {
  const files: GitVisFileHotspotFile[] = [
    {
      path: 'src/main.ts',
      changeCount: 10,
      additions: 20,
      deletions: 5,
      lastModified: '2026-08-01',
    },
    {
      path: 'src/core/engine.ts',
      changeCount: 8,
      additions: 15,
      deletions: 3,
      lastModified: '2026-07-31',
    },
    {
      path: 'tests/main.test.ts',
      changeCount: 5,
      additions: 10,
      deletions: 2,
      lastModified: '2026-07-30',
    },
  ];

  it('returns all files when filterPath is empty', () => {
    expect(filterFilesByPath(files, [])).toHaveLength(3);
  });

  it('filters by single-segment prefix', () => {
    const result = filterFilesByPath(files, ['src']);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('src/main.ts');
  });

  it('filters by multi-segment prefix', () => {
    const result = filterFilesByPath(files, ['src', 'core']);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/core/engine.ts');
  });

  it('returns empty array when no match', () => {
    expect(filterFilesByPath(files, ['nonexistent'])).toEqual([]);
  });
});

describe('computeArcFill', () => {
  const allMetas = [
    { changeCount: 0, additions: 0, deletions: 0, lastModified: null },
    { changeCount: 50, additions: 100, deletions: 20, lastModified: '2026-08-01' },
    { changeCount: 100, additions: 200, deletions: 50, lastModified: '2026-07-01' },
  ];

  it('returns color based on changeCount in heat mode', () => {
    const low = computeArcFill(allMetas[0], 'heat', allMetas);
    const high = computeArcFill(allMetas[2], 'heat', allMetas);
    expect(low).toBeTruthy();
    expect(high).toBeTruthy();
    // Low and high should differ (different heatmap levels)
    expect(low).not.toBe(high);
  });

  it('returns color based on lastModified in time mode', () => {
    const old = computeArcFill(allMetas[2], 'time', allMetas);
    const recent = computeArcFill(allMetas[1], 'time', allMetas);
    expect(old).toBeTruthy();
    expect(recent).toBeTruthy();
  });

  it('handles single-meta case (no division by zero)', () => {
    const single = [{ changeCount: 5, additions: 10, deletions: 2, lastModified: '2026-08-01' }];
    const color = computeArcFill(single[0], 'heat', single);
    expect(color).toBeTruthy();
  });

  it('handles null lastModified in time mode', () => {
    const meta = { changeCount: 5, additions: 10, deletions: 2, lastModified: null };
    const color = computeArcFill(meta, 'time', allMetas);
    expect(color).toBeTruthy();
  });
});
