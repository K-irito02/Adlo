import { describe, it, expect } from 'vitest';
import { buildFlatTabItems } from './browserTreeEntryUtils';
import type { BrowserTreeNode } from './types';

function makeTabNode(tabId: string, name: string): BrowserTreeNode {
  return {
    name,
    path: `tab:${tabId}`,
    kind: 'file',
    nodeType: 'tab',
    tabId,
    url: `https://${name}.example`,
    children: [],
  };
}

function makeDirNode(name: string, path: string, children: BrowserTreeNode[]): BrowserTreeNode {
  return {
    name,
    path,
    kind: 'directory',
    nodeType: 'folder',
    children,
  };
}

describe('buildFlatTabItems with filterTabIds', () => {
  it('returns all tabs when no filter is provided', () => {
    const root = makeDirNode('root', 'root', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const result = buildFlatTabItems(root, false);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(2);
  });

  it('filters to only tabs in filterTabIds set', () => {
    const root = makeDirNode('root', 'root', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
      makeTabNode('t3', 'Tab3'),
    ]);
    const filterTabIds = new Set(['t1', 't3']);
    const result = buildFlatTabItems(root, false, filterTabIds);
    const tabs = result.filter((r) => r.type === 'tab');
    expect(tabs).toHaveLength(2);
    const tabIds = tabs.map((t) => (t.type === 'tab' ? t.node.tabId : null));
    expect(tabIds).toEqual(['t1', 't3']);
  });

  it('skips empty directories when filtering', () => {
    const dir = makeDirNode('EmptyDir', 'dir', [makeTabNode('t1', 'Tab1')]);
    const root = makeDirNode('root', 'root', [dir]);
    const filterTabIds = new Set(['t2']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(0);
  });

  it('keeps separator for directory with open tabs', () => {
    const dir = makeDirNode('OpenDir', 'dir', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const root = makeDirNode('root', 'root', [dir]);
    const filterTabIds = new Set(['t1']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result.filter((r) => r.type === 'separator')).toHaveLength(1);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(1);
  });

  it('skips separator for directory with no open tabs after filtering', () => {
    const dir = makeDirNode('ClosedDir', 'dir', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const root = makeDirNode('root', 'root', [dir]);
    const filterTabIds = new Set(['t3']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result).toHaveLength(0);
  });

  it('recursively filters nested directories', () => {
    const nested = makeDirNode('Inner', 'outer/inner', [makeTabNode('t1', 'Tab1')]);
    const outer = makeDirNode('Outer', 'outer', [nested]);
    const root = makeDirNode('root', 'root', [outer]);
    const filterTabIds = new Set(['t1']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(1);
  });
});
