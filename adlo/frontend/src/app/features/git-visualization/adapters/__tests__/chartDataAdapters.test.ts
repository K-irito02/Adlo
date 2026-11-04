import { describe, it, expect } from 'vitest';
import { getHotspotChildren, type HotspotTreeNode } from '../chartDataAdapters';

function node(overrides: Partial<HotspotTreeNode> = {}): HotspotTreeNode {
  return {
    name: 'n',
    nodeType: 'directory',
    children: [],
    ...overrides,
  };
}

const tree: HotspotTreeNode = node({
  name: 'root',
  children: [
    node({
      name: 'src',
      children: [
        node({
          name: 'core',
          children: [node({ name: 'engine.ts', nodeType: 'file', children: undefined })],
        }),
        node({
          name: 'api',
          children: [node({ name: 'handler.ts', nodeType: 'file', children: undefined })],
        }),
      ],
    }),
    node({ name: 'tests', children: [] }),
  ],
});

describe('getHotspotChildren', () => {
  it('returns root children for empty drillPath', () => {
    const children = getHotspotChildren(tree, []);
    expect(children.map((c) => c.name)).toEqual(['src', 'tests']);
  });

  it('walks one segment', () => {
    const children = getHotspotChildren(tree, ['src']);
    expect(children.map((c) => c.name)).toEqual(['core', 'api']);
  });

  it('walks multiple segments', () => {
    const children = getHotspotChildren(tree, ['src', 'core']);
    expect(children.map((c) => c.name)).toEqual(['engine.ts']);
  });

  it('returns empty array for nonexistent path', () => {
    expect(getHotspotChildren(tree, ['nope'])).toEqual([]);
    expect(getHotspotChildren(tree, ['src', 'nope'])).toEqual([]);
  });

  it('returns empty array for a file node (no children)', () => {
    expect(getHotspotChildren(tree, ['src', 'core', 'engine.ts'])).toEqual([]);
  });

  it('returns empty array for a directory with no children', () => {
    expect(getHotspotChildren(tree, ['tests'])).toEqual([]);
  });

  it('returns empty array when children is undefined', () => {
    const bare = node({ children: undefined });
    expect(getHotspotChildren(bare, [])).toEqual([]);
  });
});
