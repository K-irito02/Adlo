import { formatT } from '@i18n/formatT';
import type { CopyDict } from '@i18n/types';

/**
 * 把毫秒时间戳格式化为相对时间文案（与 NotificationCard 的时间戳语义一致）：
 * < 1 分钟 → 刚刚；< 1 小时 → N 分钟前；< 1 天 → N 小时前；其余 → N 天前。
 * 未来时间戳（时钟漂移）返回空串，由调用方决定是否回退。
 */
export function formatRelativeTime(ts: number, t: CopyDict): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 0) {
    return '';
  }
  if (seconds < 60) {
    return t.relativeTimeJustNow;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return formatT(t, 'relativeTimeMinutesAgo', { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return formatT(t, 'relativeTimeHoursAgo', { n: hours });
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return formatT(t, 'relativeTimeDaysAgo', { n: days });
  }
  return formatT(t, 'relativeTimeDaysAgo', { n: Math.floor(days / 30) * 30 });
}
