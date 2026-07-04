import { describe, it, expect, vi } from 'vitest';
import { NotFoundError, NetworkError } from '../../../shared/typedErrors';
import { captureTypedError } from '../shared';
import type { StoreState } from '../StoreState';

describe('captureTypedError', () => {
  it('calls setError with formatted AppError message', () => {
    const setError = vi.fn();
    const get = vi.fn(() => ({ setError })) as unknown as () => StoreState;
    captureTypedError(get, new NotFoundError('file'));
    expect(setError).toHaveBeenCalledWith('[NOT_FOUND] Not found: file');
  });

  it('calls setError with NetworkError', () => {
    const setError = vi.fn();
    const get = vi.fn(() => ({ setError })) as unknown as () => StoreState;
    captureTypedError(get, new NetworkError('timeout'));
    expect(setError).toHaveBeenCalledWith('[NETWORK_ERROR] Network error: timeout');
  });

  it('falls back for non-AppError', () => {
    const setError = vi.fn();
    const get = vi.fn(() => ({ setError })) as unknown as () => StoreState;
    captureTypedError(get, 'plain error');
    expect(setError).toHaveBeenCalledWith('[INTERNAL_ERROR] Internal error: plain error');
  });
});
