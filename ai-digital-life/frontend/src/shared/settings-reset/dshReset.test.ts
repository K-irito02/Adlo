import { describe, it, expect, vi } from 'vitest';
import { DSH_RESET_PAYLOAD, executeDshResetPlan } from './dshReset';
import type { DshResetDeps } from './dshReset';

function deps(overrides: Partial<DshResetDeps> = {}): DshResetDeps {
  return { saveSourceConfig: vi.fn(async () => true), afterReset: vi.fn(), ...overrides };
}

describe('executeDshResetPlan', () => {
  it('写回 auto + 官方 registry + 自动代理，并在成功后触发 afterReset', async () => {
    const d = deps();
    expect((await executeDshResetPlan(d)).ok).toBe(true);
    expect(d.saveSourceConfig).toHaveBeenCalledWith(DSH_RESET_PAYLOAD);
    expect(d.afterReset).toHaveBeenCalledTimes(1);
  });

  it('落盘失败时返回 failedStep=saveSourceConfig，不触发 afterReset', async () => {
    const d = deps({ saveSourceConfig: vi.fn(async () => false) });
    expect(await executeDshResetPlan(d)).toEqual({ ok: false, failedStep: 'saveSourceConfig' });
    expect(d.afterReset).not.toHaveBeenCalled();
  });
});
