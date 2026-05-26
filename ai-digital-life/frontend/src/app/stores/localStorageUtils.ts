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
  } catch {
    /* ignore */
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
  } catch {
    /* ignore */
  }
}
