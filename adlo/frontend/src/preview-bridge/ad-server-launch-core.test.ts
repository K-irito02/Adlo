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
import {
  AD_SERVER_BIN_NAME,
  AD_SERVER_PACKAGE,
  buildAdServerEnv,
  buildViteEnv,
  resolveDevDataDir,
} from '../../dev/ad-server-launch.mjs';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
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
      // 本文件在 <root>/frontend/src/preview-bridge/ 下，上 3 级即 adlo/。
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
    expect(packageNameOf(cargo)).toBe(AD_SERVER_PACKAGE);
    expect(AD_SERVER_PACKAGE).toBe('adl-server');
  });

  it('looks for the platform-correct binary artifact name', () => {
    expect(AD_SERVER_BIN_NAME).toBe(process.platform === 'win32' ? 'adl-server.exe' : 'adl-server');
  });

  it('derives the binary name from the package name (no [[bin]] override)', () => {
    // 包—产物单点约束（Phase 4 F1）：默认产物名即包名；若将来加 [[bin]] 改名，
    // 本断言失败即提醒同步 AD_SERVER_BIN_NAME，而不是默默漂移。
    const cargo = readFileSync(findServerCargoToml(), 'utf8');
    expect(binNamesOf(cargo)).toEqual([]);
    const withoutExe = AD_SERVER_BIN_NAME.replace(/\.exe$/, '');
    expect(withoutExe).toBe(AD_SERVER_PACKAGE);
    // 合法添加场景的约束自解释（Closing N3）：若将来加了 [[bin]]，
    // 其 name 必须等于产物名，而不是"不应有 bin"。
    for (const name of binNamesOf(cargo)) {
      expect(name).toBe(AD_SERVER_PACKAGE);
    }
  });

  it('honours an explicit [[bin]] name if one is ever added', () => {
    // 约束的另一半：合法添加 [[bin]] 时，其 name 必须等于产物名（去 .exe 后缀）。
    expect(binNamesOf('[[bin]]\nname = "adl-server"\npath = "src/bin/adl-server.rs"')).toEqual([
      'adl-server',
    ]);
  });
});

/**
 * 轻量 TOML 小节解析（Closing M3）：`^name = …` 正则会误命中
 * `[dependencies.adl-server]` 或注释，`[[bin]]` 否定断言则分不清合法添加与漂移。
 * 只取 `[package]` 小节内的 name。
 */
function sectionOf(cargo: string, header: string): string {
  // Closing N4：节头允许 `[ package ]` 间距与行尾注释。
  const headerPattern = header === '[package]' ? /^\[\s*package\s*\]/ : /^\[\[\s*bin\s*\]\]/;
  const lines = cargo.split('\n');
  let capture = false;
  const out: string[] = [];
  for (const line of lines) {
    const withoutComment = line.split('#')[0];
    const trimmed = withoutComment.trim();
    if (trimmed.startsWith('[')) {
      capture = headerPattern.test(trimmed);
      continue;
    }
    if (capture && trimmed !== '') {
      out.push(line);
    }
  }
  return out.join('\n');
}

function packageNameOf(cargo: string): string | null {
  const match = sectionOf(cargo, '[package]').match(/^name\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

function binNamesOf(cargo: string): string[] {
  const names: string[] = [];
  const lines = cargo.split('\n');
  let inBin = false;
  for (const line of lines) {
    const withoutComment = line.split('#')[0];
    const trimmed = withoutComment.trim();
    if (trimmed.startsWith('[')) {
      inBin = /^\[\[\s*bin\s*\]\]/.test(trimmed);
      continue;
    }
    if (inBin && trimmed !== '') {
      const match = trimmed.match(/^name\s*=\s*"([^"]+)"/);
      if (match) {
        names.push(match[1]);
      }
    }
  }
  return names;
}

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

describe('ad-server-launch env builders (Closing L6)', () => {
  it('buildViteEnv merges base + log flags and maps debug mode to VITE_ key', () => {
    const env = buildViteEnv(
      { PATH: '/bin', VITE_ADL_SERVER_URL: 'stale' },
      { ADL_LOG_LEVEL: 'trace', ADL_DEBUG_LOG_MODE: 'append' },
      'http://127.0.0.1:61234',
    );
    expect(env.VITE_ADL_SERVER_URL).toBe('http://127.0.0.1:61234');
    expect(env.ADL_LOG_LEVEL).toBe('trace');
    expect(env.VITE_ADL_DEBUG_LOG_MODE).toBe('append');
    expect(env.PATH).toBe('/bin');
  });

  it('buildViteEnv omits VITE_ keys when no server and no debug override', () => {
    const env = buildViteEnv({ PATH: '/bin' }, {}, null);
    expect(env.VITE_ADL_SERVER_URL).toBeUndefined();
    expect(env.VITE_ADL_DEBUG_LOG_MODE).toBeUndefined();
  });

  it('buildAdServerEnv merges base + log flags without VITE_ mapping', () => {
    const env = buildAdServerEnv({ PATH: '/bin' }, { ADL_LOG_LEVEL: 'debug' });
    expect(env.ADL_LOG_LEVEL).toBe('debug');
    expect(env.PATH).toBe('/bin');
    expect(env.VITE_ADL_SERVER_URL).toBeUndefined();
  });
});

describe('resolveDevDataDir (per-worktree isolation)', () => {
  const slotRepoRoot = path.resolve('/wt/SourceWorkspace-worktrees/slot-1/adlo');
  const mainRepoRoot = path.resolve('/wt/SourceWorkspace/adlo');

  it('uses the worktree instance dir for a slot worktree', () => {
    expect(resolveDevDataDir(slotRepoRoot, {})).toBe(
      path.join(slotRepoRoot, '.adl-instance', 'ad-server-data'),
    );
  });

  it('keeps the shared temp dir for the main worktree', () => {
    expect(resolveDevDataDir(mainRepoRoot, {})).toBe(path.join(os.tmpdir(), 'adl-ad-server-dev'));
  });

  it('honours an explicit ADL_AD_SERVER_DATA_DIR override', () => {
    expect(resolveDevDataDir(slotRepoRoot, { ADL_AD_SERVER_DATA_DIR: '/custom/dir' })).toBe(
      '/custom/dir',
    );
  });
});
