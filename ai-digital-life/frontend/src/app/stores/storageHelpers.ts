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

export const { scheduleWrite: scheduleCrossSliceWrite } = createDebouncedWrite(50);
