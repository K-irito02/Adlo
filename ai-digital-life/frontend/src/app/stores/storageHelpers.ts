export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      /* quota exceeded */
    } else {
      /* write failed */
    }
  }
}

export function readNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = Number(window.localStorage.getItem(key));
    if (Number.isFinite(raw)) {
      return clamp(raw, min, max);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      /* quota exceeded */
    } else {
      /* write failed */
    }
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
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      /* quota exceeded */
    } else {
      /* write failed */
    }
  }
}

export function createUiId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

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

  function scheduleFlush(): void {
    if (writeScheduled) {
      return;
    }
    writeScheduled = true;
    const flush = () => {
      writeScheduled = false;
      for (const [key, value] of pendingWrites) {
        writeJson(key, value);
      }
      pendingWrites.clear();
      for (const [key, value] of pendingNumberWrites) {
        writeNumber(key, value);
      }
      pendingNumberWrites.clear();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(flush, { timeout: 500 });
    } else {
      setTimeout(flush, waitMs);
    }
  }

  return { scheduleWrite, scheduleNumberWrite };
}

const crossSliceWriter = createDebouncedWrite(50);
export const scheduleCrossSliceWrite = crossSliceWriter.scheduleWrite;

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
