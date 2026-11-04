import { useEffect, useState } from 'react';

/** 下载源摘要的骨架 → 失败阈值（毫秒）。 */
export const SOURCE_SUMMARY_TIMEOUT_MS = 3000;

/**
 * 下载源摘要的「骨架 → 超时失败」计时。
 *
 * 来源快照未到时先画中性骨架；超过阈值仍未到达才显示失败文案（避免网络慢时
 * 一闪而过的失败态）。快照到达后立即复位。
 */
export function useSourceSummaryGrace(loaded: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loaded) {
      setTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setTimedOut(true), SOURCE_SUMMARY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loaded]);

  return timedOut;
}
