import { describe, it, expect } from 'vitest';
import {
  createErrorToastSlice,
  ERROR_TOAST_STORE_LIMIT,
  SILENT_DIAGNOSTIC_LIMIT,
  normalizeErrorDetail,
  type ErrorToastEntry,
} from '../errorToastSlice';
import type { StoreState } from '../../StoreState';

/** 用最小可变 state 驱动切片（只需 errorToasts 参与）。 */
function makeSlice() {
  let state = { errorToasts: [] as ErrorToastEntry[] } as unknown as StoreState;
  const set = (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
  };
  const slice = createErrorToastSlice(set, () => state);
  return { slice, current: () => state.errorToasts };
}

describe('errorToastSlice 去重', () => {
  it('collapses repeated identical errors into a single toast (backend-down polling)', () => {
    const { slice, current } = makeSlice();

    const first = slice.reportError('NETWORK_ERROR', 'Network error: Failed to fetch', 'sysmon');
    const second = slice.reportError('NETWORK_ERROR', 'Network error: Failed to fetch', 'sysmon');
    const third = slice.reportError('NETWORK_ERROR', 'Network error: Failed to fetch', 'sysmon');

    expect(current()).toHaveLength(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('keeps genuinely different failures as separate toasts', () => {
    const { slice, current } = makeSlice();
    slice.reportError('NETWORK_ERROR', 'Network error: A', 'sysmon');
    slice.reportError('NETWORK_ERROR', 'Network error: B', 'sysmon');
    slice.reportError('NETWORK_ERROR', 'Network error: A', 'git');
    slice.reportError('NOT_FOUND', 'Network error: A', 'sysmon');
    expect(current()).toHaveLength(4);
  });

  it('separates silent diagnostics from visible toasts with the same payload', () => {
    const { slice, current } = makeSlice();
    slice.reportError('IO_ERROR', 'boom', 'boot');
    slice.reportSilentError('IO_ERROR', 'boom', 'boot');
    expect(current()).toHaveLength(2);
    expect(current().filter((t) => t.silent)).toHaveLength(1);
  });

  it('allows the same error again after it was dismissed', () => {
    const { slice, current } = makeSlice();
    const first = slice.reportError('NETWORK_ERROR', 'boom', 'sysmon');
    slice.dismissErrorToast(first);
    expect(current()).toHaveLength(0);
    slice.reportError('NETWORK_ERROR', 'boom', 'sysmon');
    expect(current()).toHaveLength(1);
  });

  it('still supports scoped clearing', () => {
    const { slice, current } = makeSlice();
    slice.reportError('NETWORK_ERROR', 'a', 'sysmon');
    slice.reportError('NETWORK_ERROR', 'b', 'git');
    slice.clearErrorToasts('sysmon');
    expect(current()).toHaveLength(1);
    expect(current()[0].scope).toBe('git');
  });

  it('folds details differing only in volatile fragments (port/attempt/timestamp)', () => {
    // Phase 4 F6：带变量的轮询错误也必须折叠，否则刷屏未根治。
    const { slice, current } = makeSlice();
    const first = slice.reportError(
      'NETWORK_ERROR',
      'connect 127.0.0.1:61234 failed (attempt 1)',
      'sysmon',
    );
    const second = slice.reportError(
      'NETWORK_ERROR',
      'connect 127.0.0.1:61235 failed (attempt 12)',
      'sysmon',
    );
    expect(second).toBe(first);
    expect(current()).toHaveLength(1);
  });

  it('bumps count and lastSeenAt on duplicates instead of queueing', () => {
    // Phase 4 F7：命中去重时计数 + 更新最近发生时间，供"×N/仍在发生"感知。
    const { slice, current } = makeSlice();
    const first = slice.reportError('NETWORK_ERROR', 'boom', 'sysmon');
    expect(current()[0].count).toBe(1);
    const firstSeen = current()[0].lastSeenAt;
    expect(typeof firstSeen).toBe('number');

    const second = slice.reportError('NETWORK_ERROR', 'boom', 'sysmon');
    expect(second).toBe(first);
    expect(current()).toHaveLength(1);
    expect(current()[0].count).toBe(2);
    expect(current()[0].lastSeenAt).toBeGreaterThanOrEqual(firstSeen ?? 0);
  });

  it('moves the bumped entry to the tail so fresh errors stay visible', () => {
    // Closing M-6：持续刷新的旧卡不占坑，新 distinct 错误进入最近 5 张。
    const { slice, current } = makeSlice();
    const first = slice.reportError('NETWORK_ERROR', 'old-fault', 'sysmon');
    slice.reportError('IO_ERROR', 'new-fault', 'sysmon');
    expect(current().map((e) => e.id)).toEqual([first, current()[1].id]);

    slice.reportError('NETWORK_ERROR', 'old-fault', 'sysmon');
    const ids = current().map((e) => e.id);
    expect(ids[ids.length - 1]).toBe(first);
    expect(current()[current().length - 1].count).toBe(2);
  });

  it('treats undefined scope and empty-string scope as different keys', () => {
    // Phase 4 F8：去重维度与清除维度一致 —— `clearErrorToasts('')` 清不掉
    // undefined 条目，故去重时两者也不得互斥占位。
    const { slice, current } = makeSlice();
    slice.reportError('NETWORK_ERROR', 'boom');
    slice.reportError('NETWORK_ERROR', 'boom', '');
    expect(current()).toHaveLength(2);
    slice.clearErrorToasts('');
    expect(current()).toHaveLength(1);
    expect(current()[0].scope).toBeUndefined();
  });
});

describe('errorToastSlice 队列上限（keepVisibleFirst 回归，Phase 4 F9）', () => {
  it('caps visible toasts at the store limit', () => {
    const { slice, current } = makeSlice();
    for (let i = 0; i < ERROR_TOAST_STORE_LIMIT + 10; i += 1) {
      slice.reportError('IO_ERROR', `boom-${i}`, 'boot');
    }
    expect(current()).toHaveLength(ERROR_TOAST_STORE_LIMIT);
    // 最旧的被挤出，最新的保留。
    expect(current()[0].detail).toBe('boom-10');
  });

  it('caps silent diagnostics separately without evicting visible toasts', () => {
    const { slice, current } = makeSlice();
    for (let i = 0; i < 5; i += 1) {
      slice.reportError('IO_ERROR', `visible-${i}`, 'boot');
    }
    for (let i = 0; i < SILENT_DIAGNOSTIC_LIMIT + 10; i += 1) {
      slice.reportSilentError('IO_ERROR', `silent-${i}`, 'boot');
    }
    const entries = current();
    expect(entries.filter((t) => !t.silent)).toHaveLength(5);
    expect(entries.filter((t) => t.silent)).toHaveLength(SILENT_DIAGNOSTIC_LIMIT);
  });

  it('supports scoped clearing of silent entries', () => {
    const { slice, current } = makeSlice();
    slice.reportSilentError('IO_ERROR', 'a', 'sysmon');
    slice.reportSilentError('IO_ERROR', 'b', 'git');
    slice.clearErrorToasts('sysmon');
    expect(current()).toHaveLength(1);
    expect(current()[0].scope).toBe('git');
  });

  it('clears everything (including silent) when called without scope', () => {
    const { slice, current } = makeSlice();
    slice.reportError('IO_ERROR', 'a', 'sysmon');
    slice.reportSilentError('IO_ERROR', 'b', 'git');
    slice.clearErrorToasts();
    expect(current()).toHaveLength(0);
  });

  it('dismiss removes only the matching entry', () => {
    const { slice, current } = makeSlice();
    const first = slice.reportError('IO_ERROR', 'a', 'sysmon');
    slice.reportError('IO_ERROR', 'b', 'git');
    slice.dismissErrorToast(first);
    expect(current()).toHaveLength(1);
    expect(current()[0].detail).toBe('b');
  });
});

describe('normalizeErrorDetail', () => {
  it('strips ports, IPv4, timestamps, attempt counts and durations', () => {
    expect(normalizeErrorDetail('connect 127.0.0.1:61234 failed')).toBe(
      normalizeErrorDetail('connect 127.0.0.1:59999 failed'),
    );
    expect(normalizeErrorDetail('failed (attempt 1)')).toBe(
      normalizeErrorDetail('failed (attempt 12)'),
    );
    expect(normalizeErrorDetail('at 2026-10-12T00:52:40 down')).toBe(
      normalizeErrorDetail('at 2026-10-12T00:53:01 down'),
    );
    expect(normalizeErrorDetail('timeout after 3000ms')).toBe(
      normalizeErrorDetail('timeout after 5000ms'),
    );
  });

  it('keeps genuinely different messages distinct', () => {
    expect(normalizeErrorDetail('Network error: A')).not.toBe(
      normalizeErrorDetail('Network error: B'),
    );
  });

  it('does not fold pure counters, ratios or version-like tokens (Closing M-3)', () => {
    // `line 10:20` 不是端口；`v2s`/`404s` 不是时长 —— 宁漏勿错。
    expect(normalizeErrorDetail('line 10:20')).not.toBe(normalizeErrorDetail('line 10:21'));
    expect(normalizeErrorDetail('ratio 3:2')).not.toBe(normalizeErrorDetail('ratio 3:3'));
    expect(normalizeErrorDetail('build v2s failed')).not.toBe(
      normalizeErrorDetail('build v3s failed'),
    );
    expect(normalizeErrorDetail('code 404s')).not.toBe(normalizeErrorDetail('code 405s'));
  });

  it('still folds durations with explicit units', () => {
    expect(normalizeErrorDetail('timeout after 3 seconds')).toBe(
      normalizeErrorDetail('timeout after 5 seconds'),
    );
  });

  it('normalizes full timestamps via the time rule (not just the port rule)', () => {
    // 顺序依赖锁定：time 规则先于 port 规则，完整时间戳走 #time#。
    expect(normalizeErrorDetail('down at 2026-10-12T00:52:40')).toContain('#time#');
    expect(normalizeErrorDetail('down at 2026-10-12T00:52:40')).not.toContain('#port#');
  });

  it('folds the same fault recurring across calendar dates', () => {
    // 完整时间戳整体归一：跨天复发的同一故障仍折叠（计数增长），符合刷屏治理目标。
    expect(normalizeErrorDetail('down at 2026-10-11T00:52:40')).toBe(
      normalizeErrorDetail('down at 2026-10-12T00:52:40'),
    );
  });
});
