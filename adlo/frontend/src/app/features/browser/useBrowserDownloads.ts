import { useEffect, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';

const FOCUS_REFRESH_THROTTLE_MS = 2000;

export function useBrowserDownloads() {
  const isTauri = useAppStore((s) => s.isTauri);
  const subscribeDownloadEvents = useAppStore((s) => s.subscribeDownloadEvents);
  const fetchDownloads = useAppStore((s) => s.fetchDownloads);
  const fetchDownloadSettings = useAppStore((s) => s.fetchDownloadSettings);
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const lastFocusRefreshRef = useRef<number>(0);

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

  // 默认下载路径变更后刷新文件存在状态
  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const ids = useAppStore.getState().downloads.map((d) => d.id);
    if (ids.length === 0) {
      return;
    }
    void useAppStore.getState().refreshDownloadFileStates(ids);
  }, [isTauri, downloadSettings.default_path]);

  // 窗口重新获得焦点时按 2s 节流刷新文件存在状态
  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < FOCUS_REFRESH_THROTTLE_MS) {
        return;
      }
      lastFocusRefreshRef.current = now;
      const ids = useAppStore.getState().downloads.map((d) => d.id);
      if (ids.length === 0) {
        return;
      }
      void useAppStore.getState().refreshDownloadFileStates(ids);
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [isTauri]);
}
