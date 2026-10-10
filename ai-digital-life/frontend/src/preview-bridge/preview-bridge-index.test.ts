import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DigitalLifeBridge } from '../shared/ipc/digital-life';

/**
 * TDD RED/GREEN for Task 7 fix wave 4: in browser+server mode the workspace
 * merge must keep `pickDirectory` / `revealInFileManager` (and the `reserved`
 * domain) on the real preview/mock impls — never route them to the httpBridge
 * `taskNotSupported` stubs when the ad-server is reachable.
 */

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function notOkJson(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({ ok: false, error: { code: 'HTTP__ERROR', message: `HTTP ${status}` } }),
  } as Response;
}

describe('preview-bridge reachable-server workspace merge (Task 7 wave 4)', () => {
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

  async function setupBridge(): Promise<{
    bridge: DigitalLifeBridge;
    fetchMock: ReturnType<typeof vi.fn>;
  }> {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/health')) {
        return Promise.resolve(okJson({}));
      }
      if (url.includes('/__adl_preview_api__/workspace/pick-directory')) {
        return Promise.resolve(okJson({ ok: true, data: '/picked/path' }));
      }
      if (url.includes('/__adl_preview_api__/workspace/reveal')) {
        return Promise.resolve(okJson({ ok: true, data: true }));
      }
      if (url.includes('/__adl_preview_api__/clipboard/save-file')) {
        return Promise.resolve(okJson({ ok: true, data: { path: 'E:/out.txt' } }));
      }
      if (url.includes('/sidebar/list')) {
        return Promise.resolve(okJson({ ok: true, data: [] }));
      }
      return Promise.resolve(okJson({ ok: true, data: null }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { setupPreviewBridge } = await import('./index');
    await setupPreviewBridge();
    const bridge = (window as { digitalLife: DigitalLifeBridge }).digitalLife;
    return { bridge, fetchMock };
  }

  it(
    'workspace.pickDirectory uses the real preview impl when the ad-server is reachable (not the NOT_SUPPORTED stub)',
    { timeout: 10000 },
    async () => {
      const { bridge, fetchMock } = await setupBridge();
      const res = await bridge.workspace.pickDirectory();

      expect(res).toEqual({ ok: true, data: '/picked/path' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/__adl_preview_api__/workspace/pick-directory'),
        expect.anything(),
      );
    },
  );

  it(
    'clipboard.saveToFile routes to the dev preview service (not the NOT_SUPPORTED httpBridge stub)',
    { timeout: 10000 },
    async () => {
      const { bridge, fetchMock } = await setupBridge();
      const res = await bridge.clipboard.saveToFile({
        suggestedName: 'clipboard-c1.txt',
        dataBase64: 'aGk=',
      });

      expect(res).toEqual({ ok: true, data: { path: 'E:/out.txt' } });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/__adl_preview_api__/clipboard/save-file'),
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse(
        (
          fetchMock.mock.calls.find((c) =>
            String(c[0]).includes('/clipboard/save-file'),
          )?.[1] as RequestInit
        ).body as string,
      );
      expect(body).toEqual({ suggestedName: 'clipboard-c1.txt', dataBase64: 'aGk=' });
    },
  );

  it(
    'workspace.revealInFileManager uses the real preview impl when the ad-server is reachable (not the NOT_SUPPORTED stub)',
    { timeout: 10000 },
    async () => {
      const { bridge, fetchMock } = await setupBridge();
      const res = await bridge.workspace.revealInFileManager('E:/project/src/main.ts');

      expect(res).toEqual({ ok: true, data: true });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/__adl_preview_api__/workspace/reveal'),
        expect.anything(),
      );
    },
  );

  it(
    'workspace.pickDirectory / revealInFileManager never resolve to the httpBridge NOT_SUPPORTED stub',
    { timeout: 10000 },
    async () => {
      const { bridge } = await setupBridge();
      const picked = await bridge.workspace.pickDirectory();
      const revealed = await bridge.workspace.revealInFileManager('E:/x/y.ts');

      expect(picked.ok).toBe(true);
      expect(revealed.ok).toBe(true);
      if (!picked.ok || !revealed.ok) {
        return;
      }
      expect(picked.data).toBe('/picked/path');
      expect(revealed.data).toBe(true);
    },
  );

  it('keeps the composed clipboard key set identical to http', { timeout: 10000 }, async () => {
    // preview clipboard 系 http-or-mock spread + 全覆盖：加专属键而不同步契约时告警。
    const { bridge } = await setupBridge();
    const { createHttpBridge } = await import('../httpBridge');
    const http = createHttpBridge({ baseUrl: 'http://127.0.0.1:1' });
    expect(Object.keys(bridge.clipboard).sort()).toEqual(Object.keys(http.clipboard).sort());
  });

  it(
    'workspace.pickDirectory / revealInFileManager still use the preview impl in the fallback (unreachable) case',
    { timeout: 10000 },
    async () => {
      vi.resetModules();
      delete (window as { digitalLife?: unknown }).digitalLife;
      vi.stubEnv('VITE_ADL_SERVER_URL', 'http://127.0.0.1:9999');
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/health')) {
          return Promise.resolve(notOkJson(503));
        }
        if (url.includes('/__adl_preview_api__/workspace/pick-directory')) {
          return Promise.resolve(okJson({ ok: true, data: '/picked/path' }));
        }
        if (url.includes('/__adl_preview_api__/workspace/reveal')) {
          return Promise.resolve(okJson({ ok: true, data: true }));
        }
        return Promise.resolve(okJson({ ok: true, data: null }));
      });
      vi.stubGlobal('fetch', fetchMock);
      const { setupPreviewBridge } = await import('./index');
      await setupPreviewBridge();
      const bridge = (window as { digitalLife: DigitalLifeBridge }).digitalLife;

      const picked = await bridge.workspace.pickDirectory();
      const revealed = await bridge.workspace.revealInFileManager('E:/x/y.ts');

      expect(picked).toEqual({ ok: true, data: '/picked/path' });
      expect(revealed).toEqual({ ok: true, data: true });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/__adl_preview_api__/workspace/pick-directory'),
        expect.anything(),
      );
    },
  );

  it('keeps the remaining business workspace RPCs on the httpBridge (HTTP routes) when reachable', async () => {
    const { bridge, fetchMock } = await setupBridge();
    const res = await bridge.workspace.listRecent();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/sidebar/list',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res.ok).toBe(true);
  });

  it('reserved domain stays on the preview/mock impl, not the httpBridge NOT_SUPPORTED stubs', async () => {
    const { bridge } = await setupBridge();
    const res = await bridge.reserved.acpGetConfig();

    expect(res).toEqual({ ok: true, data: { enabled: false, port: null } });
  });
});

