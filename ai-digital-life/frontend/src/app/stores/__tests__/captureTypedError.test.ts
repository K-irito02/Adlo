import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '../../../shared/typedErrors';
import { captureError } from '../shared';
import type { StoreState } from '../StoreState';

describe('captureError', () => {
  it('reports an AppError with its code and raw message', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, new NotFoundError('file'));
    expect(reportError).toHaveBeenCalledWith('NOT_FOUND', 'Not found: file');
  });

  it('reports typed code+message objects via fromIpcErrorCode', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, { code: 'NETWORK_ERROR', message: 'timeout' });
    expect(reportError).toHaveBeenCalledWith('NETWORK_ERROR', 'Network error: timeout');
  });

  it('falls back to a plain message with empty code for strings', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, 'plain error');
    expect(reportError).toHaveBeenCalledWith('', 'plain error');
  });
});
