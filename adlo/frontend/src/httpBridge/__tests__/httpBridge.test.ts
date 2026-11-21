import { describe, expect, it, vi, beforeEach } from 'vitest';

interface JsonResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function jsonResponse(status: number, body: unknown): JsonResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function mockFetch(...responses: JsonResponse[]) {
  const fetchMock = vi.fn<typeof fetch>();
  let i = 0;
  fetchMock.mockImplementation(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createHttpBridge', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps workspace.open to POST /workspace/open with workspacePath body', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: { id: 'w-1' } }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.workspace.open('/repo');
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    const body = typeof init?.body === 'string' ? init.body : '{}';
    expect(JSON.parse(body)).toEqual({ workspacePath: '/repo' });
  });

  it('maps workspace.open create option into the request body', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: { id: 'w-1' } }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });

    await bridge.workspace.open('/repo', { create: true });
    const withCreate = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(typeof withCreate?.body === 'string' ? withCreate.body : '{}')).toEqual({
      workspacePath: '/repo',
      create: true,
    });

    await bridge.workspace.open('/repo', { create: false });
    const withoutCreate = fetchMock.mock.calls[1]?.[1];
    const withoutCreateBody = typeof withoutCreate?.body === 'string' ? withoutCreate.body : '{}';
    expect(JSON.parse(withoutCreateBody)).toEqual({
      workspacePath: '/repo',
    });
  });

  it('maps github.getJobLogs to POST /ci/job-logs with { config, runId }', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: {} }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.github.getJobLogs({ owner: 'o', repo: 'r', branch: 'main' }, 42);
    const init = fetchMock.mock.calls[0]?.[1];
    const body = typeof init?.body === 'string' ? init.body : '{}';
    expect(JSON.parse(body)).toEqual({
      config: { owner: 'o', repo: 'r', branch: 'main' },
      runId: 42,
    });
  });

  it('passes through a structured server error from a non-2xx response', async () => {
    mockFetch(jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'not found' } }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.workspace.listRecent();
    expect(res).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'not found' },
    });
  });

  it('returns HTTP__ERROR when a non-2xx response has no structured body', async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('boom');
      },
    });
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.workspace.listRecent();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('HTTP__ERROR');
      expect(res.error.message).toContain('500');
    }
  });

  it('returns NETWORK_ERROR when fetch rejects', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.workspace.listRecent();
    expect(res).toEqual({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'failed to fetch' },
    });
  });

  it('provides a typed NOT_SUPPORTED fallback for pty (no fetch route exists)', async () => {
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.pty.create({ cols: 80, rows: 24 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('NOT_SUPPORTED');
    }
  });

  it('resolveAdlServerBaseUrl falls back to the default ad-server address', async () => {
    const { resolveAdlServerBaseUrl, DEFAULT_ADL_SERVER_BASE_URL } =
      await import('../../httpBridge');
    expect(resolveAdlServerBaseUrl()).toBe(DEFAULT_ADL_SERVER_BASE_URL);
  });

  it('resolves baseUrl from VITE_ADL_SERVER_URL when set', async () => {
    vi.stubEnv('VITE_ADL_SERVER_URL', 'http://127.0.0.1:12345/');
    const { resolveAdlServerBaseUrl } = await import('../../httpBridge');
    expect(resolveAdlServerBaseUrl()).toBe('http://127.0.0.1:12345');
  });
});

describe('createHttpBridge storage domain', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  const patch = {
    mode: 'unified' as const,
    root: 'D:/adl',
    categories: {},
    retainSource: false,
  };

  it('maps storage.getStatus to POST /storage/status', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: { mode: 'unified' } }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.storage.getStatus();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:9999/storage/status');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('maps storage.scanForeign to POST /storage/scan-foreign', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: [] }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.storage.scanForeign();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:9999/storage/scan-foreign');
  });

  it('maps storage.preflight to POST /storage/preflight with { patch }', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: { ok: true } }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.storage.preflight(patch);
    const init = fetchMock.mock.calls[0]?.[1];
    const body = typeof init?.body === 'string' ? init.body : '{}';
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:9999/storage/preflight');
    expect(JSON.parse(body)).toEqual({ patch });
  });

  it('maps storage.setPaths to POST /storage/set-paths with { patch, applyNow }', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: { restartRequired: true } }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.storage.setPaths(patch, true);
    const init = fetchMock.mock.calls[0]?.[1];
    const body = typeof init?.body === 'string' ? init.body : '{}';
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:9999/storage/set-paths');
    expect(JSON.parse(body)).toEqual({ patch, applyNow: true });
  });

  it('maps storage.cancelPending to POST /storage/cancel-pending', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: null }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.storage.cancelPending();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:9999/storage/cancel-pending');
  });

  it('returns NOT_SUPPORTED for storage.restartApp (B5: browser cannot restart)', async () => {
    mockFetch(jsonResponse(200, { ok: true, data: null }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.storage.restartApp();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('NOT_SUPPORTED');
    }
  });
});

describe('createHttpBridge — clipboard asset URLs', () => {
  async function makeBridge() {
    const { createHttpBridge } = await import('../../httpBridge');
    return createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
  }

  it('builds encoded basename-only image URLs (Windows and POSIX paths)', async () => {
    const bridge = await makeBridge();
    expect(bridge.clipboard.getImageUrl('C:\\clip\\images\\a b.png')).toBe(
      'http://127.0.0.1:9999/clipboard/image/a%20b.png',
    );
    expect(bridge.clipboard.getImageUrl('/x/y/z.png')).toBe(
      'http://127.0.0.1:9999/clipboard/image/z.png',
    );
  });

  it('builds thumbnail URLs with the same rules (Windows and POSIX paths)', async () => {
    const bridge = await makeBridge();
    expect(bridge.clipboard.getThumbUrl('C:\\clip\\thumbs\\thumb-1.png')).toBe(
      'http://127.0.0.1:9999/clipboard/thumb/thumb-1.png',
    );
    expect(bridge.clipboard.getThumbUrl('/x/y/thumb-2.png')).toBe(
      'http://127.0.0.1:9999/clipboard/thumb/thumb-2.png',
    );
  });

  it('returns an empty string for missing or degenerate paths', async () => {
    const bridge = await makeBridge();
    expect(bridge.clipboard.getImageUrl('')).toBe('');
    expect(bridge.clipboard.getThumbUrl('')).toBe('');
    expect(bridge.clipboard.getImageUrl('a/b/')).toBe('');
    expect(bridge.clipboard.getThumbUrl('a/b/')).toBe('');
  });
});
