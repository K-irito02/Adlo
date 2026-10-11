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
 *
 * Phase 4 R5（用户决策）：app 域**不做**可达性回退 —— 不可达即响亮失败
 * （`ok:false` + `NETWORK_ERROR`），由 bootstrap 的 captureError 呈现错误卡，
 * 不再静默使用 mock 数据（静默 mock 曾掩盖"后端没起来"的真实故障）。
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

/** 内存 config 服务端：镜像 crates/server/src/handlers/app.rs 的语义（含信封）。 */
function createAppServerMock(initial: MockConfig, options: { failPreferences?: number } = {}) {
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
      if (options.failPreferences) {
        return {
          ok: false,
          status: options.failPreferences,
          json: async () => ({
            ok: false,
            error: { code: 'INTERNAL_ERROR', message: 'boom' },
          }),
        } as Response;
      }
      const patch = JSON.parse(String(init?.body ?? '{}')) as MockConfig;
      Object.assign(config, patch);
      return okJson({
        ok: true,
        data: {
          info: { appName: 'AI Digital Life', config },
          sessionLockedFields: [],
        },
      });
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

  async function setupBridge(options: { reachable?: boolean; failPreferences?: number } = {}) {
    const reachable = options.reachable ?? true;
    const server = createAppServerMock(BASE_CONFIG, {
      failPreferences: options.failPreferences,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!reachable) {
        // 后端整体不可达：所有路由（含 /health 与 /app/*）均网络失败。
        throw new Error('ECONNREFUSED');
      }
      if (url.includes('/health')) {
        return okJson({});
      }
      return server.fetchMock(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { setupPreviewBridge } = await import('../index');
    await setupPreviewBridge();
    const bridge = (window as { digitalLife: DigitalLifeBridge }).digitalLife;
    return { bridge, fetchMock, config: server.config };
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
      expect(res.data.info.config.logLevel).toBe('debug');
      expect(res.data.sessionLockedFields).toEqual([]);
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
      expect(res.data.info.config.terminalLogMode).toBe('append');
      expect(res.data.info.config.debugLogMode).toBe('multi');
    }
    const prefsCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/app/preferences'));
    expect(prefsCall).toBeDefined();
    expect(JSON.parse(String((prefsCall?.[1] as RequestInit).body))).toEqual({
      terminalLogMode: 'append',
      debugLogMode: 'multi',
    });
  });

  it('fails loudly (no mock fallback) when the ad-server is unreachable', async () => {
    // Phase 4 R5：不可达即失败，不回退 mock。调用方（bootstrap）凭 ok:false
    // 以错误卡响亮呈现，而不是拿到看似正常的 mock 数据。
    const { bridge, fetchMock } = await setupBridge({ reachable: false });

    const info = await bridge.app.getInfo();
    expect(info.ok).toBe(false);
    if (!info.ok) {
      expect(info.error.code).toBe('NETWORK_ERROR');
    }
    // 请求确实打向了真实后端（不是 mock 短路）。
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/app/info'), expect.anything());
    const prefs = await bridge.app.updatePreferences({ logLevel: 'debug' });
    expect(prefs.ok).toBe(false);
    if (!prefs.ok) {
      expect(prefs.error.code).toBe('NETWORK_ERROR');
    }
    // 更新请求同样打向了真实后端（不是 mock 短路）。
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/app/preferences'),
      expect.anything(),
    );
  });

  it('does not fall back to mock when /app/preferences returns 500', async () => {
    // 业务错误透传：只有网络错才（在其它域）考虑回退，app 域一律不回退。
    const { bridge, fetchMock } = await setupBridge({ failPreferences: 500 });

    const prefs = await bridge.app.updatePreferences({ logLevel: 'debug' });
    expect(prefs.ok).toBe(false);
    if (!prefs.ok) {
      // 透传的是业务错误码，而非网络错。
      expect(prefs.error.code).toBe('INTERNAL_ERROR');
    }
    // 请求确实打向了真实后端（不是 mock 短路）。
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/app/preferences'),
      expect.anything(),
    );
  });
});
