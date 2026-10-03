// src/app/features/terminal/__tests__/terminalHistoryCollector.test.ts
import { describe, expect, it } from 'vitest';
import {
  TERMINAL_CHECKPOINT_IDLE_MS,
  TERMINAL_CHECKPOINT_MIN_LINES,
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
    isFgRGB: () => false,
    isBgDefault: () => true,
    getBgColor: () => 0,
    isBgRGB: () => false,
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
  now: () => number = () => 0,
) {
  const collector = new TerminalHistoryCollector({
    readBuffer: () => buffer,
    cols: () => 10,
    write: async (key, payload) => {
      written[key] = payload;
      return true;
    },
    now,
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

  it('封块预算包含 JSON 包装开销，任何写入的 payload 都不超过块上限', async () => {
    const written: Record<string, string> = {};
    // 单行序列化为 [{"text":"…"}]，字节数 = text 长度 + 13；2035 + 13 = 2048 字节/行。
    // 32 行行体和 = 32 × 2048 = 65536，正好顶格（距上限 0 字节），
    // 于是 {"seq":N,"cols":N,"lines":[…]} 的包装与行间逗号必然把 payload 顶过上限。
    const line = 'x'.repeat(2035);
    const frozen = Array.from({ length: 32 }, () => line);
    const c = makeCollector(makeBuffer(frozen, []), written);
    await c.collect();
    await c.flush();
    const payloads = Object.values(written);
    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) {
      expect(new TextEncoder().encode(payload).length).toBeLessThanOrEqual(
        TERMINAL_HISTORY_CHUNK_MAX_BYTES,
      );
    }
  });

  it('短行时行间逗号同样计入封块预算，payload 也不超上限', async () => {
    const written: Record<string, string> = {};
    // 单行序列化为 [{"text":"a"}] = 14 字节；k 行的 payload = 30（包装）+ 14k + (k−1) 个行间逗号
    // = 29 + 15k。k = 4367 → 65534 字节（距上限仅 2 字节），再收一行就是 65549 > 上限；
    // 只按行体和判定会一路收到 ~4680 行，写出 ~70 KiB 的块。
    const frozen = Array.from({ length: 4368 }, () => 'a');
    const c = makeCollector(makeBuffer(frozen, []), written);
    await c.collect();
    await c.flush();
    const payloads = Object.values(written);
    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) {
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
    expect(c.consumeRebuild()).toBe(true);
    // 一次性消费：再次读取为 false，避免“块数未变则跳过”保护被永久绕过
    expect(c.consumeRebuild()).toBe(false);
    expect(c.getWrittenChunks().length).toBe(0);
  });

  it('列数变化（xterm 重排）时同样整段重建：长度未缩水也必须重采，否则按失效行号续采', async () => {
    const written: Record<string, string> = {};
    let cols = 10;
    const collector = new TerminalHistoryCollector({
      readBuffer: () => makeBuffer(['a', 'b', 'c'], []),
      cols: () => cols,
      write: async (key, payload) => {
        written[key] = payload;
        return true;
      },
    });
    collector.setSessionId('s');
    await collector.flush();
    expect(collector.consumeRebuild()).toBe(false);

    // 行数完全不变、只改列数：旧实现（只判 length < watermark）不会重建，
    // 会从已失效的绝对行号继续采 → 写进错位内容。
    cols = 40;
    await collector.collect();
    expect(collector.consumeRebuild()).toBe(true);
    expect(collector.getWrittenChunks().length).toBe(0);

    // 重建后列数稳定 → 不再反复触发
    await collector.flush();
    expect(collector.consumeRebuild()).toBe(false);
  });

  it('未封块（watermark 仍为 0、pending 非空）时列数变化同样重建：pending 也是失效的续采锚点', async () => {
    const written: Record<string, string> = {};
    let cols = 10;
    const collector = new TerminalHistoryCollector({
      readBuffer: () => makeBuffer(['a', 'b', 'c'], []),
      cols: () => cols,
      write: async (key, payload) => {
        written[key] = payload;
        return true;
      },
    });
    collector.setSessionId('s');
    // 3 行远未达 64 KiB 封块上限 → 只进 pending，watermark 保持 0
    await collector.collect();
    expect(collector.getWrittenChunks()).toEqual([]);
    expect(Object.keys(written)).toEqual([]);
    expect(collector.consumeRebuild()).toBe(false); // 首帧只记录列数，不重建

    cols = 40;
    await collector.collect();
    expect(collector.hasRebuild()).toBe(true);
  });

  it('hasRebuild 是非破坏性窥视：未消费前保持 true，consumeRebuild 后转 false', async () => {
    const written: Record<string, string> = {};
    let buffer = makeBuffer(['a', 'b', 'c'], []);
    const collector = new TerminalHistoryCollector({
      readBuffer: () => buffer,
      cols: () => 10,
      write: async (key, payload) => {
        written[key] = payload;
        return true;
      },
    });
    collector.setSessionId('s');
    await collector.flush();
    expect(collector.hasRebuild()).toBe(false);

    // 环回：总行数缩到水位之下
    buffer = { length: 1, baseY: 0, activeType: 'normal', getLine: () => undefined };
    await collector.collect();
    expect(collector.hasRebuild()).toBe(true);
    expect(collector.hasRebuild()).toBe(true); // 窥视不消费
    expect(collector.consumeRebuild()).toBe(true);
    expect(collector.hasRebuild()).toBe(false);
  });

  it('块上限常量取自设计（64 KiB）', () => {
    expect(TERMINAL_HISTORY_CHUNK_MAX_BYTES).toBe(64 * 1024);
  });

  it('flush 丢掉定稿快照末尾全空白行（分隔符不再沉底），中间空行保留', async () => {
    const written: Record<string, string> = {};
    const c = makeCollector(makeBuffer(['a', '', ''], ['v1', '', '']), written);
    await c.flush();
    expect(Object.keys(written)).toEqual(['s#0']);
    expect(JSON.parse(written['s#0']).lines).toEqual([[{ text: 'a' }], [], [], [{ text: 'v1' }]]);
  });

  it('flush 全空白会话不产生空块', async () => {
    const written: Record<string, string> = {};
    const c = makeCollector(makeBuffer([], ['', '']), written);
    await c.flush();
    expect(Object.keys(written)).toEqual([]);
    expect(c.getWrittenChunks()).toEqual([]);
  });

  it('flush 丢掉末尾空格填充行（带背景色的空白行同样修剪）', async () => {
    const written: Record<string, string> = {};
    // 视口尾部是带背景色的 3 格空格行：trimTrailingBlank 保留它（有 bg），isBlankLine 修剪它
    const bgSpace = {
      ...cell(' '),
      isBgDefault: () => false,
      getBgColor: () => 1,
    };
    const tailLine = { getCell: (x: number) => (x < 3 ? bgSpace : undefined) };
    const buffer = {
      length: 3,
      baseY: 2,
      activeType: 'normal' as const,
      getLine: (y?: number) =>
        y === 0
          ? { getCell: (x: number) => (x === 0 ? cell('a') : undefined) }
          : y === 1
            ? { getCell: (x: number) => (x === 0 ? cell('v1') : undefined) }
            : y === 2
              ? tailLine
              : undefined,
    };
    const collector = new TerminalHistoryCollector({
      readBuffer: () => buffer,
      cols: () => 10,
      write: async (key, payload) => {
        written[key] = payload;
        return true;
      },
    });
    collector.setSessionId('s');
    await collector.flush();
    expect(JSON.parse(written['s#0']).lines).toEqual([[{ text: 'a' }], [{ text: 'v1' }]]);
  });

  it('并发 collect 与 flush 串行执行不丢行', async () => {
    const written: Record<string, string> = {};
    const lines = Array.from({ length: 20 }, (_, i) => `L${i}`);
    const c = makeCollector(makeBuffer(lines, []), written);
    // 故意让写变慢，放大交错窗口：若串行化失效，水位错位会丢行或写重复行
    await Promise.all([c.collect(), c.checkpoint(), c.flush()]);
    const all: string[] = [];
    for (const payload of Object.values(written)) {
      for (const line of JSON.parse(payload).lines as { text: string }[][]) {
        all.push(line.map((r) => r.text).join(''));
      }
    }
    expect(all).toEqual(lines);
  });

  it('checkpoint 攒块：未达阈值且未空闲时不封，flush（会话结束）一律封块', async () => {
    const written: Record<string, string> = {};
    const c = makeCollector(makeBuffer(['a', 'b'], ['v1']), written);
    await c.collect();
    expect(c.getWrittenChunks()).toEqual([]);
    // 2 行、几十字节、未空闲 → 攒着不封块（避免稀疏会话每 30s 落一个小块）
    await c.checkpoint();
    expect(Object.keys(written)).toEqual([]);
    // 会话结束的 flush 不设阈值：冻结行 + 视口一并封块
    await c.flush();
    expect(Object.keys(written)).toEqual(['s#0']);
    expect(JSON.parse(written['s#0']).lines).toEqual([
      [{ text: 'a' }],
      [{ text: 'b' }],
      [{ text: 'v1' }],
    ]);
    expect(c.getWrittenChunks()).toEqual([{ lines: 3, size: expect.any(Number) }]);
    // 无新增时再次 checkpoint 不写新块
    await c.checkpoint();
    expect(Object.keys(written)).toEqual(['s#0']);
  });

  it('checkpoint 攒够行数阈值即封块', async () => {
    const written: Record<string, string> = {};
    const lines = Array.from({ length: TERMINAL_CHECKPOINT_MIN_LINES + 1 }, () => 'a');
    const c = makeCollector(makeBuffer(lines, []), written);
    await c.collect();
    await c.checkpoint();
    expect(Object.keys(written).length).toBeGreaterThan(0);
  });

  it('checkpoint 攒够字节阈值即封块（行数未达）', async () => {
    const written: Record<string, string> = {};
    const longLine = 'x'.repeat(4096);
    const lines = Array.from({ length: 8 }, () => longLine);
    const c = makeCollector(makeBuffer(lines, []), written);
    await c.collect();
    await c.checkpoint();
    expect(Object.keys(written).length).toBeGreaterThan(0);
  });

  it('checkpoint 空闲超时即封块（小 pending 也落盘，限制崩溃丢尾窗口）', async () => {
    const written: Record<string, string> = {};
    let now = 0;
    const c = makeCollector(makeBuffer(['a', 'b'], []), written, 's', () => now);
    await c.collect();
    await c.checkpoint();
    expect(Object.keys(written)).toEqual([]);
    now += TERMINAL_CHECKPOINT_IDLE_MS;
    await c.checkpoint();
    expect(Object.keys(written)).toEqual(['s#0']);
    expect(JSON.parse(written['s#0']).lines).toEqual([[{ text: 'a' }], [{ text: 'b' }]]);
  });
});
