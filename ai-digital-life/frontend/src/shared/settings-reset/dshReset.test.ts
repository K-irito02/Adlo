import { describe, it, expect, vi } from 'vitest';
import { DSH_RESET_PAYLOAD, executeDshResetPlan } from './dshReset';
import type { DshResetDeps } from './dshReset';

function deps(overrides: Partial<DshResetDeps> = {}): DshResetDeps {
  return { saveSourceConfig: vi.fn(async () => true), ...overrides };
}

describe('executeDshResetPlan', () => {
  it('只写回版本来源自动（源/代理已拆归 network，不重复执行）', async () => {
    const d = deps();
    expect((await executeDshResetPlan(d)).ok).toBe(true);
    expect(d.saveSourceConfig).toHaveBeenCalledWith(DSH_RESET_PAYLOAD);
    expect(DSH_RESET_PAYLOAD).toEqual({ version_source: 'auto' });
  });

  it('落盘失败时返回 failedStep=saveSourceConfig', async () => {
    const d = deps({ saveSourceConfig: vi.fn(async () => false) });
    expect(await executeDshResetPlan(d)).toEqual({ ok: false, failedStep: 'saveSourceConfig' });
  });
});
