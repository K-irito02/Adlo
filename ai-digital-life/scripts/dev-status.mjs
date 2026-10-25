/**
 * 列出本机正在运行的各工作树 dev 前端实例（端口 / 实例令牌 / PID）。
 *
 * 用途：排查「这个窗口连的是哪个工作树的前端」。实例令牌与 `[adl-run]` 启动行里的
 * `token=` 前缀一致；`/__adl_dev_instance__` 是启动器自证用的探针。
 *
 * 用法：`pnpm run dev:status`
 */
import net from "node:net";
import { spawnSync } from "node:child_process";
import { DEV_PORT_BASE } from "./dev-port.mjs";

const HOST = "127.0.0.1";
const PORTS = Array.from({ length: 10 }, (_, index) => DEV_PORT_BASE + index);
const TOKEN_PATH = "/__adl_dev_instance__";

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

const rows = [];
for (const port of PORTS) {
  if (!(await isOpen(port))) {
    continue;
  }
  const token = await readToken(port);
  rows.push({
    port,
    token: token ? `${token.slice(0, 8)}…` : "(no token)",
    pid: pidFor(port),
  });
}

if (rows.length === 0) {
  console.log(`[dev:status] no dev frontend listening on ${HOST}:${PORTS[0]}..${PORTS.at(-1)}`);
} else {
  console.log("[dev:status] host=%s", HOST);
  for (const row of rows) {
    console.log(`  port=${row.port} token=${row.token} pid=${row.pid}`);
  }
  console.log("[dev:status] 对应启动行：[adl-run] … token=<同上 8 位>");
}
