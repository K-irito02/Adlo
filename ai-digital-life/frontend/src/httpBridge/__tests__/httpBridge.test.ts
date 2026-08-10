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

  it('maps conversation.createSession to POST /session', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: { id: 's-1' } }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.conversation.createSession('x');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res).toEqual({ ok: true, data: { id: 's-1' } });
  });

  it('maps conversation.listSessions to GET /sessions', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: [] }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.conversation.listSessions();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/sessions',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('maps conversation.getSession to GET /session/:id', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: { id: 's-1' } }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.conversation.getSession('s-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/session/s-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('maps conversation.getSessionMessages to GET /session/:id/message and passes through the Part payload', async () => {
    const payload = {
      messages: [
        {
          message: {
            id: 'm-1',
            sessionID: 's-1',
            role: 'assistant',
            timeCreated: 1700000000000,
          },
          parts: [
            {
              id: 'p-1',
              messageID: 'm-1',
              sessionID: 's-1',
              type: 'tool',
              ordinal: 0,
              timeCreated: 1700000000000,
              data: {
                type: 'tool',
                tool: 'read',
                callID: 'c-1',
                state: { status: 'pending', input: { path: 'a.txt' } },
              },
            },
          ],
        },
      ],
    };
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: payload }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.conversation.getSessionMessages('s-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/session/s-1/message',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(res).toEqual({ ok: true, data: payload });
  });

  it('maps conversation.getSessionMessages to a NOT_FOUND-structured error for a missing session', async () => {
    const fetchMock = mockFetch(
      jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'session not found' } }),
    );
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.conversation.getSessionMessages('missing');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/session/missing/message',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(res).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'session not found' },
    });
  });

  it('maps conversation.renameSession to PATCH /session/:id with { title } body', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: { id: 's-1' } }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.conversation.renameSession({ sessionId: 's-1', title: 'New' });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('PATCH');
    const body = typeof init?.body === 'string' ? init.body : '{}';
    expect(JSON.parse(body)).toEqual({ title: 'New' });
  });

  it('maps conversation.cancelMessage to run-id abort route POST /agent/run/:id/abort', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: null }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.conversation.cancelMessage('run-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/agent/run/run-1/abort',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('maps conversation.replyToQuestion to POST /question/:id/reply and tolerates an empty-body 200', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => {
        throw new Error('empty body');
      },
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.conversation.replyToQuestion('q-1', ['Approve']);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/question/q-1/reply',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    const body = typeof init?.body === 'string' ? init.body : '{}';
    expect(JSON.parse(body)).toEqual({ answers: ['Approve'] });
    expect(res).toEqual({ ok: true, data: true });
  });

  it('maps conversation.replyToQuestion error to the structured server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '',
        json: async () => ({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'question not found' },
        }),
      } as unknown as Response),
    );
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.conversation.replyToQuestion('missing', []);
    expect(res).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'question not found' },
    });
  });

  it('maps provider.getProviderApiKey to the write-only has route and returns null', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: true }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.provider.getProviderApiKey('openai');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/provider/api-key/has',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res).toEqual({ ok: true, data: null });
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
    mockFetch(
      jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'session not found' } }),
    );
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.conversation.getSession('missing');
    expect(res).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'session not found' },
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
    const res = await bridge.conversation.listSessions();
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
    const res = await bridge.conversation.listSessions();
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
