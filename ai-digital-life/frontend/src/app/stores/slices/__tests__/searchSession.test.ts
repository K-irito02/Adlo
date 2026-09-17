import { describe, expect, it } from 'vitest';
import { dropFileHits, markHitsStale, replaceFileHits, type SearchHitEntry } from '../searchSlice';

const hit = (path: string, line: number, stale = false): SearchHitEntry => ({
  workspaceId: 'ws-1',
  path,
  line,
  preview: `p${line}`,
  stale,
});

describe('search session reducers', () => {
  it('replaceFileHits swaps only the target file, keeping order', () => {
    const before = [hit('a.md', 1), hit('a.md', 9), hit('b.md', 3)];
    const after = replaceFileHits(before, 'a.md', [hit('a.md', 2)]);
    expect(after.map((h) => `${h.path}:${h.line}`)).toEqual(['b.md:3', 'a.md:2']);
  });

  it('replaceFileHits drops the file when recomputation yields no hits', () => {
    const after = replaceFileHits([hit('a.md', 1), hit('b.md', 3)], 'a.md', []);
    expect(after.map((h) => h.path)).toEqual(['b.md']);
  });

  it('dropFileHits removes every hit of a deleted file', () => {
    const after = dropFileHits([hit('a.md', 1), hit('b.md', 3)], 'a.md');
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
});
