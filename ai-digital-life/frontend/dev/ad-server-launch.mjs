// ad-server-launch.mjs — Task 9 dev orchestrator.
//
// Spawns the real ad-server (Task 3), health-probes it, then launches the Vite
// dev server as a CHILD with `VITE_ADL_SERVER_URL` set to the discovered
// baseUrl. The env var is read by Vite at config-load time and becomes
// `import.meta.env.VITE_ADL_SERVER_URL`, which `resolveAdlServerBaseUrl()`
// (frontend/src/httpBridge.ts) feeds into the preview-bridge's httpBridge.
//
// Why the launch script spawns Vite itself instead of the brief's
// `node dev/ad-server-launch.mjs && vite`: the ad-server binds an EPHEMERAL
// port (printed as `AD_SERVER_PORT=`), so the URL is only known at runtime —
// `&& vite` starts a separate process with no way to receive that value. By
// spawning Vite as a child with the env var set in its process environment,
// the injection is guaranteed before Vite's config is evaluated.
//
// Fallback: if the ad-server cannot launch (binary missing and `cargo run`
// fails, port conflict, crash, or the `/health` probe times out), we log a
// clear warning and STILL start Vite WITHOUT `VITE_ADL_SERVER_URL`. The
// preview-bridge then falls back to its preview/mock implementations (the
// current no-server behavior), so the browser demo keeps working.
//
// Lifecycle: when Vite exits (or on SIGINT/SIGTERM), the ad-server child (and
// its tree — `cargo run` spawns it as a grandchild) is killed.
//
// Debug logs: every orchestration step logs with an `[adl-dev]` prefix and
// every ad-server lifecycle event with `[ad-server]`, so a `pnpm dev:preview`
// session can be verified by eye (spawn → bound port → /health probe → Vite
// with the injected VITE_ADL_SERVER_URL → kill on exit). These are dev-script
// instrumentation, not production code.
//
// Testability: the pure helpers `probeAdServerHealth` and `decideServerBaseUrl`
// are exported (see `src/preview-bridge/ad-server-launch-core.test.ts`) and the
// orchestrator only runs when this file is the main module.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const viteBin = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js');

const AD_SERVER_BIN = path.join(
  repoRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'ad-server.exe' : 'ad-server',
);

// Fixed port override for E2E / manual runs; default 0 = ephemeral (no conflicts).
const requestedPort = Number.parseInt(process.env.ADL_AD_SERVER_PORT ?? '0', 10);
const dataDir =
  process.env.ADL_AD_SERVER_DATA_DIR ?? path.join(os.tmpdir(), 'adl-ad-server-dev');
const healthTimeoutMs = Number.parseInt(process.env.ADL_AD_SERVER_HEALTH_TIMEOUT_MS ?? '60000', 10);
const portLineTimeoutMs = 180_000; // `cargo run` may need to build the binary first

const log = (...args) => console.log('[adl-dev]', ...args);
const serverLog = (...args) => console.log('[ad-server]', ...args);
const warn = (...args) => console.warn('[adl-dev]', ...args);

let adServer = null; // direct child (ad-server.exe or cargo)
let viteChild = null;

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    // taskkill /T /F kills the process tree (cargo -> ad-server grandchild).
    const res = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    serverLog(`killed ad-server tree (pid ${pid}, taskkill status ${res.status})`);
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
      serverLog(`killed ad-server group (pid ${pid})`);
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
        serverLog(`killed ad-server (pid ${pid})`);
      } catch {
        serverLog(`ad-server (pid ${pid}) already gone`);
      }
    }
  }
}

function cleanup() {
  if (adServer) {
    // Skip the tree-kill when the child already exited (its process is gone —
    // taskkill would just error 128). The kill exists to reap the ad-server
    // grandchild of a `cargo run` parent or a still-running prebuilt binary.
    if (!adServer.exited) {
      killTree(adServer.pid);
    } else {
      serverLog(`ad-server (pid ${adServer.pid}) already exited; nothing to kill`);
    }
    adServer = null;
  }
}

