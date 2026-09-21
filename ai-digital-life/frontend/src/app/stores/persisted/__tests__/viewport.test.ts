import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampScrollTop,
  readEditorViewport,
  readPersistedViewport,
  shouldApplyViewport,
  viewportSessionKey,
} from '../viewport';
import type { PersistedViewport } from '../viewport';

const viewport: PersistedViewport = {
  relativePath: 'a.ts',
  workspaceId: 'ws',
  scrollTop: 900,
  scrollTopLine: 120,
  foldedRanges: [[10, 20]],
};

describe('clampScrollTop', () => {
  it('keeps the stored offset when the document is long enough', () => {
    expect(clampScrollTop(viewport, 500)).toBe(900);
  });

  it('clamps to the tail when the document became shorter', () => {
    expect(clampScrollTop(viewport, 60)).toBeLessThan(900);
    expect(clampScrollTop(viewport, 60)).toBeGreaterThanOrEqual(0);
  });

  it('never returns a negative offset for an empty document', () => {
    expect(clampScrollTop(viewport, 0)).toBe(0);
  });

  it('returns 0 when scrollTopLine is missing or corrupt (fix round 1 #3)', () => {
    expect(clampScrollTop({ ...viewport, scrollTopLine: 0 }, 60)).toBe(0);
    expect(clampScrollTop({ ...viewport, scrollTopLine: Number.NaN }, 60)).toBe(0);
  });
});

describe('readEditorViewport', () => {
  it('accepts a well-formed viewport', () => {
    expect(readEditorViewport({ ...viewport })).toEqual(viewport);
  });

  it('ignores malformed folded ranges without discarding the whole viewport', () => {
    expect(
      readEditorViewport({
        ...viewport,
        foldedRanges: [[10, 20], ['a', 2], [5, 3], [0, 4], null],
      }),
    ).toEqual({ ...viewport, foldedRanges: [[10, 20]] });
  });

  it('treats a non-array foldedRanges as empty instead of rejecting the viewport', () => {
    expect(readEditorViewport({ ...viewport, foldedRanges: 'nope' })).toEqual({
      ...viewport,
      foldedRanges: [],
    });
  });

  it('rejects a viewport with illegal required fields', () => {
    expect(readEditorViewport({ ...viewport, workspaceId: 42 })).toBeUndefined();
    expect(readEditorViewport({ relativePath: 'a.ts' })).toBeUndefined();
    expect(readEditorViewport(null)).toBeUndefined();
  });
});

describe('readPersistedViewport', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns undefined when nothing was ever stored', () => {
    expect(readPersistedViewport()).toBeUndefined();
  });

  it('reads back a stored viewport', () => {
    localStorage.setItem('adl:session.editorViewport', JSON.stringify(viewport));
    expect(readPersistedViewport()).toEqual(viewport);
  });

  it('returns undefined for a wholly illegal stored value', () => {
    localStorage.setItem(
      'adl:session.editorViewport',
      JSON.stringify({ workspaceId: 'ws', scrollTop: 'far' }),
    );
    expect(readPersistedViewport()).toBeUndefined();
  });
});

describe('shouldApplyViewport', () => {
  const ws1Viewport: PersistedViewport = { ...viewport, workspaceId: 'ws1', scrollTop: 100 };
  const ws2Viewport: PersistedViewport = { ...viewport, workspaceId: 'ws2', scrollTop: 200 };

  it('applies a matching viewport once, then skips on replay', () => {
    expect(shouldApplyViewport(null, 'a.ts', 'ws1', ws1Viewport)).toBe(true);
    const applied = viewportSessionKey('ws1', 'a.ts');
    expect(shouldApplyViewport(applied, 'a.ts', 'ws1', ws1Viewport)).toBe(false);
  });

  it('still applies after switching to the same path in another workspace (fix round 1 #1)', () => {
    const appliedWs1 = viewportSessionKey('ws1', 'a.ts');
    expect(viewportSessionKey('ws2', 'a.ts')).not.toBe(appliedWs1);
    expect(shouldApplyViewport(appliedWs1, 'a.ts', 'ws2', ws2Viewport)).toBe(true);
  });

  it('skips when path or workspace does not match', () => {
    expect(shouldApplyViewport(null, 'b.ts', 'ws1', ws1Viewport)).toBe(false);
    expect(shouldApplyViewport(null, 'a.ts', 'ws2', ws1Viewport)).toBe(false);
    expect(shouldApplyViewport(null, 'a.ts', undefined, ws1Viewport)).toBe(false);
  });
});
