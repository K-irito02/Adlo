/**
 * 需认证本地应用端口分流（通用层，非 dsh 专属）。
 *
 * 背景：dsh 0.2.x 起裸 `http://127.0.0.1:3080/` 会 401，必须用进程 stdout
 * 打印的真实入口 URL（含 `?token=`）打开；后端 `webapp-host` 已通用化
 * URL 捕获（`extract_launch_url` + marker 常量），前端此处负责“分流”：
 * 命中集合的 loopback 端口一律走其 opener（如 dsh 的 `openDsh`），
 * 而非直接打开裸地址。
 *
 * 扩展点：未来其它智能体站点/本地端口若同样要求认证 URL，
 * 1) 在 `AUTH_REQUIRED_LOCAL_PORTS` 追加端口；
 * 2) 在调用方按端口选择对应 opener（当前仅 dsh，故统一走 `openDsh`，
 *    有第二个 opener 时改为按端口查表分发）。
 */

/** 需经 opener 拿认证 URL 的本地端口集合（当前仅 dsh 3080）。 */
export const AUTH_REQUIRED_LOCAL_PORTS: ReadonlySet<number> = new Set([3080]);

/** 是否为 loopback 主机名（localhost / 127/8 / IPv6 loopback）。 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  // IPv6 loopback 在 URL.hostname 中不带括号
  if (host === 'localhost' || host === '::1') {
    return true;
  }
  const parts = host.split('.');
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
}

/**
 * 若 URL 是“需认证的本地端口”，返回其端口号；否则返回 null。
 * 非法 URL / 非 loopback / 端口不在集合中一律返回 null（调用方走原逻辑）。
 */
export function getAuthRequiredPort(url: string): number | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (!isLoopbackHostname(parsed.hostname)) {
    return null;
  }
  const port = Number(parsed.port);
  if (!Number.isSafeInteger(port)) {
    return null;
  }
  return AUTH_REQUIRED_LOCAL_PORTS.has(port) ? port : null;
}