function startVite(adServerBaseUrl) {
  // Extra args pass through to vite, e.g. `node dev/ad-server-launch.mjs --port 5174`.
  const viteArgs = process.argv.slice(2);
  const env = { ...process.env };
  if (adServerBaseUrl) {
    env.VITE_ADL_SERVER_URL = adServerBaseUrl;
  }
  log(
    `starting Vite dev server (VITE_ADL_SERVER_URL=${
      adServerBaseUrl ?? '(unset → preview/mock fallback)'
    })`,
  );
  viteChild = spawn(process.execPath, [viteBin, ...viteArgs], {
    cwd: frontendRoot,
    stdio: 'inherit',
    env,
    windowsHide: false,
  });
  viteChild.on('error', (err) => {
    warn(`failed to start Vite: ${err.message}`);
    cleanup();
    process.exit(1);
  });
  viteChild.on('exit', (code, signal) => {
    cleanup();
    if (signal) {
      log(`Vite exited via signal ${signal}`);
      process.exit(0);
    }
    process.exit(code ?? 0);
  });
}

function spawnAdServer() {
  const args = ['--port', String(requestedPort), '--data-dir', dataDir];
  if (existsSync(AD_SERVER_BIN)) {
    log(`launching prebuilt ad-server: ${AD_SERVER_BIN} --port ${requestedPort}`);
    adServer = spawn(AD_SERVER_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    log('prebuilt ad-server not found; falling back to `cargo run -p ad-server` (first run builds)');
    adServer = spawn(
      process.platform === 'win32' ? 'cargo.exe' : 'cargo',
      ['run', '-p', 'ad-server', '--', ...args],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
  }
  serverLog(`spawned ad-server (pid ${adServer.pid}, kind ${adServer.kind ?? 'subprocess'})`);
  adServer.exited = false;
  adServer.on('exit', (code, signal) => {
    adServer.exited = true;
    serverLog(`ad-server exited (code ${code}, signal ${signal})`);
  });
  adServer.on('error', (err) => {
    serverLog(`ad-server spawn error: ${err.message}`);
  });
  return adServer;
}

/** Resolve the bound port from `AD_SERVER_PORT=` stdout, else null on timeout. */
function readBoundPort(child) {
  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, portLineTimeoutMs);
    const onData = (chunk) => {
      buffer += String(chunk);
      const match = buffer.match(/AD_SERVER_PORT=(\d+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        serverLog(`ad-server bound ephemeral port ${Number(match[1])} (AD_SERVER_PORT)`);
        resolve(Number(match[1]));
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (chunk) => {
      // cargo build logs land on stderr; forward for visibility without eating the port line.
      process.stderr.write(chunk);
    });
    child.once('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
    child.once('exit', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

/** Health-probe the ad-server `/health` endpoint until it answers ok or the
 *  timeout elapses. Pure (fetch injectable) so unit tests can drive the
 *  success/timeout/fallback decisions without a real process. */
export async function probeAdServerHealth(
  baseUrl,
  { timeoutMs = healthTimeoutMs, intervalMs = 250, fetchImpl = fetch } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetchImpl(`${baseUrl}/health`);
      if (resp.ok) {
        return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** Decide the baseUrl to inject into Vite: only a discovered bound port plus a
 *  healthy probe qualify. `null` means "fall back to the preview/mock bridge". */
export function decideServerBaseUrl(port, healthy) {
  if (port === null || port === undefined || !Number.isInteger(port) || port <= 0 || !healthy) {
    return null;
  }
  return `http://127.0.0.1:${port}`;
}

async function main() {
  adServer = spawnAdServer();
  const port = await readBoundPort(adServer);
  if (port === null) {
    warn(
      `ad-server did not report AD_SERVER_PORT (exit/error within ${portLineTimeoutMs}ms). ` +
        'Falling back to the preview/mock implementations — run `cargo build -p ad-server` for the real engine.',
    );
    cleanup();
    startVite(null);
    return;
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  log(`probing /health at ${baseUrl} (timeout ${healthTimeoutMs}ms)...`);
  const healthy = await probeAdServerHealth(baseUrl);
  if (!healthy) {
    warn(
      `ad-server bound ${baseUrl} but /health never became ready within ${healthTimeoutMs}ms. ` +
        'Falling back to the preview/mock implementations.',
    );
    cleanup();
    startVite(null);
    return;
  }

  log(`ad-server healthy at ${baseUrl}`);
  startVite(baseUrl);
}

const isMainModule =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href.toLowerCase() ===
    import.meta.url.toLowerCase();

if (isMainModule) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      log(`received ${signal}; killing ad-server and exiting`);
      cleanup();
      if (viteChild && !viteChild.killed) {
        viteChild.kill(signal);
      }
      process.exit(0);
    });
  }
  process.on('beforeExit', cleanup);

  main().catch((err) => {
    warn(`fatal: ${err instanceof Error ? err.message : String(err)}`);
    cleanup();
    process.exit(1);
  });
}
