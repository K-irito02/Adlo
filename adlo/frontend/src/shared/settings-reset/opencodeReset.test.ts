import { describe, it, expect, vi } from 'vitest';
import { executeOpencodeResetPlan } from './opencodeReset';
import type { OpencodeResetDeps } from './opencodeReset';

function deps(overrides: Partial<OpencodeResetDeps> = {}): OpencodeResetDeps {
  return {
    saveVersionSource: vi.fn(async () => true),
    setTerminalInjection: vi.fn(async () => true),
    ...overrides,
  };
}

describe('executeOpencodeResetPlan', () => {
  it('写回版本来源自动 + 终端默认启用（顺序：先来源后终端）', async () => {
    const d = deps();
    const order: string[] = [];
    d.saveVersionSource = vi.fn(async () => {
      order.push('source');
      return true;
    });
    d.setTerminalInjection = vi.fn(async () => {
      order.push('terminal');
      return true;
    });
    expect((await executeOpencodeResetPlan(d)).ok).toBe(true);
    expect(d.saveVersionSource).toHaveBeenCalledWith('auto');
    expect(d.setTerminalInjection).toHaveBeenCalledWith(true);
    expect(order).toEqual(['source', 'terminal']);
  });

  it('来源落盘失败时返回 failedStep=saveSourceConfig 且不再写终端', async () => {
    const d = deps({ saveVersionSource: vi.fn(async () => false) });
    expect(await executeOpencodeResetPlan(d)).toEqual({
      ok: false,
      failedStep: 'saveSourceConfig',
    });
    expect(d.setTerminalInjection).not.toHaveBeenCalled();
  });

  it('终端落盘失败时返回 failedStep=terminalInjection', async () => {
    const d = deps({ setTerminalInjection: vi.fn(async () => false) });
    expect(await executeOpencodeResetPlan(d)).toEqual({
      ok: false,
      failedStep: 'terminalInjection',
    });
  });
});
