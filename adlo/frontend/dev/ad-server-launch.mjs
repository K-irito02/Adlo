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
// 注（Closing L5）：此处是 launcher 级兜底；`app` 域（设置/配置）已改为失败即
// 失败、不再静默回退 mock（见手册 §7），两者并存，不要混淆。
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
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { debugLogModeForVite, parseLogFlags } from './logFlags.mjs';
import {
  INSTANCE_STATE_DIRNAME,
  isInstanceLocatorPath,
  resolveInstance,
} from '../../scripts/instance-id.mjs';
import { resolveDevPort, stripServerArgs } from '../../scripts/dev-port.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const viteBin = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js');

/** 后端引擎的 Cargo 包名与产物名（与 `crates/server/Cargo.toml` 的 `name` 同源；
 *  单测会读该 Cargo.toml 校验，防止再次出现 `ad-server` 这类过时名字）。 */
export const AD_SERVER_PACKAGE = 'adl-server';
export const AD_SERVER_BIN_NAME = process.platform === 'win32' ? 'adl-server.exe' : 'adl-server';

const AD_SERVER_BIN = path.join(repoRoot, 'target', 'debug', AD_SERVER_BIN_NAME);

// Fixed port override for E2E / manual runs; default 0 = ephemeral (no conflicts).
const requestedPort = Number.parseInt(process.env.ADL_AD_SERVER_PORT ?? '0', 10);

/**
 * Pure: dev ad-server data dir. A worktree instance gets its own directory under
 * `<repo>/.adl-instance/…` so parallel slots never share one SQLite file and `cargo clean`
 * cannot wipe it; the main worktree keeps the historical tmp dir. `ADL_AD_SERVER_DATA_DIR`
 * still wins.
 */
export function resolveDevDataDir(repoRoot, env = process.env) {
  if (env.ADL_AD_SERVER_DATA_DIR) {
    return env.ADL_AD_SERVER_DATA_DIR;
  }
  const instance = resolveInstance({ repoRoot, env });
  return instance.stateDir
    ? path.join(instance.stateDir, 'ad-server-data')
    : path.join(os.tmpdir(), 'adl-ad-server-dev');
}

const dataDir = resolveDevDataDir(repoRoot);
const healthTimeoutMs = Number.parseInt(process.env.ADL_AD_SERVER_HEALTH_TIMEOUT_MS ?? '60000', 10);
// `cargo run` 首次会先编译 adl-server（本工作树实测约 2m28s）；180s 会在冷构建时误判失败。
// 默认 300s，可用 ADL_AD_SERVER_PORT_TIMEOUT_MS 覆盖（CI/慢盘）。
const portLineTimeoutMs = Number.parseInt(
  process.env.ADL_AD_SERVER_PORT_TIMEOUT_MS ?? '300000',
  10,
);

/** 本实例的运行态标记文件：供 dev:status 判断「这个端口有没有注入后端、是不是孤儿」。 */
function instanceStateDir(instance) {
  return instance.stateDir ?? path.join(repoRoot, INSTANCE_STATE_DIRNAME);
}

function writeInstanceMarker(instance, data) {
  const dir = instanceStateDir(instance);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'dev-instance.json'),
      `${JSON.stringify(data, null, 2)}\n`,
      'utf8',
    );
  } catch (error) {
    warn(`failed to write dev-instance.json: ${error.message}`);
  }
}

function clearInstanceMarker(instance) {
  try {
    rmSync(path.join(instanceStateDir(instance), 'dev-instance.json'), { force: true });
  } catch {
    // 标记文件只是诊断线索，清理失败不影响退出。
  }
}

let currentInstance = null;

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
  if (currentInstance) {
    clearInstanceMarker(currentInstance);
  }
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

/**
 * 纯函数：组装 Vite 子进程 env（Closing L6，可单测）。
 * 日志 flag 已被 parseLogFlags 消费进 `logFlagsEnv`，其余参数原样转发给 vite；
 * `VITE_ADL_SERVER_URL` 缺席即 preview/mock 回退；调试模式经 `VITE_` 前缀注入。
 */
export function buildViteEnv(baseEnv, logFlagsEnv, adServerBaseUrl) {
  const env = { ...baseEnv, ...logFlagsEnv };
  if (adServerBaseUrl) {
    env.VITE_ADL_SERVER_URL = adServerBaseUrl;
  }
  const debugModeForVite = debugLogModeForVite(logFlagsEnv);
  if (debugModeForVite) {
    // 浏览器前端只暴露 VITE_ 前缀（调试日志模式经此到达 debugLogCollector）。
    env.VITE_ADL_DEBUG_LOG_MODE = debugModeForVite;
  }
  return env;
}

/** 纯函数：组装 ad-server 子进程 env（env 是唯一传递通道，Closing L6，可单测）。 */
export function buildAdServerEnv(baseEnv, logFlagsEnv) {
  return { ...baseEnv, ...logFlagsEnv };
}

