import { useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';

export function useBrowserDownloads() {
  const isTauri = useAppStore((s) => s.isTauri);
  const subscribeDownloadEvents = useAppStore((s) => s.subscribeDownloadEvents);
  const fetchDownloads = useAppStore((s) => s.fetchDownloads);
  const fetchDownloadSettings = useAppStore((s) => s.fetchDownloadSettings);

  // App 根挂载早于 Tauri bridge 就绪：首轮 isTauri=false 时不能订阅后就不再重试，
  // 否则下载事件永远进不了 store，工具栏下载按钮不会出现进度环/角标。
  // isTauri 变 true 后重新拉取并订阅（下载菜单打开时还会再 fetch 一次兜底）。
  useEffect(() => {
    if (!isTauri) {
      return;
    }
    fetchDownloads();
    fetchDownloadSettings();
  }, [isTauri, fetchDownloads, fetchDownloadSettings]);

  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const unsub = subscribeDownloadEvents();
    return () => {
      unsub();
    };
  }, [isTauri, subscribeDownloadEvents]);
}
