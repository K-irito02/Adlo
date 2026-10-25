import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { debugLogModeForVite, parseLogFlags } from "../frontend/dev/logFlags.mjs";
import { resolveDevPort, stripServerArgs } from "./dev-port.mjs";
import { isInstanceLocatorPath, resolveInstance } from "./instance-id.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

/** vite 在开发期回显实例令牌的路径（见 `frontend/vite.config.ts` 的中间件）。 */
const DEV_TOKEN_PATH = "/__adl_dev_instance__";

function normalizePath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  (process.platform === "win32"
    ? normalizePath(process.argv[1]).toLowerCase() === normalizePath(__filename).toLowerCase()
    : normalizePath(process.argv[1]) === normalizePath(__filename));

const modeArg = (process.argv[2] ?? "tauri").toLowerCase();
const modeAliases = {
  app: "tauri",
  browser: "browser",
  both: "both",
  external: "tauri",
  tauri: "tauri",
};
const mode = modeAliases[modeArg];

if (!mode && isMain) {
  console.error(`Unsupported mode "${modeArg}". Use browser, tauri, both, app, or external.`);
  process.exit(1);
}

const cargoCommand = process.platform === "win32" ? "cargo.exe" : "cargo";
const viteEntry = path.join(repoRoot, "frontend", "node_modules", "vite", "bin", "vite.js");
const appImageName = process.platform === "win32" ? "ai-digital-life.exe" : "ai-digital-life";
// Probe/kill target assumes cargo's default target dir; the workspace has no target-dir
// override (verified in .cargo/config.toml). A future override must update this path too.
// repoRoot is realpath-normalized so the probe/kill path matches PowerShell's canonical
// $_.Path even when the repo is reached through a junction/8.3 short-name segment.
const appDevExePath = path.join(normalizePath(repoRoot), "target", "debug", appImageName);
// Per-worktree app identity: isolated app_data_dir + WebView2 user-data folder in
// worktrees, plain identifier (and real locator) in the main worktree.
const instance = resolveInstance({ repoRoot });
const children = [];

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    void shutdown(1);
  });
}

