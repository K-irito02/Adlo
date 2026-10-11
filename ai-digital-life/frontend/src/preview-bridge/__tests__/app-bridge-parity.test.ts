import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DigitalLifeBridge } from '../../shared/ipc/digital-life';

/**
 * 三端一致性（bridge-three-implementation）：浏览器模式 app 域的
 * getInfo / updatePreferences 必须真实可用，而非 httpBridge 的
 * NOT_SUPPORTED 桩。设置面板（日志级别/终端日志模式/调试日志模式等）
 * 依赖 bootstrap 的 getInfo 提供 appInfo，依赖 updatePreferences 持久化。
 *
 * 无状态 mock 会让本测试重新沦为假信心，故这里用一个最小「config.json 服务端」
 * 模拟 `/app/info` + `/app/preferences` 的读写往返。
 */

type MockConfig = Record<string, unknown>;

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function notFound(): Response {
  return {
    ok: false,
    status: 404,
    json: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'no route' } }),
  } as Response;
}

/** 内存 config 服务端：镜像 crates/server/src/handlers/app.rs 的语义。 */
function createAppServerMock(initial: MockConfig) {
  const config: MockConfig = { ...initial };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/health')) {
      return okJson({});
    }
    if (url.endsWith('/app/info')) {
      return okJson({ ok: true, data: { appName: 'AI Digital Life', config } });
    }
    if (url.endsWith('/app/preferences')) {
      const patch = JSON.parse(String(init?.body ?? '{}')) as MockConfig;
      Object.assign(config, patch);
      return okJson({ ok: true, data: { appName: 'AI Digital Life', config } });
    }
    return notFound();
  });
  return { fetchMock, config };
}

const BASE_CONFIG: MockConfig = {
  language: 'zh-CN',
  themeMode: 'system',
  logLevel: 'info',
  terminalLogMode: 'overwrite',
  debugLogMode: 'overwrite',
};

describe('preview-bridge app domain parity (getInfo / updatePreferences)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as { digitalLife?: unknown }).digitalLife;
    window.localStorage.clear();
    vi.stubEnv('VITE_ADL_SERVER_URL', 'http://127.0.0.1:9999');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete (window as { digitalLife?: unknown }).digitalLife;
  });

  async function setupBridge() {
    const server = createAppServerMock(BASE_CONFIG);
    vi.stubGlobal('fetch', server.fetchMock);
    const { setupPreviewBridge } = await import('../index');
    await setupPreviewBridge();
    const bridge = (window as { digitalLife: DigitalLifeBridge }).digitalLife;
    return { bridge, ...server };
  }

  it('app.getInfo returns ok with the server config (not NOT_SUPPORTED)', async () => {
    const { bridge, fetchMock } = await setupBridge();
    const res = await bridge.app.getInfo();

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.config.logLevel).toBe('info');
    }
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/app/info'), expect.anything());
  });

  it('app.updatePreferences persists the patch and echoes the updated config', async () => {
    const { bridge, config } = await setupBridge();

    const res = await bridge.app.updatePreferences({ logLevel: 'debug' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.config.logLevel).toBe('debug');
    }
    expect(config.logLevel).toBe('debug');
  });

  it('updatePreferences round-trips both log modes through the returned config', async () => {
    const { bridge, fetchMock } = await setupBridge();

    const res = await bridge.app.updatePreferences({
      terminalLogMode: 'append',
      debugLogMode: 'multi',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.config.terminalLogMode).toBe('append');
      expect(res.data.config.debugLogMode).toBe('multi');
    }
    const prefsCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/app/preferences'));
    expect(prefsCall).toBeDefined();
    expect(JSON.parse(String((prefsCall?.[1] as RequestInit).body))).toEqual({
      terminalLogMode: 'append',
      debugLogMode: 'multi',
    });
  });
});
