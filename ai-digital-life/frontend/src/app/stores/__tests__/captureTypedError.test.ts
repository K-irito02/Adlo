import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '../../../shared/typedErrors';
import { captureError } from '../shared';
import type { StoreState } from '../StoreState';

describe('captureError', () => {
  it('calls setError with formatted AppError message', () => {
    const setError = vi.fn();
    const get = vi.fn(() => ({ setError })) as unknown as () => StoreState;
    captureError(get, new NotFoundError('file'));
    expect(setError).toHaveBeenCalledWith('[NOT_FOUND] Not found: file');
  });

  it('calls setError with formatted code+message object', () => {
    const setError = vi.fn();
    const get = vi.fn(() => ({ setError })) as unknown as () => StoreState;
    captureError(get, { code: 'NETWORK_ERROR', message: 'timeout' });
    expect(setError).toHaveBeenCalledWith('[NETWORK_ERROR] Network error: timeout');
  });

  it('falls back to plain message for strings', () => {
    const setError = vi.fn();
    const get = vi.fn(() => ({ setError })) as unknown as () => StoreState;
    captureError(get, 'plain error');
    expect(setError).toHaveBeenCalledWith('plain error');
  });
});
