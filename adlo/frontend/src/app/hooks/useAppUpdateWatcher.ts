import { useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';

/** 启动后延迟多久做第一次静默检查（避开启动 IO 高峰）。 */
const FIRST_CHECK_DELAY_MS = 45_000;
/** 常驻期间的检查间隔。 */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 应用更新的后台节奏（ADR-0026 的检查策略）：启动 45 秒后查一次，之后每 24 小时一次，
 * 并把下载进度事件接进 store。浏览器模式 `supported: false`，整段直接跳过。
 *
 * 失败一律静默：自动检查不弹任何东西，只有「关于」页的手动检查才展示错误。
 */
export function useAppUpdateWatcher(): void {
  const checkAppUpdate = useAppStore((s) => s.checkAppUpdate);
  const setAppUpdateProgress = useAppStore((s) => s.setAppUpdateProgress);

  useEffect(() => {
    const bridge = window.digitalLife?.update;
    if (!bridge?.supported) {
      return;
    }
    const unsubscribe = bridge.onProgress(setAppUpdateProgress);
    const firstTimer = window.setTimeout(() => {
      void checkAppUpdate();
    }, FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => {
      void checkAppUpdate();
    }, CHECK_INTERVAL_MS);
    return () => {
      unsubscribe();
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
    };
  }, [checkAppUpdate, setAppUpdateProgress]);
}
