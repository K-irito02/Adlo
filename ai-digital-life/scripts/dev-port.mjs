import net from "node:net";

/**
 * dev 前端端口的统一分配规则（`run-project-surface.mjs` 与 `frontend/dev/ad-server-launch.mjs` 共用）。
 *
 * 背景（2026-10-25 实测事故）：端口若被**另一个工作树**的 dev server 占用，而本工作树的 vite
 * 静默顺延到下一个端口，Tauri 的 `devUrl` 仍指向原端口 → 窗口渲染别人的前端，
 * 表现为"改了代码却毫无变化"。因此：
 * - 每个工作树有稳定首选端口（主工作树 5173，`slot-N` → 5173+N），被占则顺延到空闲端口；
 * - vite 侧 `strictPort: true`（端口被占就失败，绝不静默顺延）；
 * - 桌面入口另有实例令牌校验（见 `run-project-surface.mjs`）。
 */

/** dev 端口基准：主工作树 5173，`slot-N` 顺延到 5173+N。 */
export const DEV_PORT_BASE = 5173;

/**
 * 本工作树的首选 dev 端口：主工作树 5173，`<pool>/slot-N` → 5173+N。
 *
 * 只认 `slot-N` 这一种目录命名（与并行手册一致）：任意 `-数字` 后缀（如 `session-2`、
 * `pr-42`）会与槽位端口撞车，故回退到自动挑空闲端口。
 */
export function preferredDevPort(suffix) {
  if (!suffix) {
    return DEV_PORT_BASE;
  }
  const match = /^slot-(\d+)$/.exec(suffix);
  if (!match) {
    return undefined;
  }
  const index = Number.parseInt(match[1], 10);
  if (!Number.isInteger(index) || index < 1 || index > 200) {
    return undefined;
  }
  return DEV_PORT_BASE + index;
}

/** 参数里是否出现了 `--host`（含 `=值` 形式）。用于区分"未指定"与"写了非法/缺值"。 */
export function hasHostFlag(args) {
  return args.some((arg) => arg === "--host" || arg.startsWith("--host="));
}

/** 参数里是否出现了 `--port`（含 `=值` 形式）。用于区分"未指定"与"写了非法值"。 */
export function hasPortFlag(args) {
  return args.some((arg) => arg === "--port" || arg.startsWith("--port="));
}

/** `flag` 之后是否跟着一个可用的值（不是另一个 flag）。 */
function nextValue(args, index) {
  const next = args[index + 1];
  return typeof next === "string" && next.length > 0 && !next.startsWith("-") ? next : undefined;
}

/** 从转发给 vite 的参数里取出显式 `--port N` / `--port=N`（返回 undefined 表示未指定或非法）。 */
export function portFromArgs(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const raw = arg === "--port" ? nextValue(args, i) : arg.startsWith("--port=") ? arg.slice(7) : null;
    if (raw === null || raw === undefined) {
      continue;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) {
      return parsed;
    }
  }
  return undefined;
}

/** 从转发参数里取出显式 `--host X` / `--host=X`（跳过"后面紧跟另一个 flag"的缺值情形）。 */
export function hostFromArgs(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--host") {
      const value = nextValue(args, i);
      if (value !== undefined) {
        return value;
      }
    }
    if (arg.startsWith("--host=") && arg.length > 7) {
      return arg.slice(7);
    }
  }
  return undefined;
}

/**
 * 摘掉 `--port` / `--host`（含 `=值` 形式及其值）：启动器自己会注入这两个 flag，
 * 重复出现会让 vite 的 CLI 把它们解析成数组并直接失败。
 * 缺值形式（`--port --host`）只摘 flag 本身，避免把下一个 flag 当成值吞掉。
 */
export function stripServerArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--port" || arg === "--host") {
      if (nextValue(args, i) !== undefined) {
        i += 1;
      }
      continue;
    }
    if (arg.startsWith("--port=") || arg.startsWith("--host=")) {
      continue;
    }
    out.push(arg);
  }
  return out;
}

/** 环境变量端口：空 → undefined；非法 → 抛错（与 `--port` 的"必须显式合法"一致）。 */
export function parsePortEnv(value) {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}

/**
 * 探测/绑定用的可达地址：通配地址（`0.0.0.0` / `::`）不能作为 devUrl / fetch 目标，
 * 统一回落到回环地址；空值回落到默认。
 */
export function reachableHost(bindHost) {
  const host = typeof bindHost === "string" && bindHost.length > 0 ? bindHost : "127.0.0.1";
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}
export async function isPortOpen(hostname, port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port });
    // 单次探测超时：不可达主机的 TCP 连接可能挂很久，20 次探测会把启动卡死。
    socket.setTimeout(500);
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/** 从 `startPort` 起找第一个空闲端口（最多尝试 20 个），全占则交给系统分配临时端口。 */
export async function findOpenPort(hostname, startPort) {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = startPort + offset;
    if (await isPortOpen(hostname, candidate)) {
      continue;
    }
    return candidate;
  }

  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve an ephemeral port."));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

/**
 * dev 会话的端口/宿主解析（两个启动器共用，避免各自复制一套校验）。
 *
 * 语义：
 * - `--port` / `--host` 写了但值非法/缺值 → 抛错（不静默回落）；
 * - 显式端口（`--port` 或 `ADL_PORT`/`PORT`）必须空闲，占用即抛错（绝不静默顺延，
 *   否则 Tauri 的 devUrl 会指向另一个工作树的 dev server）；
 * - 未显式指定 → 本工作树的稳定端口优先，被占顺延到下一个空闲端口；
 * - `bindHost` 用于 vite `--host` 与子进程 env；`host` 是可达地址（通配/空回落到回环），
 *   用于探测、`devUrl`、令牌抓取。
 */
export async function resolveDevPort({ args, suffix, env = process.env, fallbackHost = "127.0.0.1" }) {
  if (hasPortFlag(args) && portFromArgs(args) === undefined) {
    throw new Error("Invalid --port: expected a number in 1..65535.");
  }
  const argHost = hostFromArgs(args);
  if (hasHostFlag(args) && argHost === undefined) {
    throw new Error("Invalid --host: expected a value.");
  }
  const bindHost = argHost || env.ADL_HOST || fallbackHost;
  const host = reachableHost(bindHost);
  const envPort = parsePortEnv(env.ADL_PORT ?? env.PORT);
  const requestedPort = portFromArgs(args) ?? envPort;
  if (requestedPort !== undefined && (await isPortOpen(host, requestedPort))) {
    throw new Error(
      `Port ${requestedPort} on ${host} is already in use (another worktree's dev server?). ` +
        "Stop that instance or omit ADL_PORT to let the launcher pick a free one.",
    );
  }
  const port =
    requestedPort ?? (await findOpenPort(host, preferredDevPort(suffix) ?? DEV_PORT_BASE));
  return { bindHost, host, port };
}
