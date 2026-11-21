import type { SearchEngine } from '@stores/slices/browserSearchEnginesSlice';

/** 单个引擎探测的超时：足够覆盖跨境慢链路，又不至于让「自动选择」等太久。 */
const PROBE_TIMEOUT_MS = 2500;

/**
 * 自动选择的优先级（按域名，不依赖显示名）：代理开启时优先境外引擎；代理关闭时
 * 通常落到仍可直连的 www.bing.com，必应中国 / 百度作为其后备。
 */
const AUTO_SELECT_HOST_ORDER = [
  'www.google.com',
  'www.bing.com',
  'duckduckgo.com',
  'cn.bing.com',
  'www.baidu.com',
  'www.sogou.com',
  'www.so.com',
];

function originOf(engine: SearchEngine): string | null {
  try {
    return new URL(engine.urlTemplate.replace('%s', 'test')).origin;
  } catch {
    return null;
  }
}

function hostOf(engine: SearchEngine): string | null {
  try {
    return new URL(engine.urlTemplate.replace('%s', 'test')).hostname;
  } catch {
    return null;
  }
}

/** 按自动选择优先级排序；未登记的引擎保持在后（顺序稳定）。 */
export function orderEnginesForAutoSelect(engines: SearchEngine[]): SearchEngine[] {
  const rank = (engine: SearchEngine): number => {
    const index = AUTO_SELECT_HOST_ORDER.indexOf(hostOf(engine) ?? '');
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...engines].sort((a, b) => rank(a) - rank(b));
}

/**
 * 探测单个引擎入口是否可达。
 *
 * 用 `no-cors` 请求引擎站点自己的 favicon：不读取响应体（跨域语义安全），
 * 请求成功/失败即等价于「网络能否到达该域名」。桌面 WebView2 与浏览器预览
 * 都走各自网络栈，因此系统代理开关天然生效，无需新增 IPC。
 */
export async function probeSearchEngine(
  engine: SearchEngine,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const origin = originOf(engine);
  if (!origin) {
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${origin}/favicon.ico`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 并发探测引擎，并在探测成功的结果中按优先级挑选一个；没有成功结果时返回 null。 */
export async function pickReachableSearchEngine(
  engines: SearchEngine[],
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<SearchEngine | null> {
  const ordered = orderEnginesForAutoSelect(engines);
  if (ordered.length === 0) {
    return null;
  }
  const results = await Promise.allSettled(
    ordered.map((engine) => probeSearchEngine(engine, timeoutMs)),
  );
  for (let i = 0; i < ordered.length; i += 1) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      return ordered[i];
    }
  }
  return null;
}