async function main() {
  // 先解析 CLI：`--port` / `--host` 是显式覆盖，必须从转发参数里摘掉，
  // 否则与启动器注入的同名 flag 重复（vite 的 CLI 解析会把重复 --port 变成数组并直接崩）。
  const logFlags = parseLogFlags(process.argv.slice(3));
  const restArgs = stripServerArgs(logFlags.restArgs);
  // 端口/宿主解析（校验 + 占用检查 + 稳定端口顺延）与 dev:preview 共用同一实现。
  const {
    bindHost,
    host: runHost,
    port,
  } = await resolveDevPort({ args: logFlags.restArgs, suffix: instance.suffix });
  const devUrl = `http://${runHost}:${port}`;
  // 实例令牌：启动脚本据此确认"devUrl 上跑的确实是自己 spawn 的 vite"，
  // 而不是同端口上另一个工作树的 dev server。
  const devToken = randomUUID();

  // 父会话（App 内嵌终端 / 另一个 dev 会话派生的 shell）会继承父实例的 ADL_* 变量：
  // 端口、令牌、locator 都可能是**别人**的（端口/宿主已在上面取过，显式 pin 仍生效）。
  // 本次运行只信自己解析出来的值，先清掉继承项再由 childEnv 显式注入。
  for (const key of ["ADL_DEV_TOKEN", "ADL_PORT", "PORT", "ADL_HOST"]) {
    delete process.env[key];
  }
  if (instance.locatorPath) {
    process.env.ADL_STORAGE_LOCATOR_PATH = instance.locatorPath;
  } else if (isInstanceLocatorPath(process.env.ADL_STORAGE_LOCATOR_PATH)) {
    // 只丢「从别的 dev 实例继承来的」自动 locator；用户/测试显式设置的自定义路径保留。
    delete process.env.ADL_STORAGE_LOCATOR_PATH;
  }

  console.log(`[adl-run] mode=${mode} url=${devUrl} token=${devToken.slice(0, 8)}`);
  console.log(
    `[adl-run] instance=${instance.identifier}` +
      (instance.locatorPath ? ` locator=${instance.locatorPath}` : " (shared data root)"),
  );

  // 开发阶段日志 CLI 覆盖：透传参数 → env（子进程继承）——唯一的传递通道，
  // 刻意不拼 Tauri 应用 argv（`cargo tauri dev` 会把 `--` 之后的参数当作 cargo
  // 自身参数并报 `unexpected argument`）。
  // 用法：`pnpm dev:tauri -- --log-level trace --terminal-log-mode multi`
  const childEnv = {
    ADL_HOST: bindHost,
    ADL_PORT: String(port),
    PORT: String(port),
    // 前端只能读 VITE_ 前缀：内置浏览器的「本地预览」快捷链接靠它指向本工作树的端口。
    VITE_PORT: String(port),
    ADL_DEV_TOKEN: devToken,
    ...(instance.locatorPath ? { ADL_STORAGE_LOCATOR_PATH: instance.locatorPath } : {}),
    ...logFlags.env,
  };
  const debugModeForVite = debugLogModeForVite(logFlags.env);
  if (debugModeForVite) {
    // 浏览器前端只暴露 VITE_ 前缀。
    childEnv.VITE_ADL_DEBUG_LOG_MODE = debugModeForVite;
  }
  if (Object.keys(logFlags.env).length > 0) {
    // "已转发"而非"已生效"（Closing L1）：取值合法性由 Rust 侧统一校验，
    // 非法值随后会被 `[ADL-CLI] ignoring invalid …` 忽略，此处不断言生效。
    console.log(
      `[adl-run] log overrides forwarded: ${JSON.stringify(logFlags.env)} (session-only)`,
    );
  }

  const vite = spawnChecked(
    process.execPath,
    [viteEntry, "--host", bindHost, "--port", String(port), ...restArgs],
    childEnv,
    path.join(repoRoot, "frontend"),
  );
  children.push(vite);

  await waitForOwnDevServer(devUrl, devToken, vite, 30_000);
  console.log(`[adl-run] frontend ready at ${devUrl}`);

  if (mode === "browser") {
    console.log("[adl-run] browser mode keeps only the Vite dev server running.");
    console.log(`[adl-run] open ${devUrl}`);
    await holdUntilStopped();
    return;
  }

  // Windows: a leftover dev instance locks target/debug/ai-digital-life.exe, which
  // blocks cargo from relinking changed code (tauri dev runs `cargo run` internally).
  // Kill it only when the dev exe is actually locked, right before the dev build, and
  // only processes running that exact exe path (a separate release/installed build is
  // left untouched). Unix linkers replace the binary via rename, so no lock exists there.
  if (process.platform === "win32" && isExeLocked(appDevExePath)) {
    console.warn(
      `[adl-run] existing dev instance detected -- force-terminating it to release the build lock`,
    );
    await killProcessesByName(appImageName, appDevExePath);
    if (!(await waitForUnlock(appDevExePath))) {
      console.warn(
        `[adl-run] ${appDevExePath} is still locked after terminating instances -- the dev build ` +
          "may fail to relink. Stop any running ai-digital-life instance manually if the build fails.",
      );
    }
  }

  const tauriConfig = JSON.stringify({
    build: {
      devUrl,
    },
    ...(instance.suffix ? { identifier: instance.identifier } : {}),
  });

  // 桌面应用进程刻意**不带** ADL_PORT/PORT/ADL_DEV_TOKEN：前两者是 vite 的配置
  // （带上会被 App 内嵌终端继承，在其中启动另一个工作树时会被误判成"显式指定端口"）；
  // 令牌只有 vite 需要。VITE_* 仅在 Vite 配置加载时注入 `import.meta.env`，与应用进程无关。
  // locator 仍保留（应用靠它定位本实例的数据根）。
  const appEnv = { ...childEnv };
  delete appEnv.ADL_PORT;
  delete appEnv.PORT;
  delete appEnv.ADL_DEV_TOKEN;

  const tauri = spawnChecked(cargoCommand, ["tauri", "dev", "--config", tauriConfig], appEnv);
  children.push(tauri);

  if (mode === "both") {
    console.log(`[adl-run] browser preview remains available at ${devUrl}`);
  }

  await holdUntilStopped();
}

