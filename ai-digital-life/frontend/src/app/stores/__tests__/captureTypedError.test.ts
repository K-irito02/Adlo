import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '../../../shared/typedErrors';
import { captureError } from '../shared';
import type { StoreState } from '../StoreState';

describe('captureError', () => {
  it('reports an AppError with its code and raw message', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, new NotFoundError('file'));
    expect(reportError).toHaveBeenCalledWith('NOT_FOUND', 'Not found: file', undefined);
  });

  it('reports typed code+message objects via fromIpcErrorCode', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, { code: 'NETWORK_ERROR', message: 'timeout' });
    expect(reportError).toHaveBeenCalledWith('NETWORK_ERROR', 'Network error: timeout', undefined);
  });

  it('preserves unknown codes instead of rewriting them to INTERNAL_ERROR', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, { code: 'CUSTOM_CODE', message: 'something custom' });
    expect(reportError).toHaveBeenCalledWith('CUSTOM_CODE', 'something custom', undefined);
  });

  it('falls back to a plain message with empty code for strings', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, 'plain error');
    expect(reportError).toHaveBeenCalledWith('', 'plain error', undefined);
  });

  it('passes the scope through to reportError', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, { code: 'NOT_FOUND', message: 'missing' }, 'gitBranchActions');
    expect(reportError).toHaveBeenCalledWith('NOT_FOUND', 'Not found: missing', 'gitBranchActions');
  });
});
