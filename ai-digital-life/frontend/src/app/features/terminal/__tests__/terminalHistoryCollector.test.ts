// src/app/features/terminal/__tests__/terminalHistoryCollector.test.ts
import { describe, expect, it } from 'vitest';
import {
  TERMINAL_HISTORY_CHUNK_MAX_BYTES,
  TerminalHistoryCollector,
} from '../terminalHistoryCollector';
import type { ExtractCell } from '../historyModel';

function cell(ch: string): ExtractCell {
  return {
    getChars: () => ch,
    getWidth: () => 1,
    isFgDefault: () => true,
    getFgColor: () => 0,
    isBgDefault: () => true,
    getBgColor: () => 0,
    isBold: () => false,
    isItalic: () => false,
    isUnderline: () => false,
    isDim: () => false,
    isInverse: () => false,
  };
}

/** 造一个「前 frozen 行冻结、后 viewport 行可变」的缓冲 */
function makeBuffer(frozen: string[], viewport: string[]) {
  const all = [...frozen, ...viewport];
  const getLine = (y?: number) =>
    y === undefined || all[y] === undefined
      ? undefined
      : { getCell: (x: number) => (x === 0 ? cell(all[y]) : undefined) };
  return { length: all.length, baseY: frozen.length, activeType: 'normal' as const, getLine };
}

function makeCollector(
  buffer: ReturnType<typeof makeBuffer>,
  written: Record<string, string>,
  sessionId = 's',
) {
  const collector = new TerminalHistoryCollector({
    readBuffer: () => buffer,
    cols: () => 10,
    write: async (key, payload) => {
      written[key] = payload;
      return true;
    },
  });
  collector.setSessionId(sessionId);
  return collector;
}

describe('TerminalHistoryCollector', () => {
  it('collect 只采冻结行，视口区不采；flush 把视口也封入最后一块', async () => {
    const written: Record<string, string> = {};
    const c = makeCollector(makeBuffer(['a', 'b'], ['v1', 'v2']), written);
    await c.collect();
    expect(Object.keys(written)).toEqual([]); // 未满一块，不落盘

    await c.flush();
    expect(Object.keys(written)).toEqual(['s#0']);
    expect(JSON.parse(written['s#0']).lines).toEqual([
      [{ text: 'a' }],
      [{ text: 'b' }],
      [{ text: 'v1' }],
      [{ text: 'v2' }],
    ]);
  });

  it('累计超过块上限时封块并递增 seq', async () => {
    const written: Record<string, string> = {};
    const bigLine = 'x'.repeat(2048);
    const frozen = Array.from({ length: 100 }, () => bigLine);
    const c = makeCollector(makeBuffer(frozen, []), written);
    await c.collect();
    expect(Object.keys(written).length).toBeGreaterThan(1);
    expect(Object.keys(written)[0]).toBe('s#0');
    expect(Object.keys(written)[1]).toBe('s#1');
    for (const payload of Object.values(written)) {
      expect(new TextEncoder().encode(payload).length).toBeLessThanOrEqual(
        TERMINAL_HISTORY_CHUNK_MAX_BYTES,
      );
    }
  });

  it('写入失败时不推进水位，下一次 collect 重试同一批行', async () => {
    let attempts = 0;
    const received: string[] = [];
    const collector = new TerminalHistoryCollector({
      readBuffer: () => makeBuffer(['a'], []),
      cols: () => 10,
      write: async (_key, payload) => {
        attempts += 1;
        received.push(payload);
        return attempts > 1;
      },
    });
    collector.setSessionId('s');
    await collector.flush();
    expect(attempts).toBe(1);
    await collector.flush();
    expect(attempts).toBe(2);
    expect(received[1]).toContain('"a"');
  });

  it('水位失效（行数缩水）时清空已落盘块并要求重建整段', async () => {
    const written: Record<string, string> = {};
    let buffer = makeBuffer(
      Array.from({ length: 100 }, () => 'x'.repeat(2048)),
      [],
    );
    const c = new TerminalHistoryCollector({
      readBuffer: () => buffer,
      cols: () => 10,
      write: async (key, payload) => {
        written[key] = payload;
        return true;
      },
    });
    c.setSessionId('s');
    await c.collect();
    expect(c.getWrittenChunks().length).toBeGreaterThan(1);

    // 模拟 scrollback 被裁剪：总行数缩到水位之下，绝对行号随之失效
    buffer = { length: 1, baseY: 0, activeType: 'normal', getLine: () => undefined };
    await c.collect();
    expect(c.needsRebuild()).toBe(true);
    expect(c.getWrittenChunks().length).toBe(0);
  });

  it('块上限常量取自设计（64 KiB）', () => {
    expect(TERMINAL_HISTORY_CHUNK_MAX_BYTES).toBe(64 * 1024);
  });
});
