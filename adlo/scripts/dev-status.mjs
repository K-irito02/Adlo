/**
 * 列出本机正在运行的各工作树 dev 前端实例（端口 / 实例令牌 / PID / 后端地址 / 后端健康）。
 *
 * 用途：排查「这个窗口连的是哪个工作树的前端、有没有真的连上 ad-server、是不是孤儿进程」。
 * - 实例令牌与 `[adl-run]` 启动行里的 `token=` 前缀一致；`/__adl_dev_instance__` 是启动器自证探针。
 * - 启动器会把本次运行写进 `<worktree>/adlo/target/adl-instance/dev-instance.json`
 *   （port / serverUrl / launcherPid），dev:status 据此区分「本工作树启动器管理的实例」与孤儿。
 *
 * 用法：`pnpm run dev:status`
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DEV_PORT_BASE } from "./dev-port.mjs";
import { resolveInstance } from "./instance-id.mjs";

const HOST = "127.0.0.1";
const PORTS = Array.from({ length: 10 }, (_, index) => DEV_PORT_BASE + index);
const TOKEN_PATH = "/__adl_dev_instance__";

function markerPathFor(repoRoot) {
  const instance = resolveInstance({ repoRoot });
  const dir = instance.stateDir ?? path.join(repoRoot, "target", "adl-instance");
  return path.join(dir, "dev-instance.json");
}

function readMarker(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function isOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port });
    socket.setTimeout(300);
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function readToken(port) {
  try {
    const response = await fetch(`http://${HOST}:${port}${TOKEN_PATH}`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.text()).trim();
  } catch {
    return null;
  }
}

async function probeHealth(serverUrl) {
  try {
    const response = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(800) });
    return response.ok ? "ok" : `http-${response.status}`;
  } catch {
    return "fail";
  }
}

function pidFor(port) {
  if (process.platform !== "win32") {
    return "—";
  }
  const result = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
  const line = (result.stdout ?? "")
    .split(/\r?\n/)
    .find((row) => row.includes(`:${port}`) && row.includes("LISTENING"));
  const columns = line?.trim().split(/\s+/);
  return columns?.at(-1) ?? "—";
}

const markerFile = markerPathFor(process.cwd());
const marker = readMarker(markerFile);
const worktreeRoot = fs.existsSync(path.join(process.cwd(), "adlo", "package.json"))
  ? process.cwd()
  : path.dirname(process.cwd());

const rows = [];
for (const port of PORTS) {
  if (!(await isOpen(port))) {
    continue;
  }
  const token = await readToken(port);
  const owns = marker !== null && Number(marker.port) === port;
  const serverUrl = owns ? (marker.serverUrl ?? null) : null;
  rows.push({
    port,
    token: token ? `${token.slice(0, 8)}…` : "(no token)",
    pid: pidFor(port),
    server: owns ? (serverUrl ?? "(mock fallback)") : "(unknown)",
    health: serverUrl ? await probeHealth(serverUrl) : "n/a",
    managed: owns,
  });
}

if (rows.length === 0) {
  console.log(`[dev:status] no dev frontend listening on ${HOST}:${PORTS[0]}..${PORTS.at(-1)}`);
  if (marker) {
    console.warn(
      `[dev:status] 警告：存在上一位启动器留下的标记（port=${marker.port}），但该端口已无监听——进程可能被外部杀掉，标记可删：${markerFile}`,
    );
  }
} else {
  console.log("[dev:status] host=%s", HOST);
  for (const row of rows) {
    console.log(
      `  port=${row.port} token=${row.token} pid=${row.pid} server=${row.server} health=${row.health}`,
    );
  }
  console.log("[dev:status] 对应启动行：[adl-run] … token=<同上 8 位>");
  console.log(
    `[dev:status] logs(本工作树): ${path.join(worktreeRoot, ".adl-logs")} (壳/浏览器) | ${path.join(worktreeRoot, "adlo", ".adl-logs")} (adl-server)`,
  );
  for (const row of rows) {
    if (!row.managed) {
      console.warn(
        `[dev:status] 警告：端口 ${row.port} 不是本工作树启动器登记的实例（可能是孤儿或别的工作树），` +
          "前端可能没有注入 VITE_ADL_SERVER_URL；重启前先结束该进程（按 pid 精确定位，勿按进程名误杀）。",
      );
    } else if (row.server === "(mock fallback)") {
      console.warn(
        `[dev:status] 警告：端口 ${row.port} 运行在 preview/mock 回退（无 ad-server），app 域调用会失败。`,
      );
    }
  }
}
