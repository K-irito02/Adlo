import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readJson,
  writeJson,
  writeNumber,
  writeFlag,
  resetWriteFailureWarning,
} from './storageHelpers';

describe('storageHelpers error logging', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetWriteFailureWarning();
  });

  it('writeJson logs console.warn on QuotaExceededError', () => {
    const error = new DOMException('Quota exceeded', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw error;
    });
    writeJson('test-key', { data: 'value' });
    expect(warnSpy).toHaveBeenCalledWith(
      'storageHelpers.writeJson failed (further write failures suppressed):',
      error,
    );
  });

  it('writeJson logs console.warn on other errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Write failed');
    });
    writeJson('test-key', { data: 'value' });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('writeJson warns only once across consecutive failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Write failed');
    });
    writeJson('test-key-1', { data: 'value' });
    writeJson('test-key-2', { data: 'value' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('readJson logs console.warn on parse error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{invalid json');
    readJson('test-key', { fallback: true });
    expect(warnSpy).toHaveBeenCalledWith(
      'storageHelpers.readJson failed:',
      expect.any(SyntaxError),
    );
  });

  it('writeNumber logs console.warn on error', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Write failed');
    });
    writeNumber('test-key', 42);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('writeFlag logs console.warn on error', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Write failed');
    });
    writeFlag('test-key', true);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('registerFlushOnPageHide', () => {
  beforeEach(() => {
    // 本文件前面的用例把 Storage.prototype.getItem/setItem 桩成了抛错/坏数据实现
    // 且从不还原；此处恢复原生 localStorage（与 T3 的 hydrate.test.ts 同一卫生模式）。
    vi.restoreAllMocks();
  });

  it('flushOnPageHide flushes pending writes when pagehide fires', async () => {
    const { registerFlushOnPageHide, scheduleCrossSliceWrite } = await import('./storageHelpers');
    const dispose = registerFlushOnPageHide();
    try {
      localStorage.clear();
      scheduleCrossSliceWrite('adl:__probe', { ok: true });
      window.dispatchEvent(new Event('pagehide'));
      expect(localStorage.getItem('adl:__probe')).toBe('{"ok":true}');
    } finally {
      dispose();
      localStorage.removeItem('adl:__probe');
    }
  });

  it('flushOnPageHide also flushes when the document becomes hidden', async () => {
    const { registerFlushOnPageHide, scheduleCrossSliceWrite } = await import('./storageHelpers');
    const dispose = registerFlushOnPageHide();
    const original = document.visibilityState;
    try {
      localStorage.clear();
      scheduleCrossSliceWrite('adl:__probe2', { ok: true });
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(localStorage.getItem('adl:__probe2')).toBe('{"ok":true}');
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: original, configurable: true });
      dispose();
      localStorage.removeItem('adl:__probe2');
    }
  });
});
