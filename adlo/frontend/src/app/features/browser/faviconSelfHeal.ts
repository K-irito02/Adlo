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
      .refresh(next, { iconOnly: true })
      .catch(() => {})
      .finally(() => {
        activeEnsures = Math.max(0, activeEnsures - 1);
        drainEnsureQueue();
      });
  }
}

/** 被动列表（书签/历史）的 HTTP-only 补齐并发上限：不创建隐藏 WebView。 */
const MAX_CONCURRENT_HTTP = 4;
/** 每分钟被动补齐预算：耗尽后条目留在队列等下一个窗口，而不是静默丢弃。 */
const HTTP_BACKFILL_BUDGET = 40;
const HTTP_BACKFILL_WINDOW_MS = 60_000;
/** 同域最小间隔：与预览端 crawlerPolicy 的 5s 限速对齐。 */
const HTTP_DOMAIN_INTERVAL_MS = 5_000;
let activeHttp = 0;
let httpBudgetUsed = 0;
let httpBudgetWindowStart = Date.now();
const httpQueue: string[] = [];
const enqueuedHttp = new Set<string>();
const httpSelfHealAttempts = new Map<string, number>();
const httpDomainLastAt = new Map<string, number>();
let httpDrainTimer: ReturnType<typeof setTimeout> | null = null;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function refreshHttpBudget(now: number): void {
  if (now - httpBudgetWindowStart >= HTTP_BACKFILL_WINDOW_MS) {
    httpBudgetWindowStart = now;
    httpBudgetUsed = 0;
  }
}

function scheduleHttpDrain(delayMs: number): void {
  if (httpDrainTimer !== null) {
    return;
  }
  httpDrainTimer = setTimeout(
    () => {
      httpDrainTimer = null;
      drainHttpQueue();
    },
    Math.max(0, delayMs),
  );
}

function shouldAttemptHttpFaviconSelfHeal(url: string): boolean {
  const now = Date.now();
  const last = httpSelfHealAttempts.get(url) ?? 0;
  if (now - last < FAVICON_SELF_HEAL_THROTTLE_MS) {
    return false;
  }
  httpSelfHealAttempts.set(url, now);
  return true;
}

function drainHttpQueue(): void {
  while (activeHttp < MAX_CONCURRENT_HTTP && httpQueue.length > 0) {
    const now = Date.now();
    refreshHttpBudget(now);
    if (httpBudgetUsed >= HTTP_BACKFILL_BUDGET) {
      // 预算耗尽：等窗口滚动再继续，不丢队列里的行。
      scheduleHttpDrain(httpBudgetWindowStart + HTTP_BACKFILL_WINDOW_MS - now + 10);
      return;
    }
    // 同域限速在出队时判定：被限的 URL 留在队列里，到点自动补发。
    let picked = -1;
    let waitForDomain = Number.POSITIVE_INFINITY;
    for (let i = 0; i < httpQueue.length; i += 1) {
      const wait =
        HTTP_DOMAIN_INTERVAL_MS - (now - (httpDomainLastAt.get(hostOf(httpQueue[i]!)) ?? 0));
      if (wait <= 0) {
        picked = i;
        break;
      }
      waitForDomain = Math.min(waitForDomain, wait);
    }
    if (picked === -1) {
      scheduleHttpDrain(waitForDomain + 10);
      return;
    }
    const next = httpQueue.splice(picked, 1)[0]!;
    enqueuedHttp.delete(next);
    httpBudgetUsed += 1;
    httpDomainLastAt.set(hostOf(next), now);
    activeHttp += 1;
    void pageMetaClient
      .fetchHttp(next)
      .catch(() => {})
      .finally(() => {
        activeHttp = Math.max(0, activeHttp - 1);
        drainHttpQueue();
      });
  }
}

/**
 * 被动列表（书签树 / 历史）的懒补齐：只发 HTTP 请求，绝不创建隐藏 WebView。
 * 独立节流（10 分钟/URL）+ 同域 5s 限速 + 每分钟 40 次预算；被限速/预算拦下的
 * URL 留在队列中等待补发（同域内保序，跨域可能重排）。
 *
 * @param opts.force 已有外部图标但加载失败（防盗链/瞬态）时仍允许重试。
 */
export function ensureSiteFaviconHttp(url: string, opts?: { force?: boolean }): void {
  if (!url || !/^https?:\/\//i.test(url)) {
    return;
  }
  if (!opts?.force && getFaviconUrl(url)) {
    return;
  }
  if (opts?.force) {
    // 强制重试绕过 10 分钟 URL 节流，但仍受同域 5s 与总预算约束。
    httpSelfHealAttempts.delete(url);
  }
  if (enqueuedHttp.has(url)) {
    return;
  }
  if (!shouldAttemptHttpFaviconSelfHeal(url)) {
    return;
  }
  enqueuedHttp.add(url);
  httpQueue.push(url);
  drainHttpQueue();
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
  httpQueue.length = 0;
  enqueuedHttp.clear();
  httpSelfHealAttempts.clear();
  httpDomainLastAt.clear();
  httpBudgetUsed = 0;
  httpBudgetWindowStart = Date.now();
  if (httpDrainTimer !== null) {
    clearTimeout(httpDrainTimer);
    httpDrainTimer = null;
  }
  activeHttp = 0;
}
