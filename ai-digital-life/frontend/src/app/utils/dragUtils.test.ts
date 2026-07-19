import { describe, expect, it } from 'vitest';
import {
  computeReorderedList,
  mergeOrderPreserving,
  moveIdAfterTarget,
  moveIdBeforeTarget,
  moveIdToBucketEnd,
} from './dragUtils';

describe('moveIdBeforeTarget', () => {
  it('moves dragged id to before target', () => {
    expect(moveIdBeforeTarget(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
  });

  it('appends when target not found', () => {
    expect(moveIdBeforeTarget(['a', 'b'], 'a', 'z')).toEqual(['b', 'a']);
  });

  it('inserts dragged id immediately before target when dragged id not in list', () => {
    // Existing behavior: filter out draggedId (no-op if absent), then splice
    // immediately before targetId. So 'x' goes right before 'b'.
    expect(moveIdBeforeTarget(['a', 'b'], 'x', 'b')).toEqual(['a', 'x', 'b']);
  });
});

describe('moveIdAfterTarget', () => {
  it('moves dragged id to after target', () => {
    expect(moveIdAfterTarget(['a', 'b', 'c'], 'a', 'b')).toEqual(['b', 'a', 'c']);
  });

  it('appends when target not found', () => {
    expect(moveIdAfterTarget(['a', 'b'], 'a', 'z')).toEqual(['b', 'a']);
  });
});

describe('moveIdToBucketEnd', () => {
  it('moves dragged id to end', () => {
    expect(moveIdToBucketEnd(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a']);
  });
});

describe('mergeOrderPreserving', () => {
  it('preserves current order for ids still present and appends new ones', () => {
    const current = ['a', 'b', 'c'];
    const external = ['c', 'a', 'd']; // 'b' removed, 'd' added
    expect(mergeOrderPreserving(current, external)).toEqual(['a', 'c', 'd']);
  });

  it('returns external when current is empty', () => {
    expect(mergeOrderPreserving([], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('returns empty when both empty', () => {
    expect(mergeOrderPreserving([], [])).toEqual([]);
  });

  it('handles identical lists', () => {
    expect(mergeOrderPreserving(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('does not duplicate ids', () => {
    expect(mergeOrderPreserving(['a', 'b'], ['a', 'b', 'a'])).toEqual(['a', 'b']);
  });
});

describe('computeReorderedList', () => {
  const isPinnedById = (id: string) => id.startsWith('p');

  it('reorders within pinned bucket, keeps unpinned at end', () => {
    const current = ['p1', 'p2', 'u1', 'u2'];
    const result = computeReorderedList(current, 'p1', 'p2', 'after', true, isPinnedById);
    expect(result).toEqual(['p2', 'p1', 'u1', 'u2']);
  });

  it('reorders within unpinned bucket, keeps pinned at start', () => {
    const current = ['p1', 'u1', 'u2', 'u3'];
    const result = computeReorderedList(current, 'u1', 'u3', 'before', false, isPinnedById);
    // Remove 'u1' → ['u2', 'u3'], insert before 'u3' (index 1) → ['u2', 'u1', 'u3']
    expect(result).toEqual(['p1', 'u2', 'u1', 'u3']);
  });

  it('returns current order unchanged when dragged and target are same', () => {
    const current = ['p1', 'p2', 'u1'];
    const result = computeReorderedList(current, 'p1', 'p1', 'after', true, isPinnedById);
    expect(result).toEqual(['p1', 'p2', 'u1']);
  });

  it('appends to bucket end when target not found', () => {
    const current = ['p1', 'p2', 'u1'];
    const result = computeReorderedList(current, 'p1', 'pZ', 'after', true, isPinnedById);
    expect(result).toEqual(['p2', 'p1', 'u1']);
  });
});
