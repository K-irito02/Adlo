import { describe, expect, it } from 'vitest';
import { markHitsStale, replaceFileHits, type SearchHitEntry } from '../searchSlice';

const hit = (path: string, line: number, stale = false): SearchHitEntry => ({
  workspaceId: 'ws-1',
  path,
  line,
  preview: `p${line}`,
  stale,
});

describe('search session reducers', () => {
  it('replaceFileHits swaps only the target file in place, keeping order', () => {
    const before = [hit('a.md', 1), hit('a.md', 9), hit('b.md', 3)];
    const after = replaceFileHits(before, 'a.md', [hit('a.md', 2)]);
    expect(after.map((h) => `${h.path}:${h.line}`)).toEqual(['a.md:2', 'b.md:3']);
  });

  it('replaceFileHits drops the file when recomputation yields no hits', () => {
    const after = replaceFileHits([hit('a.md', 1), hit('b.md', 3)], 'a.md', []);
    expect(after.map((h) => h.path)).toEqual(['b.md']);
  });

  it('markHitsStale flags the whole file when no line given, and one line otherwise', () => {
    const all = markHitsStale([hit('a.md', 1), hit('a.md', 2)], 'a.md');
    expect(all.every((h) => h.stale)).toBe(true);
    const one = markHitsStale([hit('a.md', 1), hit('a.md', 2)], 'a.md', 2);
    expect(one.map((h) => h.stale)).toEqual([false, true]);
  });

  it('replaceFileHits clears stale flags for recomputed hits', () => {
    const after = replaceFileHits([hit('a.md', 1, true)], 'a.md', [hit('a.md', 5)]);
    expect(after[0].stale).toBe(false);
  });

  it('replaceFileHits appends when the file has no hits yet', () => {
    const after = replaceFileHits([hit('a.md', 1)], 'b.md', [hit('b.md', 3)]);
    expect(after.map((h) => `${h.path}:${h.line}`)).toEqual(['a.md:1', 'b.md:3']);
  });

  it('helpers scope matches by workspaceId when given', () => {
    const other: SearchHitEntry = { ...hit('a.md', 1), workspaceId: 'ws-2' };
    const fresh: SearchHitEntry = { ...hit('a.md', 7), workspaceId: 'ws-2' };
    const entries = [hit('a.md', 1), other];
    expect(replaceFileHits(entries, 'a.md', [fresh], 'ws-2')).toEqual([hit('a.md', 1), fresh]);
    const marked = markHitsStale(entries, 'a.md', undefined, 'ws-2');
    expect(marked.map((h) => h.stale)).toEqual([false, true]);
  });
});
