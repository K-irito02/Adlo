import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import {
  buildCollapsedUnchangedRanges,
  computeSyncedScrollTop,
  syncHorizontalScroll,
} from './diffViewerUtils';

describe('DiffViewer scroll synchronization', () => {
  it('preserves scroll position by ratio when side-by-side panes have different heights', () => {
    expect(
      computeSyncedScrollTop({
        sourceScrollTop: 250,
        sourceScrollHeight: 1500,
        sourceClientHeight: 500,
        targetScrollHeight: 2500,
        targetClientHeight: 500,
      })
    ).toBe(500);
  });

  it('keeps the target at the top when the source cannot scroll', () => {
    expect(
      computeSyncedScrollTop({
        sourceScrollTop: 100,
        sourceScrollHeight: 500,
        sourceClientHeight: 500,
        targetScrollHeight: 2500,
        targetClientHeight: 500,
      })
    ).toBe(0);
  });

  it('builds collapsed unchanged ranges with merge-view margins applied', () => {
    const state = EditorState.create({
      doc: 'line1\nline2\nline3\nline4\nline5\nchanged\nline7\nline8\nline9\nline10\nline11\nline12',
    });
    const chunks: { fromA: number; fromB: number; toA: number; toB: number }[] = [
      { fromA: 24, fromB: 24, toA: 42, toB: 30 },
    ];
    const result = buildCollapsedUnchangedRanges({ chunks: chunks as any, doc: state.doc });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      startLine: expect.any(Number),
      endLine: expect.any(Number),
    });
  });

  it('syncs horizontal scroll proportionally between two editors', () => {
    const source = { scrollWidth: 2000, clientWidth: 500, scrollLeft: 400 } as HTMLElement;
    const target = { scrollWidth: 2000, clientWidth: 500, scrollLeft: 0 } as HTMLElement;
    syncHorizontalScroll(source, target);
    expect(target.scrollLeft).toBe(400);
  });
});
