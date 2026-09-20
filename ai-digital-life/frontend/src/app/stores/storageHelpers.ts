export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

let writeFailureWarned = false;

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (!writeFailureWarned) {
      writeFailureWarned = true;
      console.warn('storageHelpers.writeJson failed (further write failures suppressed):', err);
    }
  }
}

/** 仅供测试重置"仅首次告警"标记 */
export function resetWriteFailureWarning(): void {
  writeFailureWarned = false;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch (err) {
    console.warn('storageHelpers.readJson failed:', err);
  }
  return fallback;
}

export function readNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = Number(window.localStorage.getItem(key));
    if (Number.isFinite(raw)) {
      return clamp(raw, min, max);
    }
  } catch (err) {
    console.warn('storageHelpers.readNumber failed:', err);
  }
  return fallback;
}

export function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch (err) {
    console.warn('storageHelpers.writeNumber failed:', err);
  }
}
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') {
      return true;
    }
    if (raw === '0') {
      return false;
    }
  } catch (err) {
    console.warn('storageHelpers.readFlag failed:', err);
  }
  return fallback;
}

export function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch (err) {
    console.warn('storageHelpers.writeFlag failed:', err);
  }
}

export function createUiId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

/**
 * 全部去抖写入器实例。关闭/卸载路径必须把所有实例的 pending 写入同步落盘：
 * 除跨 slice 共享调度器外，部分 slice 有自己的去抖实例（如 GitHub 快照/日志缓存，
 * 300ms），只刷共享实例会让它们的最后一次写入随进程退出丢失。
 */
const debouncedWriters = new Set<{ flush: () => void }>();

export function createDebouncedWrite(waitMs: number) {
  const pendingWrites = new Map<string, unknown>();
  const pendingNumberWrites = new Map<string, number>();
  let writeScheduled = false;

  function scheduleWrite(key: string, value: unknown): void {
    pendingWrites.set(key, value);
    scheduleFlush();
  }

  function scheduleNumberWrite(key: string, value: number): void {
    pendingNumberWrites.set(key, value);
    scheduleFlush();
  }

  /**
   * 同步落盘全部 pending 写入（供关闭/卸载路径调用：去抖中的数据不等 idle 回调）。
   * 无 pending 时为空操作；幂等（已调度的 idle/定时回调稍后空跑一次，无害）。
   */
  function flush(): void {
    writeScheduled = false;
    for (const [key, value] of pendingWrites) {
      writeJson(key, value);
    }
    pendingWrites.clear();
    for (const [key, value] of pendingNumberWrites) {
      writeNumber(key, value);
    }
    pendingNumberWrites.clear();
  }

  function scheduleFlush(): void {
    if (writeScheduled) {
      return;
    }
    writeScheduled = true;
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(flush, { timeout: 500 });
    } else {
      setTimeout(flush, waitMs);
    }
  }

  const writer = { scheduleWrite, scheduleNumberWrite, flush };
  debouncedWriters.add(writer);
  return writer;
}

const crossSliceWriter = createDebouncedWrite(50);
export const scheduleCrossSliceWrite = crossSliceWriter.scheduleWrite;

/**
 * 同步落盘**所有**去抖写入器的 pending 数据。
 * 关闭/卸载时调用，确保去抖窗口内的数据（标签、历史索引、GitHub 快照等）
 * 不随进程退出丢失。
 */
export function flushCrossSliceWrites(): void {
  for (const writer of debouncedWriters) {
    writer.flush();
  }
}

/**
 * 创建绑定到指定 localStorage key 的持久化写入函数。
 * 使用共享的去抖写入调度器（50ms），跨 slice 合并写入。
 * 替代各 slice 中重复的 `const { scheduleWrite } = createDebouncedWrite(50);` 样板。
 * @param key localStorage 键名
 * @returns 接受 value 参数的写入函数
 */
export function makePersistedWriter(key: string): (value: unknown) => void {
  return (value: unknown) => scheduleCrossSliceWrite(key, value);
}

/**
 * 创建绑定到指定 localStorage key 的数字持久化写入函数。
 * 与 makePersistedWriter 共享同一 50ms 去抖实例，确保 JSON 与数字写入合并到同一次 flush。
 * @param key localStorage 键名
 * @returns 接受 number value 参数的写入函数
 */
export function makePersistedNumberWriter(key: string): (value: number) => void {
  return (value: number) => crossSliceWriter.scheduleNumberWrite(key, value);
}
