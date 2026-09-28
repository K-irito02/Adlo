import { describe, it, expect, vi } from 'vitest';
import { DSH_RESET_PAYLOAD, executeDshResetPlan } from './dshReset';
import type { DshResetDeps } from './dshReset';

function deps(overrides: Partial<DshResetDeps> = {}): DshResetDeps {
  return { saveSourceConfig: vi.fn(async () => true), ...overrides };
}

describe('executeDshResetPlan', () => {
  it('写回 auto + 官方 registry + 自动代理', async () => {
    const d = deps();
    expect((await executeDshResetPlan(d)).ok).toBe(true);
    expect(d.saveSourceConfig).toHaveBeenCalledWith(DSH_RESET_PAYLOAD);
  });

  it('落盘失败时返回 failedStep=saveSourceConfig', async () => {
    const d = deps({ saveSourceConfig: vi.fn(async () => false) });
    expect(await executeDshResetPlan(d)).toEqual({ ok: false, failedStep: 'saveSourceConfig' });
  });
});
