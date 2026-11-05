import { describe, expect, it } from 'vitest';
import { systemOpenPathRoute } from './index';

describe('preview /system/open-path route validation', () => {
  it('rejects a missing path', async () => {
    const result = await systemOpenPathRoute({});
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('rejects a blank path', async () => {
    const result = await systemOpenPathRoute({ path: '   ' });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('rejects a non-object body', async () => {
    const result = await systemOpenPathRoute(undefined);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });
});
