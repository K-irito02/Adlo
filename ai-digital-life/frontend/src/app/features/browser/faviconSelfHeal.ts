import { pageMetaClient } from '@utils/pageMetaClient';

/**
 * 书签 favicon 自愈：收藏/新建书签后延迟后台抓取页面元数据补全缺失的 favicon。
 *
 * 会话级节流（模块状态）：同一 URL 在窗口内不重复触发静默重渲染，避免对永久无
 * favicon 的站点每次开对话框都重建一次 WebView2。面板与中心两个宿主共用本模块，
 * 节流状态因此跨宿主共享（同一 URL 不必各自重试一遍）。
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

/** 仅测试用：清空会话级自愈节流状态。 */
export function resetFaviconSelfHealThrottleForTest(): void {
  faviconSelfHealAttempts.clear();
}
