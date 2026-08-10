import { describe, it, expect, vi } from 'vitest';

/**
 * TDD for Task 9 launch-script logic: the `dev/ad-server-launch.mjs`
 * orchestrator must (1) health-probe the real ad-server `/health` until ready
 * and (2) decide the injected `VITE_ADL_SERVER_URL` — falling back to
 * `null` (→ preview/mock bridge) when the port is missing or the probe fails.
 *
 * `dev/` is intentionally out of the tsc `include:["src"]` typecheck scope, so
 * this test lives in `src/` and imports the plain ESM helpers from the launch
 * script (the orchestrator body is guarded — it only runs as the main module,
 * so importing it here is side-effect free).
 */
import { probeAdServerHealth, decideServerBaseUrl } from '../../dev/ad-server-launch.mjs';

function okHealth(): Response {
  return { ok: true, status: 200 } as Response;
}

function downHealth(): Response {
  return { ok: false, status: 503 } as Response;
}

describe('ad-server-launch probeAdServerHealth', () => {
  it('returns true as soon as /health answers ok', async () => {
    const fetchImpl = vi.fn(async () => okHealth());
    const healthy = await probeAdServerHealth('http://127.0.0.1:61234', {
      timeoutMs: 5000,
      intervalMs: 10,
      fetchImpl,
    });
    expect(healthy).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:61234/health');
  });

  it('keeps retrying while /health is down, then returns true once it comes up', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(okHealth());
    const healthy = await probeAdServerHealth('http://127.0.0.1:61234', {
      timeoutMs: 5000,
      intervalMs: 10,
      fetchImpl,
    });
    expect(healthy).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns false when /health never becomes ready before the timeout (crash / build failure)', async () => {
    const fetchImpl = vi.fn(async () => downHealth());
    const healthy = await probeAdServerHealth('http://127.0.0.1:61234', {
      timeoutMs: 60,
      intervalMs: 10,
      fetchImpl,
    });
    expect(healthy).toBe(false);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
  });

  it('returns false when fetch rejects (server not listening) until the timeout', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const healthy = await probeAdServerHealth('http://127.0.0.1:61234', {
      timeoutMs: 60,
      intervalMs: 10,
      fetchImpl,
    });
    expect(healthy).toBe(false);
  });
});

describe('ad-server-launch decideServerBaseUrl', () => {
  it('injects http://127.0.0.1:<port> when the port was discovered and /health is ready', () => {
    expect(decideServerBaseUrl(61234, true)).toBe('http://127.0.0.1:61234');
  });

  it('falls back to the preview/mock bridge when no port was reported', () => {
    expect(decideServerBaseUrl(null, true)).toBeNull();
    expect(decideServerBaseUrl(undefined, true)).toBeNull();
  });

  it('falls back to the preview/mock bridge when /health never became ready', () => {
    expect(decideServerBaseUrl(61234, false)).toBeNull();
  });

  it('rejects a bogus / non-positive port (ephemeral 0 must never leak in)', () => {
    expect(decideServerBaseUrl(0, true)).toBeNull();
    expect(decideServerBaseUrl(-1, true)).toBeNull();
  });
});

describe('ad-server-launch fallback wiring (probe → inject or mock)', () => {
  it('healthy ad-server produces a baseUrl for VITE_ADL_SERVER_URL', async () => {
    const fetchImpl = vi.fn(async () => okHealth());
    const port = 61234;
    const healthy = await probeAdServerHealth(`http://127.0.0.1:${port}`, {
      timeoutMs: 5000,
      intervalMs: 10,
      fetchImpl,
    });
    expect(decideServerBaseUrl(port, healthy)).toBe(`http://127.0.0.1:${port}`);
  });

  it('unhealthy ad-server produces null → the preview/mock fallback keeps the demo working', async () => {
    const fetchImpl = vi.fn(async () => downHealth());
    const port = 61234;
    const healthy = await probeAdServerHealth(`http://127.0.0.1:${port}`, {
      timeoutMs: 60,
      intervalMs: 10,
      fetchImpl,
    });
    expect(decideServerBaseUrl(port, healthy)).toBeNull();
  });
});
