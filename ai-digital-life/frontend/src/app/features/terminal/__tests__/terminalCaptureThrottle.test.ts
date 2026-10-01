import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThrottledRunner } from '../terminalPtyRuntime';

afterEach(() => {
  vi.useRealTimers();
});

describe('createThrottledRunner', () => {
  it('连续触发期间按固定间隔执行，而不是被不断重置（尾去抖的替代）', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const trigger = createThrottledRunner(run, 500);

    // 模拟连续输出：每 100ms 触发一次，共 2000ms
    for (let i = 0; i < 20; i += 1) {
      trigger();
      vi.advanceTimersByTime(100);
    }
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(run.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('窗口内再次触发会在窗口结束时补执行一次（保证最后一次输出落盘）', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const trigger = createThrottledRunner(run, 500);

    trigger(); // 第一次立即执行
    expect(run).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100); // 仍在窗口内
    trigger(); // 被合并，排定窗口结束时补执行

    vi.advanceTimersByTime(400); // 窗口结束 → 补执行
    expect(run).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('第一次触发立即执行', () => {
    const run = vi.fn();
    const trigger = createThrottledRunner(run, 500);
    trigger();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
