import { pageMetaClient } from '@utils/pageMetaClient';
import { getFaviconUrl } from '@utils/favicon';

/**
 * 站点 favicon 自愈：收藏 / 新建快捷站点 / 打开标签页后补全缺失的 favicon。
 *
 * 为什么需要两条入口：
 * - `scheduleFaviconFetch`（延迟静默 get）：收藏创建后补 data-URI 快照，不阻塞 UI；
 * - `ensureSiteFavicon`（节流 + 并发上限的强制刷新）：页面一个图标都拿不到时
 *   （标题-only 缓存、外部图标防盗链/加载失败）的兜底自愈路径——等价于用户
 *   手动「刷新网站图标与标题」。每次自动触发只排一次刷新，并在会话内按窗口节流
 *   （常规 10 分钟 / force 60 秒）。
 *
 * 会话级节流（模块状态）：同一 URL 在窗口内不重复触发，避免对永久无 favicon 的
 * 站点反复创建 WebView2/发起网络请求。面板与中心两个宿主共用本模块，节流状态因此
 * 跨宿主共享（同一 URL 不必各自重试一遍）。
 */

const FAVICON_SELF_HEAL_THROTTLE_MS = 10 * 60 * 1000;
const faviconSelfHealAttempts = new Map<string, number>();

/** 延迟后台抓取页面元数据（favicon），用于书签创建后补全缺失的 favicon。 */
export function scheduleFaviconFetch(url: string): void {
  if (!url) {
    return;
  }
  setTimeout(() => {
    pageMetaClient.getSilent(url).catch(() => {});
  }, 2000);
}

/** 是否应发起该 URL 的 favicon 自愈：窗口内已尝试过则跳过，否则记录本次尝试。 */
export function shouldAttemptFaviconSelfHeal(url: string): boolean {
  const now = Date.now();
  const last = faviconSelfHealAttempts.get(url) ?? 0;
  if (now - last < FAVICON_SELF_HEAL_THROTTLE_MS) {
    return false;
  }
  faviconSelfHealAttempts.set(url, now);
  return true;
}

/**
 * 补抓并发上限：每条强制刷新都可能创建一次静默 WebView2 / 一次 HTTP 抓取，
 * 启动恢复多标签时不能同时打满。超出的 URL 排队，前一个完成后依次执行。
 */
const MAX_CONCURRENT_ENSURE = 2;
let activeEnsures = 0;
const ensureQueue: string[] = [];
const enqueued = new Set<string>();

/**
 * `force` 的独立冷却：外部图标「存在但加载失败」时需要在 10 分钟常规节流窗口内
 * 也补抓一次，但失败后不能每帧重试，故用更短的独立窗口（60s）。
 */
const FORCE_ENSURE_THROTTLE_MS = 60 * 1000;
const forcedEnsureAttempts = new Map<string, number>();

function shouldAttemptForcedEnsure(url: string): boolean {
  const now = Date.now();
  const last = forcedEnsureAttempts.get(url) ?? 0;
  if (now - last < FORCE_ENSURE_THROTTLE_MS) {
    return false;
  }
  forcedEnsureAttempts.set(url, now);
  return true;
}

function drainEnsureQueue(): void {
  while (activeEnsures < MAX_CONCURRENT_ENSURE && ensureQueue.length > 0) {
    const next = ensureQueue.shift()!;
    enqueued.delete(next);
    activeEnsures += 1;
    void pageMetaClient
      .refresh(next)
      .catch(() => {})
      .finally(() => {
        activeEnsures = Math.max(0, activeEnsures - 1);
        drainEnsureQueue();
      });
  }
}

/**
 * 确保该页面能拿到网站图标：已有可显示图标（data-URI / 外部 URL / 重定向目标）时
 * 直接跳过；否则按会话节流排队执行一次强制刷新（`pageMetaClient.refresh`，即
 * 「刷新网站图标与标题」走的那条链路：静默渲染 + 图标字节下载 + 广播自愈）。
 *
 * @param opts.force 外部图标已存在但加载失败（防盗链/瞬态）时仍然重抓，取回 data-URI。
 *   走独立的 60s 冷却（不受常规 10 分钟节流影响），否则「先常规补抓、图标随后加载失败」
 *   这一序列在常规节流窗口内不会触发重抓。
 */
export function ensureSiteFavicon(url: string, opts?: { force?: boolean }): void {
  if (!url || !/^https?:\/\//i.test(url)) {
    return;
  }
  if (!opts?.force && getFaviconUrl(url)) {
    return;
  }
  if (enqueued.has(url)) {
    return;
  }
  const allowed = opts?.force ? shouldAttemptForcedEnsure(url) : shouldAttemptFaviconSelfHeal(url);
  if (!allowed) {
    return;
  }
  enqueued.add(url);
  ensureQueue.push(url);
  drainEnsureQueue();
}

/** 仅测试用：清空会话级自愈节流状态与补抓队列。 */
export function resetFaviconSelfHealThrottleForTest(): void {
  faviconSelfHealAttempts.clear();
  forcedEnsureAttempts.clear();
  ensureQueue.length = 0;
  enqueued.clear();
  activeEnsures = 0;
}
