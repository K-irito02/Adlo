import { describe, expect, it } from 'vitest';
import { chunkKey, normalizeHistoryIndex } from '../terminalHistoryStore';

describe('normalizeHistoryIndex', () => {
  it('保留结构完整的段', () => {
    const raw = {
      tab1: [{ sessionId: 's1', endedAt: 1, live: false, chunks: [{ lines: 3, size: 100 }] }],
    };
    expect(normalizeHistoryIndex(raw)).toEqual(raw);
  });

  it('丢弃 endedAt 非有限数的条目', () => {
    expect(normalizeHistoryIndex({ tab1: [{ sessionId: 's1', endedAt: NaN, live: false, chunks: [] }] })).toEqual({});
  });

  it('丢弃缺 chunks 或 chunks 结构非法的条目', () => {
    const raw = {
      tab1: [
        { sessionId: 's1', endedAt: 1, live: false },
        { sessionId: 's2', endedAt: 1, live: false, chunks: [{ lines: 'x', size: 1 }] },
      ],
    };
    expect(normalizeHistoryIndex(raw)).toEqual({});
  });

  it('丢弃非法标签条目', () => {
    expect(normalizeHistoryIndex({ tab1: 'nope', tab2: null })).toEqual({});
  });

  it('丢弃 chunks 为空的段（空段无任何可渲染行，只会产出孤立日期分隔符）', () => {
    const raw = {
      tab1: [
        { sessionId: 's1', endedAt: 1, live: false, chunks: [] },
        { sessionId: 's2', endedAt: 2, live: false, chunks: [{ lines: 1, size: 10 }] },
      ],
    };
    expect(normalizeHistoryIndex(raw)).toEqual({
      tab1: [{ sessionId: 's2', endedAt: 2, live: false, chunks: [{ lines: 1, size: 10 }] }],
    });
  });
});

describe('chunkKey', () => {
  it('用合成键承载「一段多块」，不改 IPC 契约', () => {
    expect(chunkKey('s1', 0)).toBe('s1#0');
    expect(chunkKey('s1', 12)).toBe('s1#12');
  });
});
