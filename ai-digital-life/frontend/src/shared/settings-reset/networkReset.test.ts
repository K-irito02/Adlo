import { describe, it, expect, vi } from 'vitest';
import { NETWORK_RESET_PAYLOAD, NPMJS_URL, executeNetworkResetPlan } from './networkReset';
import type { NetworkResetDeps } from './networkReset';

function deps(overrides: Partial<NetworkResetDeps> = {}): NetworkResetDeps {
  return { saveSourceConfig: vi.fn(async () => true), ...overrides };
}

describe('executeNetworkResetPlan', () => {
  it('写回源自动 + 官方 registry + 自动代理（无版本来源、不碰下载安装）', async () => {
    const d = deps();
    expect((await executeNetworkResetPlan(d)).ok).toBe(true);
    expect(d.saveSourceConfig).toHaveBeenCalledWith(NETWORK_RESET_PAYLOAD);
    expect(NETWORK_RESET_PAYLOAD).toEqual({
      source_mode: 'auto',
      npm_registry: NPMJS_URL,
      proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
    });
    expect(NETWORK_RESET_PAYLOAD).not.toHaveProperty('version_source');
  });

  it('落盘失败时返回 failedStep=saveSourceConfig', async () => {
    const d = deps({ saveSourceConfig: vi.fn(async () => false) });
    expect(await executeNetworkResetPlan(d)).toEqual({ ok: false, failedStep: 'saveSourceConfig' });
  });
});
