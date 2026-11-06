import { describe, it, expect } from 'vitest';
import { resolveRowDisplay } from './branchRowDisplay';
import { buildRefLabelColorMap, getRefLabelColor } from './branchLabelColors';
import type { CommitNode } from '../types/gitGraph';

function node(id: string, refs?: string[]): CommitNode {
  return {
    id,
    hash: id,
    branch: refs?.[0] ?? 'main',
    refs,
    date: '2026-01-01',
    message: 'msg',
    author: 'A',
    authorEmail: 'a@example.com',
  };
}

const fallback = '#888';
const colorMap = buildRefLabelColorMap([
  'main',
  'archived',
  'feature-1',
  'feature-2',
  'release/v1.0',
]);

describe('resolveRowDisplay', () => {
  it('keeps every row selected with the owner color when no branch is selected', () => {
    const ownership = new Map([['n1', 'main']]);
    const d = resolveRowDisplay(node('n1'), fallback, ownership, new Set(), colorMap);
    expect(d.selected).toBe(true);
    expect(d.color).toBe(colorMap.get('main'));
  });

  it('falls back to the lane color when there is no owner and no selection', () => {
    const d = resolveRowDisplay(node('n1'), fallback, new Map(), new Set(), colorMap);
    expect(d.selected).toBe(true);
    expect(d.color).toBe(fallback);
  });

  it('uses the anchor branch color when a selected branch ref is pinned to the node', () => {
    // The merged branch's head node is owned by main but carries the branch ref.
    const ownership = new Map([['n1', 'main']]);
    const d = resolveRowDisplay(
      node('n1', ['main', 'archived']),
      fallback,
      ownership,
      new Set(['archived']),
      colorMap,
    );
    expect(d.selected).toBe(true);
    expect(d.color).toBe(colorMap.get('archived'));
  });

  it('uses the owner color when the owning branch itself is selected', () => {
    const ownership = new Map([['n1', 'feature-1']]);
    const d = resolveRowDisplay(
      node('n1', ['feature-1']),
      fallback,
      ownership,
      new Set(['feature-1']),
      colorMap,
    );
    expect(d.selected).toBe(true);
    expect(d.color).toBe(colorMap.get('feature-1'));
  });

  it('dims a node whose anchor/owner branch is not selected, keeping the owner color', () => {
    const ownership = new Map([['n1', 'feature-2']]);
    const d = resolveRowDisplay(
      node('n1', ['feature-2']),
      fallback,
      ownership,
      new Set(['feature-1']),
      colorMap,
    );
    expect(d.selected).toBe(false);
    expect(d.color).toBe(colorMap.get('feature-2'));
  });

  it('dims an ownerless node when a selection exists, keeping the fallback color', () => {
    const d = resolveRowDisplay(node('n1'), fallback, new Map(), new Set(['feature-1']), colorMap);
    expect(d.selected).toBe(false);
    expect(d.color).toBe(fallback);
  });

  it('uses the map color on the selected-anchor path too', () => {
    const d = resolveRowDisplay(
      node('n1', ['main', 'release/v1.0']),
      fallback,
      new Map([['n1', 'main']]),
      new Set(['release/v1.0']),
      colorMap,
    );

    expect(d.selected).toBe(true);
    expect(d.color).toBe(colorMap.get('release/v1.0'));
    expect(d.color).not.toBe(getRefLabelColor('release/v1.0'));
  });

  it('uses the shared map color instead of the per-name fallback', () => {
    // release/v1.0 is the fixture branch whose assigned slot differs from its
    // hash fallback; missing the map must surface as a different color.
    const d = resolveRowDisplay(
      node('n1', ['release/v1.0']),
      fallback,
      new Map([['n1', 'release/v1.0']]),
      new Set(),
      colorMap,
    );

    expect(d.color).toBe(colorMap.get('release/v1.0'));
    expect(d.color).not.toBe(getRefLabelColor('release/v1.0'));
  });
});
