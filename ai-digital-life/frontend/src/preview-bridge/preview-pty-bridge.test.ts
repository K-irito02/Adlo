import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock requestPreviewApi BEFORE importing the module under test.
// Each test configures the mock implementation.
vi.mock('./preview-api', () => ({
  requestPreviewApi: vi.fn(),
}));

import { requestPreviewApi } from './preview-api';
import { createPtyBridge } from './preview-pty-bridge';

describe('createPtyBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns subscribePtyOutput and pty interface', () => {
    const bridge = createPtyBridge();
    expect(typeof bridge.subscribePtyOutput).toBe('function');
    expect(typeof bridge.pty.create).toBe('function');
    expect(typeof bridge.pty.input).toBe('function');
    expect(typeof bridge.pty.resize).toBe('function');
    expect(typeof bridge.pty.kill).toBe('function');
    expect(typeof bridge.pty.list).toBe('function');
  });

  it('subscribePtyOutput returns an unsubscribe function', () => {
    const bridge = createPtyBridge();
    const unsub = bridge.subscribePtyOutput(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('does not poll when no listeners are subscribed (after unsubscribe)', async () => {
    vi.useFakeTimers();
    const mockedRequest = vi.mocked(requestPreviewApi);
    mockedRequest.mockResolvedValue({ ok: true, data: [] });

    const bridge = createPtyBridge();
    const unsub = bridge.subscribePtyOutput(() => {});
    unsub();

    // Advance time — should NOT trigger any request because polling stopped
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('uses cursor-based incremental output protocol', async () => {
    vi.useFakeTimers();
    const mockedRequest = vi.mocked(requestPreviewApi);

    // First call: /pty/list returns one session
    // Subsequent calls: /pty/output-since returns incremental output
    mockedRequest.mockImplementation(async (pathname: string) => {
      if (pathname === '/pty/list') {
        return {
          ok: true,
          data: [
            {
              sessionId: 's1',
              shell: 'powershell',
              cwd: 'C:\\',
              cols: 80,
              rows: 24,
              status: 'Running' as const,
            },
          ],
        };
      }
      if (pathname.startsWith('/pty/output-since')) {
        return {
          ok: true,
          data: { sessionId: 's1', newOutput: 'hello\n', newCursor: 6 },
        };
      }
      return { ok: false, error: { code: 'PREVIEW_API_ERROR', message: 'unexpected' } };
    });

    const events: { sessionId: string; data: string }[] = [];
    const bridge = createPtyBridge();
    bridge.subscribePtyOutput((event) => events.push(event));

    // Advance past poll interval (1000ms)
    await vi.advanceTimersByTimeAsync(1100);

    // Should have received incremental output
    expect(events.length).toBe(1);
    expect(events[0].sessionId).toBe('s1');
    expect(events[0].data).toBe('hello\n');

    // Verify /pty/output-since was called (not just /pty/list)
    const calls = mockedRequest.mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.startsWith('/pty/output-since'))).toBe(true);
  });
});
