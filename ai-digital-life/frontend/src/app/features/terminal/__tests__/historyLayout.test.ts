import { describe, expect, it } from 'vitest';
import { buildLayout } from '../historyLayout';
import type { TerminalHistorySegment } from '../terminalHistoryStore';

const segments: TerminalHistorySegment[] = [
  {
    sessionId: 's1',
    endedAt: 100,
    live: false,
    chunks: [
      { lines: 2, size: 1 },
      { lines: 1, size: 1 },
    ],
  },
  { sessionId: 's2', endedAt: 200, live: false, chunks: [{ lines: 1, size: 1 }] },
];

describe('buildLayout', () => {
  it('按块顺序铺开行，每段末尾追加一条分隔符', () => {
    const rows = buildLayout(
      segments,
      (sessionId, seq) => (sessionId === 's1' && seq === 0 ? 2 : 1),
      80,
    );
    expect(rows.map((r) => r.kind)).toEqual(['line', 'line', 'line', 'divider', 'line', 'divider']);
    expect(rows[0]).toMatchObject({ kind: 'line', chunkIndex: 0, lineIndexInChunk: 0 });
    expect(rows[2]).toMatchObject({ kind: 'line', chunkIndex: 1, lineIndexInChunk: 0 });
    expect(rows[3]).toMatchObject({ kind: 'divider', at: 100 });
    expect(rows[5]).toMatchObject({ kind: 'divider', at: 200 });
  });

  it('折行后行数变化会反映到布局长度', () => {
    expect(buildLayout(segments, () => 3, 40).length).toBeGreaterThan(
      buildLayout(segments, () => 1, 80).length,
    );
  });

  it('空段列表得到空布局', () => {
    expect(buildLayout([], () => 1, 80)).toEqual([]);
  });

  it('chunks 为空的段被跳过，不产出孤立分隔符', () => {
    const withEmpty: TerminalHistorySegment[] = [
      { sessionId: 's0', endedAt: 50, live: false, chunks: [] },
      ...segments,
    ];
    const rows = buildLayout(withEmpty, () => 1, 80);
    expect(rows.map((r) => r.kind)).toEqual(['line', 'line', 'divider', 'line', 'divider']);
    expect(rows.filter((r) => r.kind === 'divider').map((r) => r.at)).toEqual([100, 200]);
  });
});