function startVite(adServerBaseUrl, logFlags, frontendPort, runHost) {
  // 日志 flag 已被 parseLogFlags 消费；`--port` / `--host` 由启动器统一接管
  // （摘掉用户传入的同名 flag，避免 vite CLI 收到重复值而崩）。
  const viteArgs = [
    ...stripServerArgs(logFlags.restArgs),
    '--host',
    runHost,
    '--port',
    String(frontendPort),
  ];
  const env = {
    ...buildViteEnv(process.env, logFlags.env, adServerBaseUrl),
    // vite 配置也读 ADL_HOST/ADL_PORT（`vite.config.ts`），必须与本次选定值一致；
    // 前端只能读 VITE_ 前缀，内置浏览器的本地预览链接靠 VITE_PORT 指回本工作树。
    ADL_HOST: runHost,
    ADL_PORT: String(frontendPort),
    PORT: String(frontendPort),
    VITE_PORT: String(frontendPort),
  };
  log(
    `starting Vite dev server (VITE_ADL_SERVER_URL=${
      adServerBaseUrl ?? '(unset → preview/mock fallback)'
    })`,
  );
  if (!adServerBaseUrl) {
    warn(
      'preview/mock fallback active: app-domain HTTP calls will fail (启动器没有可用的 ad-server)。' +
        ' 跨端口排查见 `pnpm run dev:status` 的 server=/health= 列。',
    );
  }
  viteChild = spawn(process.execPath, [viteBin, ...viteArgs], {
    cwd: frontendRoot,
    stdio: 'inherit',
    env,
    windowsHide: false,
  });
  if (currentInstance) {
    writeInstanceMarker(currentInstance, {
      schema: 1,
      worktree: repoRoot,
      port: frontendPort,
      serverUrl: adServerBaseUrl,
      launcherPid: process.pid,
      startedAt: new Date().toISOString(),
    });
  }
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

function spawnAdServer(logFlags) {
  const args = ['--port', String(requestedPort), '--data-dir', dataDir];
  const env = buildAdServerEnv(process.env, logFlags.env);
  let child;
  if (existsSync(AD_SERVER_BIN)) {
    log(`launching prebuilt ${AD_SERVER_BIN} --port ${requestedPort}`);
    child = spawn(AD_SERVER_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    });
  } else {
    log(
      `prebuilt ${AD_SERVER_BIN_NAME} not found; falling back to \`cargo run -p ${AD_SERVER_PACKAGE}\` (first run builds)`,
    );
    child = spawn(
      process.platform === 'win32' ? 'cargo.exe' : 'cargo',
      ['run', '-p', AD_SERVER_PACKAGE, '--', ...args],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env },
    );
  }
  // 局部变量持有子进程：cleanup() 会把模块级 adServer 置空，监听器若再引用全局变量
  // 就会在「超时回退 → cleanup → 子进程随后 exit」时命中 null（2026-10-31 实测 TypeError）。
  adServer = child;
  // Node ChildProcess 没有 `kind` 属性（恒走 fallback）：只记 pid（Phase 4 D1）。
  serverLog(`spawned ad-server (pid ${child.pid})`);
  child.exited = false;
  child.on('exit', (code, signal) => {
    child.exited = true;
    serverLog(`ad-server exited (code ${code}, signal ${signal})`);
  });
  child.on('error', (err) => {
    serverLog(`ad-server spawn error: ${err.message}`);
  });
  return child;
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
  // 单次解析 argv 后分发（历史上 startVite/spawnAdServer 各解析一次，无值 flag 的 warn 会重复；
  // Phase 4 F4）。端口/宿主解析与 `dev:tauri` 共用 `resolveDevPort`（校验/占用/稳定端口顺延）。
  const logFlags = parseLogFlags(process.argv.slice(2));
  const instance = resolveInstance({ repoRoot });
  currentInstance = instance;
  const { bindHost, port: frontendPort } = await resolveDevPort({
    args: logFlags.restArgs,
    suffix: instance.suffix,
  });

  // 父会话（App 内嵌终端 / 另一个 dev 会话）会继承父实例的 ADL_*：端口、令牌、locator
  // 都可能属于**别的实例**。清掉继承项，本次运行只用自己的解析结果，再由子进程环境显式注入。
  for (const key of ['ADL_PORT', 'PORT', 'ADL_DEV_TOKEN', 'ADL_HOST']) {
    delete process.env[key];
  }
  if (instance.locatorPath) {
    process.env.ADL_STORAGE_LOCATOR_PATH = instance.locatorPath;
  } else if (isInstanceLocatorPath(process.env.ADL_STORAGE_LOCATOR_PATH)) {
    // 只丢「从别的 dev 实例继承来的」自动 locator；用户/测试显式设置的自定义路径保留。
    delete process.env.ADL_STORAGE_LOCATOR_PATH;
  }
  adServer = spawnAdServer(logFlags);
  const port = await readBoundPort(adServer);
  if (port === null) {
    warn(
      `ad-server did not report AD_SERVER_PORT (exit/error within ${portLineTimeoutMs}ms). ` +
        `Falling back to the preview/mock implementations — run \`cargo build -p ${AD_SERVER_PACKAGE}\` for the real engine.`,
    );
    cleanup();
    startVite(null, logFlags, frontendPort, bindHost);
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
    startVite(null, logFlags, frontendPort, bindHost);
    return;
  }

  log(`ad-server healthy at ${baseUrl}`);
  startVite(baseUrl, logFlags, frontendPort, bindHost);
}

const isMainModule =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href.toLowerCase() === import.meta.url.toLowerCase();

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