describe('preview-bridge browser workspace.onFileChanged sync unsubscribe (Task 7 wave 5)', () => {
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

  async function setupBridge(
    fetchImpl: (input: RequestInfo | URL) => Promise<Response>,
  ): Promise<DigitalLifeBridge> {
    vi.stubGlobal('fetch', vi.fn(fetchImpl));
    const { setupPreviewBridge } = await import('./index');
    await setupPreviewBridge();
    return (window as { digitalLife: DigitalLifeBridge }).digitalLife;
  }

  const reachableFetch: (input: RequestInfo | URL) => Promise<Response> = (input) => {
    const url = String(input);
    if (url.includes('/health')) {
      return Promise.resolve(okJson({}));
    }
    return Promise.resolve(okJson({ ok: true, data: null }));
  };

  const unreachableFetch: (input: RequestInfo | URL) => Promise<Response> = (input) => {
    const url = String(input);
    if (url.includes('/health')) {
      return Promise.resolve(notOkJson(503));
    }
    return Promise.resolve(okJson({ ok: true, data: null }));
  };

  it('returns a synchronous unsubscribe (not a Promise) when the ad-server is reachable, and it is callable', async () => {
    const bridge = await setupBridge(reachableFetch);

    const unsubscribe = bridge.workspace.onFileChanged(() => {});

    expect(typeof unsubscribe).toBe('function');
    expect((unsubscribe as { then?: unknown }).then).toBeUndefined();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('returns a synchronous unsubscribe (not a Promise) in the fallback (unreachable) case too', async () => {
    const bridge = await setupBridge(unreachableFetch);

    const unsubscribe = bridge.workspace.onFileChanged(() => {});

    expect(typeof unsubscribe).toBe('function');
    expect((unsubscribe as { then?: unknown }).then).toBeUndefined();
    expect(() => unsubscribe()).not.toThrow();
  });
});
