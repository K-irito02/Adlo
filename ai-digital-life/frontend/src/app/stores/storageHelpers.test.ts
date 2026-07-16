import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readJson,
  writeJson,
  readNumber,
  writeNumber,
  readFlag,
  writeFlag,
} from './storageHelpers';

describe('storageHelpers error logging', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('writeJson logs console.warn on QuotaExceededError', () => {
    const error = new DOMException('Quota exceeded', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw error;
    });
    writeJson('test-key', { data: 'value' });
    expect(warnSpy).toHaveBeenCalledWith('storageHelpers.writeJson failed:', error);
  });

  it('writeJson logs console.warn on other errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Write failed');
    });
    writeJson('test-key', { data: 'value' });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('readJson logs console.warn on parse error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{invalid json');
    readJson('test-key', { fallback: true });
    expect(warnSpy).toHaveBeenCalledWith(
      'storageHelpers.readJson failed:',
      expect.any(SyntaxError)
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
