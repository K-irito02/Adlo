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
 * 其它命名（如按分支名生成的一次性工作树）没有稳定序号 → 返回 undefined，
 * 由调用方从 `DEV_PORT_BASE` 起找空闲端口。首选只是"优先尝试"，被占时顺延。
 */
export function preferredDevPort(suffix) {
  if (!suffix) {
    return DEV_PORT_BASE;
  }
  const match = /-(\d+)$/.exec(suffix);
  if (!match) {
    return undefined;
  }
  const index = Number.parseInt(match[1], 10);
  if (!Number.isInteger(index) || index < 1 || index > 200) {
    return undefined;
  }
  return DEV_PORT_BASE + index;
}

/** 端口是否已有服务在监听（true = 被占用）。 */
export async function isPortOpen(hostname, port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/** 从 `startPort` 起找第一个空闲端口（最多尝试 20 个），全占则交给系统分配临时端口。 */
export async function findOpenPort(hostname, startPort = DEV_PORT_BASE) {
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
