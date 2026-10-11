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
import { AD_SERVER_BIN_NAME, AD_SERVER_PACKAGE } from '../../dev/ad-server-launch.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 从测试文件自身位置向上找 Cargo.toml（优先），cwd 启动目录兜底。
 * 原先只认 `process.cwd()`（vitest 启动目录一换即 brittle），现双锚点。
 */
function findServerCargoToml(): string {
  const candidates: string[] = [];
  try {
    const selfUrl = import.meta.url;
    if (selfUrl.startsWith('file://')) {
      // 本文件在 <root>/frontend/src/preview-bridge/ 下，上 3 级即 ai-digital-life/。
      const testDir = path.dirname(fileURLToPath(selfUrl));
      candidates.push(path.resolve(testDir, '..', '..', '..', 'crates', 'server', 'Cargo.toml'));
    }
  } catch {
    // jsdom 等环境下 import.meta.url 不是 file:// URL，走 cwd 兜底。
  }
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    candidates.push(path.resolve(dir, 'crates', 'server', 'Cargo.toml'));
    dir = path.resolve(dir, '..');
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`crates/server/Cargo.toml not found (tried ${candidates.join(', ')})`);
}

/**
 * 命名契约回归：启动脚本曾使用过时的 `ad-server`（实际 crate/产物为 `adl-` 前缀），
 * 导致「找不到预编译产物 → cargo run -p ad-server 报 package not found → 拿不到端口 →
 * 不注入 VITE_ADL_SERVER_URL → 前端落兜底 127.0.0.1:61234 不可达 → 白屏」。此测试直接
 * 读 Cargo.toml 钉住名字，防止再次漂移。
 */
describe('ad-server naming contract', () => {
  it('uses a package name that exists in crates/server/Cargo.toml', () => {
    const cargo = readFileSync(findServerCargoToml(), 'utf8');
    expect(cargo).toMatch(new RegExp(`^name\\s*=\\s*"${AD_SERVER_PACKAGE}"`, 'm'));
    expect(AD_SERVER_PACKAGE).toBe('adl-server');
  });

  it('looks for the platform-correct binary artifact name', () => {
    expect(AD_SERVER_BIN_NAME).toBe(process.platform === 'win32' ? 'adl-server.exe' : 'adl-server');
  });

  it('derives the binary name from the package name (no [[bin]] override)', () => {
    // 包—产物单点约束（Phase 4 F1）：默认产物名即包名；若将来加 [[bin]] 改名，
    // 本断言失败即提醒同步 AD_SERVER_BIN_NAME，而不是默默漂移。
    const cargo = readFileSync(findServerCargoToml(), 'utf8');
    expect(cargo).not.toMatch(/\[\[bin\]\]/);
    const withoutExe = AD_SERVER_BIN_NAME.replace(/\.exe$/, '');
    expect(withoutExe).toBe(AD_SERVER_PACKAGE);
  });
});

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
