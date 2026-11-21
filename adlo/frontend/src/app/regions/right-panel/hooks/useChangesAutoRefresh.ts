import { useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';

/** 变更面板可见时的兜底轮询间隔：watcher 漏事件/断线时仍能收敛。 */
export const CHANGES_AUTO_REFRESH_INTERVAL_MS = 15_000;

/**
 * 变更面板可见时的后台刷新：
 * - 激活瞬间补刷一次（覆盖第一次打开面板）；
 * - 每 `CHANGES_AUTO_REFRESH_INTERVAL_MS` 静默刷新所有已添加工作区快照；
 * - 窗口不可见（最小化/切到后台）时跳过 tick，避免无谓 IO；
 * - 实际去重由 `refreshAllGitSnapshotsSilent` 的 5s 新鲜期负责。
 */
export function useChangesAutoRefresh(active: boolean): void {
  const refreshAllGitSnapshotsSilent = useAppStore((s) => s.refreshAllGitSnapshotsSilent);

  useEffect(() => {
    if (!active) {
      return;
    }
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void refreshAllGitSnapshotsSilent();
    };
    tick();
    const timer = window.setInterval(tick, CHANGES_AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, refreshAllGitSnapshotsSilent]);
}
