/**
 * 重启恢复的本地（loopback）标签在服务端就绪前**不应导航**：否则首帧会命中
 * `ERR_CONNECTION_REFUSED`（例如 dsh 进程由应用启动期后台拉起，需要数秒才监听 3080），
 * 且失败窗口会把站点元数据判成"已结算但无图标"，导致标签显示兜底首字母。
 *
 * 本模块在创建 WebView 前轮询 loopback URL，直到服务可达或超时。仅对**重启水合**
 * 的标签调用；用户当次新开/显式导航的标签直接加载，避免无谓延迟。
 */

/** 最长等待时间：覆盖 dsh 启动期（实测 ~6–8s），超时后照常加载（会显示错误页）。 */
const LOOPBACK_READY_MAX_MS = 15_000;
/** 两次探测之间的间隔。 */
const LOOPBACK_POLL_MS = 300;
/** 单次探测超时（避免目标端口挂起时阻塞过久）。 */
const PROBE_TIMEOUT_MS = 1_500;

/** 是否为 loopback(http/https) URL（127.0.0.1 / localhost / ::1）。 */
export function isLoopbackHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return false;
    }
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/** 单次可达性探测：no-cors GET 成功解析即视为服务可达（连接被拒会 reject）。 */
async function probeReachable(url: string, signal?: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      return false;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * 等待 loopback URL 可达；超时或被 `signal` 取消后返回。
 * @returns `true` 探测到可达；`false` 超时或已取消。
 */
export async function waitForLoopbackReachable(
  url: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const deadline = Date.now() + LOOPBACK_READY_MAX_MS;
  for (;;) {
    if (signal?.aborted) {
      return false;
    }
    if (await probeReachable(url, signal)) {
      return true;
    }
    if (signal?.aborted) {
      return false;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, LOOPBACK_POLL_MS));
  }
}
