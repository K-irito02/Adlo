import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { buildCollapsedUnchangedRanges } from './diffViewerUtils';

describe('buildCollapsedUnchangedRanges', () => {
  it('builds collapsed unchanged ranges with merge-view margins applied', () => {
    const state = EditorState.create({
      doc: 'line1\nline2\nline3\nline4\nline5\nchanged\nline7\nline8\nline9\nline10\nline11\nline12',
    });
    const chunks: { fromA: number; fromB: number; toA: number; toB: number }[] = [
      { fromA: 24, fromB: 24, toA: 42, toB: 30 },
    ];
    const result = buildCollapsedUnchangedRanges({ chunks: chunks as any, doc: state.doc });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ startLine: 9, endLine: 12 });
  });
});
