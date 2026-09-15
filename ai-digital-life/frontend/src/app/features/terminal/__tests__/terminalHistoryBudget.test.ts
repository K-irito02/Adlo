// src/app/features/terminal/__tests__/terminalHistoryBudget.test.ts
import { describe, expect, it } from 'vitest';
import {
  TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
  TERMINAL_HISTORY_BUDGET_FOLLOW_DISK,
  TERMINAL_HISTORY_DISK_RESERVE_BYTES,
  TERMINAL_HISTORY_MIN_SEGMENTS_KEPT,
  diskAvailableBytesFrom,
  effectiveBudgetBytes,
  segmentBytes,
  segmentLines,
  selectLeadingChunksToEvict,
  selectSegmentsToEvict,
} from '../terminalHistoryBudget';
import type { TerminalHistorySegment } from '../terminalHistoryStore';

function seg(endedAt: number, sizes: number[], live = false): TerminalHistorySegment {
  return {
    sessionId: `s${endedAt}`,
    endedAt,
    live,
    chunks: sizes.map((size) => ({ lines: 1, size })),
  };
}

describe('segmentLines / segmentBytes', () => {
  it('聚合值等于 chunks 之和', () => {
    const s: TerminalHistorySegment = {
      sessionId: 's',
      endedAt: 1,
      live: false,
      chunks: [
        { lines: 3, size: 10 },
        { lines: 5, size: 20 },
      ],
    };
    expect(segmentLines(s)).toBe(8);
    expect(segmentBytes(s)).toBe(30);
  });
});

describe('effectiveBudgetBytes', () => {
  it('固定预算模式直接返回设定值', () => {
    expect(effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES, 10 ** 12)).toBe(
      TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
    );
  });

  it('跟随磁盘模式预留安全余量', () => {
    const disk = 5 * TERMINAL_HISTORY_DISK_RESERVE_BYTES;
    expect(effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_FOLLOW_DISK, disk)).toBe(
      disk - TERMINAL_HISTORY_DISK_RESERVE_BYTES,
    );
  });

  it('磁盘可用空间低于余量时下限为 0；拿不到磁盘信息时回退默认预算', () => {
    expect(effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_FOLLOW_DISK, 1)).toBe(0);
    expect(effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_FOLLOW_DISK, null)).toBe(
      TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
    );
  });
});

describe('selectSegmentsToEvict', () => {
  it('未超预算时不淘汰', () => {
    const list = [
      { tabId: 't1', seg: seg(1, [100]) },
      { tabId: 't1', seg: seg(2, [100]) },
    ];
    expect(selectSegmentsToEvict(list, 1000)).toEqual([]);
  });

  it('超预算时按 endedAt 从最旧开始淘汰（段数须超过 20 段安全阀）', () => {
    // 22 段：可淘汰区间 = 「除最近 20 段外」的最旧 2 段 = s1、s2
    const list = Array.from({ length: 22 }, (_, i) => ({ tabId: 't1', seg: seg(i + 1, [100]) }));
    expect(selectSegmentsToEvict(list, 100)).toEqual([
      { tabId: 't1', sessionId: 's1' },
      { tabId: 't1', sessionId: 's2' },
    ]);
  });

  it('跳过进行中的段（把最旧段设为 live，它位于可淘汰区间内）', () => {
    // 22 段，s1（最旧、位于可淘汰区间首）设为进行中
    const list = Array.from({ length: 22 }, (_, i) => ({
      tabId: 't1',
      seg: seg(i + 1, [100], i === 0),
    }));
    // 已结束段共 21 条 → 可淘汰区间只剩 s2；s1 虽在区间语义内但被 live 过滤跳过
    expect(selectSegmentsToEvict(list, 100)).toEqual([{ tabId: 't1', sessionId: 's2' }]);
  });

  it('至少保留最近 20 段，即使仍然超预算', () => {
    const list = Array.from({ length: TERMINAL_HISTORY_MIN_SEGMENTS_KEPT }, (_, i) => ({
      tabId: 't1',
      seg: seg(i + 1, [1000]),
    }));
    expect(selectSegmentsToEvict(list, 1)).toEqual([]);
  });
});

describe('selectLeadingChunksToEvict', () => {
  it('从头部累计，够用即停', () => {
    expect(selectLeadingChunksToEvict(seg(1, [10, 20, 40, 80]), 25)).toBe(2);
  });

  it('至少保留最后一块', () => {
    expect(selectLeadingChunksToEvict(seg(1, [10, 20]), 10 ** 9)).toBe(1);
  });
});

// ── C1 回归：磁盘快照 → 可用空间 ────────────────────────────────────────
describe('diskAvailableBytesFrom', () => {
  const GB = 1 << 30;
  const disk = (mount: string, available: number) => ({
    mount,
    total: available, // total 不影响取值，仅满足结构类型
    available,
  });

  it('优先系统盘 C:，即便另一块盘更大', () => {
    const disks = [
      disk('/data', 8 * GB), // 非系统盘，更大
      disk('C:', 1 * GB), // 系统盘，更小
    ];
    expect(diskAvailableBytesFrom(disks)).toBe(1 * GB);
  });

  it('容忍小写 c:\\ 这类 Windows 盘符写法', () => {
    const disks = [disk('c:\\', 123), disk('/mnt/x', 999)];
    expect(diskAvailableBytesFrom(disks)).toBe(123);
  });

  it('没有 C: 盘时回退到第一块盘', () => {
    const disks = [disk('/data', 7 * GB), disk('/home', 2 * GB)];
    expect(diskAvailableBytesFrom(disks)).toBe(7 * GB);
  });

  it('undefined 或空数组返回 null', () => {
    expect(diskAvailableBytesFrom(undefined)).toBeNull();
    expect(diskAvailableBytesFrom([])).toBeNull();
  });
});

// ── C1 回归：settlement 现在消费的正是 hook 产出的参数形状 ───────────────
// 这些是纯函数测试，钉死「配置预算」语义：固定值不理磁盘、0+磁盘、0+null。
// （hook 级别的 wiring 见 c1-fix-report.md：因 settle 内嵌于 useCallback 且
//  依赖 store/window，纯函数测试已覆盖其全部可判定分支，故不写空壳 hook 测试。）
describe('effectiveBudgetBytes — 配置预算语义（C1 回归）', () => {
  const GB = 1 << 30;

  it('设定 20GB → 即使传入磁盘信息也返回 20GB', () => {
    expect(effectiveBudgetBytes(20 * GB, 100 * GB)).toBe(20 * GB);
  });

  it('设定 0（跟随磁盘）+ 磁盘信息 → 磁盘 − 安全余量', () => {
    expect(effectiveBudgetBytes(0, 5 * GB)).toBe(5 * GB - GB);
  });

  it('设定 0（跟随磁盘）+ null（拿不到磁盘）→ 回退默认 1GiB', () => {
    expect(effectiveBudgetBytes(0, null)).toBe(GB);
  });
});