function spawnChecked(command, args, envOverrides, cwd = repoRoot) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  child.once("error", (error) => {
    console.error(`[adl-run] failed to start ${command}: ${error.message}`);
    void shutdown(1);
  });

  child.once("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    if (signal) {
      console.error(`[adl-run] ${command} exited via signal ${signal}`);
      void shutdown(1);
      return;
    }

    if ((code ?? 0) !== 0) {
      console.error(`[adl-run] ${command} exited with code ${code}`);
      void shutdown(code ?? 1);
      return;
    }

    if (command === cargoCommand) {
      void shutdown(0);
    }
  });

  return child;
}

/**
 * 等 `devUrl` 上出现**我们自己**的 dev server（回显本次实例令牌）。
 *
 * 为什么需要令牌（2026-10-25 实测事故）：端口若被另一个工作树的 dev server 占用，
 * 单纯 HTTP 探活会被它立刻满足，Tauri 便去渲染别人的前端；vite 那边虽然
 * 因 `strictPort` 失败退出，但此时窗口已经打开。令牌把"端口有人应答"升级为
 * "应答者是本工作树的 vite"。
 */
export async function waitForOwnDevServer(
  devUrl,
  token,
  vite,
  timeoutMs,
  { fetchImpl = fetch, now = Date.now, sleep = defaultSleep } = {},
) {
  const startedAt = now();
  while (now() - startedAt < timeoutMs) {
    // 信号终止时 `exitCode` 仍为 null（`signalCode` 才有值），两者都要判。
    if (vite.exitCode !== null || vite.signalCode != null) {
      throw new Error(
        `Frontend dev server exited (code ${vite.exitCode ?? "null"}` +
          `${vite.signalCode ? `, signal ${vite.signalCode}` : ""}) before becoming ready at ${devUrl}. ` +
          `Another process may own this port; stop it or let the launcher pick a free one.`,
      );
    }
    let servedToken = null;
    try {
      // 单次请求超时：端口上的进程「接受连接但不回包」时不能让启动器无限挂住。
      const response = await fetchImpl(`${devUrl}${DEV_TOKEN_PATH}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        servedToken = (await response.text()).trim();
      }
    } catch {
      // 尚未就绪（连接被拒 / 单次超时）：继续轮询。
    }
    if (servedToken !== null) {
      if (servedToken === token) {
        return;
      }
      throw new Error(
        `Port ${new URL(devUrl).port} answered but belongs to a different dev server ` +
          `(instance token mismatch). Stop that instance or let the launcher pick a free one.`,
      );
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${devUrl}`);
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let isShuttingDown = false;

async function shutdown(exitCode) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  const activeChildren = children.filter((child) => child && !child.killed);
  await Promise.all(activeChildren.map((child) => terminateChild(child.pid)));
  process.exit(exitCode);
}

async function terminateChild(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.once("exit", () => resolve(undefined));
      killer.once("error", () => resolve(undefined));
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Ignore already-exited processes.
  }
}

function isExeLocked(file) {
  try {
    const fd = fs.openSync(file, "r+");
    fs.closeSync(fd);
    return false;
  } catch (error) {
    // EACCES/EPERM may also be a read-only attribute or an ACL denial, not necessarily a
    // live process holding the image open; the only cost then is a possibly-unnecessary kill.
    // Unusual codes (not EBUSY/EPERM/EACCES/ENOENT) fail OPEN by design: warn and report
    // unlocked, rather than stalling startup on a theoretical sharing-violation alias.
    if (["EBUSY", "EPERM", "EACCES"].includes(error.code)) {
      return true;
    }
    if (error.code !== "ENOENT") {
      console.warn(`[adl-run] unable to probe ${file}: ${error.code ?? error.message}`);
    }
    return false;
  }
}

// Wait (up to timeoutMs) for a file to become writable again after a process kill. taskkill's
// "exit" event does not strictly guarantee the OS has released the image handle yet; a short
// re-probe loop absorbs that lag and also confirms a failed kill (elevated instance, etc.).
async function waitForUnlock(file, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isExeLocked(file)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !isExeLocked(file);
}

export async function killProcessesByName(imageName, exePath) {
  if (process.platform === "win32") {
    // Kill only processes whose executable path equals the dev exe, so a concurrently running
    // release/installed build (same image name, different path) is left untouched.
    // Get-Process -Name rejects the ".exe" suffix (stripped here) and accepts wildcards;
    // imageName is a hardcoded constant in the dev flow, so the pattern surface is inert.
    if (!exePath) {
      throw new Error("killProcessesByName: exePath is required on win32");
    }
    const baseName = imageName.replace(/\.exe$/i, "").replace(/'/g, "''");
    const escaped = exePath.replace(/'/g, "''");
    const script =
      `Get-Process -Name '${baseName}' -ErrorAction SilentlyContinue | ` +
      `Where-Object { $_.Path -eq '${escaped}' } | Stop-Process -Force -ErrorAction SilentlyContinue`;
    await withTimeout(
      `cleanup for ${imageName}`,
      (settle, isTimedOut) => {
        const killer = spawn(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", script],
          { stdio: "ignore" },
        );
        let reported = false;
        killer.once("error", (error) => {
          reported = true;
          if (!isTimedOut()) {
            console.warn(`[adl-run] failed to run cleanup for ${imageName}: ${error.message}`);
          }
          settle();
        });
        killer.once("exit", (code) => {
          if (code !== 0 && !reported && !isTimedOut()) {
            console.warn(`[adl-run] cleanup for ${imageName} exited with code ${code}`);
          }
          settle();
        });
        return killer;
      },
      10_000,
    );
    return;
  }

  // Unix: name-based only (pkill matches any process with that image name, regardless of
  // path) -- deliberately diverges from the win32 path-precise contract above. The dev
  // flow only ever reaches the win32 branch, so this path serves the exported helper's
  // cross-platform contract and test/reuse scenarios.
  await withTimeout(
    `pkill ${imageName}`,
    (settle, isTimedOut) => {
      const killer = spawn("pkill", ["-x", imageName], { stdio: "ignore" });
      let reported = false;
      killer.once("error", (error) => {
        reported = true;
        if (!isTimedOut()) {
          console.warn(`[adl-run] failed to run pkill for ${imageName}: ${error.message}`);
        }
        settle();
      });
      killer.once("exit", (code) => {
        if (code !== 0 && code !== 1 && !reported && !isTimedOut()) {
          console.warn(`[adl-run] pkill ${imageName} exited with code ${code}`);
        }
        settle();
      });
      return killer;
    },
    10_000,
  );
}

// Race a spawned-cleanup child against a timeout so a hung process cannot block the
// startup path forever. `run` receives a settle callback and an isTimedOut predicate, and
// must return the spawned child; on timeout the child is killed, a warning is logged, and
// the promise resolves (fail-soft -- waitForUnlock provides the authoritative post-kill
// confirmation). A synchronous throw from `run` also degrades fail-soft.
function withTimeout(label, run, ms) {
  return new Promise((resolve) => {
    let child;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.warn(`[adl-run] timed out waiting for ${label}; continuing`);
      child?.kill();
      resolve(undefined);
    }, ms);
    const settle = () => {
      clearTimeout(timer);
      resolve(undefined);
    };
    try {
      child = run(settle, () => timedOut);
    } catch (error) {
      clearTimeout(timer);
      console.warn(`[adl-run] failed to start ${label}: ${error.message}`);
      resolve(undefined);
    }
  });
}

if (isMain) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      void shutdown(0);
    });
  }
}

// Keep the process alive indefinitely until a signal (SIGINT/SIGTERM) triggers shutdown.
// The unresolved promise blocks the event loop from exiting, while the signal handlers
// registered above call shutdown() to terminate children and exit.
async function holdUntilStopped() {
  await new Promise(() => {});
}
