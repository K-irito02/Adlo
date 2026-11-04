/**
 * 需认证本地应用端口分流（通用层，非 dsh 专属）。
 *
 * 背景：dsh 0.2.x 起裸 `http://127.0.0.1:3080/` 会 401，必须用进程 stdout
 * 打印的真实入口 URL（含 `?token=`）打开；后端 `webapp-host` 已通用化
 * URL 捕获（`extract_launch_url` + marker 常量），前端此处负责“识别 + 分发”：
 * 命中分发表的 loopback 端口走其 opener（如 dsh 的 `openDsh`），
 * 而非直接打开裸地址。
 *
 * 端口查表是启发式分流，不是身份认证：端口是可碰撞资源（其它服务占用、
 * 用户改端口、多站点同端口都可能误伤），精确识别靠后端 401 指纹
 *（`is_auth_required_body`）与 stdout marker，见 `webapp-host`。
 *
 * 扩展步骤（缺一不可，否则新站点会被误路由到错误的 opener）：
 * 1) 后端：加 marker 常量（`webapp-host`）+ 401 指纹（`is_auth_required_body` 匹配表）；
 * 2) 前端：在 `OPENER_BY_PORT` 追加 `端口 → opener` 映射（`AUTH_REQUIRED_LOCAL_PORTS`
 *    由该表键集合派生，保持单源）；
 * 3) 调用方：按 `routeLocalUrl` 返回的 opener 分发，未映射的端口走原逻辑
 *    （裸开，由 dsh 自身的 401 页指引用户）。
 */

/** 已知需认证 URL 的 opener 名（随支持站点扩展）。 */
export type LocalAuthOpener = 'dsh';

/** 本地端口 → opener 分发表（单源；`AUTH_REQUIRED_LOCAL_PORTS` 由此派生）。 */
export const OPENER_BY_PORT: ReadonlyMap<number, LocalAuthOpener> = new Map([[3080, 'dsh']]);

/** 需经 opener 拿认证 URL 的本地端口集合（由分发表派生）。 */
export const AUTH_REQUIRED_LOCAL_PORTS: ReadonlySet<number> = new Set(OPENER_BY_PORT.keys());

/** 是否为 loopback 主机名（localhost / 127/8 / IPv6 loopback，方括号内外均可）。 */
export function isLoopbackHostname(hostname: string): boolean {
  // `new URL(...).hostname` 对 IPv6 保留方括号（`[::1]`），裸 `::1` 只来自手写；
  // 此处两种形态都接受，归一化后比较。
  const host = hostname.toLowerCase().replace(/^\[(.*)]$/, '$1');
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
 * 非法 URL / 非 http(s) / 非 loopback / 无端口（默认端口被归一化省略时 `port` 为空串）
 * / 端口不在集合中一律返回 null（调用方走原逻辑）。
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
  if (!parsed.port) {
    return null;
  }
  const port = Number(parsed.port);
  if (!Number.isSafeInteger(port)) {
    return null;
  }
  return AUTH_REQUIRED_LOCAL_PORTS.has(port) ? port : null;
}

/**
 * 路由一个本地 URL：命中分发表返回对应 opener，未命中返回 null（调用方裸开）。
 * 把“识别”与“分发”绑在同一处，避免调用方只判端口不分发 opener 的误路由。
 */
export function routeLocalUrl(url: string): { opener: LocalAuthOpener } | null {
  const port = getAuthRequiredPort(url);
  if (port === null) {
    return null;
  }
  const opener = OPENER_BY_PORT.get(port);
  return opener === undefined ? null : { opener };
}
