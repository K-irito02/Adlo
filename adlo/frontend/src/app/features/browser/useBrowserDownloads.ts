import { useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';

export function useBrowserDownloads() {
  const subscribeDownloadEvents = useAppStore((s) => s.subscribeDownloadEvents);
  const fetchDownloads = useAppStore((s) => s.fetchDownloads);
  const fetchDownloadSettings = useAppStore((s) => s.fetchDownloadSettings);

  useEffect(() => {
    fetchDownloads();
    fetchDownloadSettings();
  }, [fetchDownloads, fetchDownloadSettings]);

  useEffect(() => {
    const unsub = subscribeDownloadEvents();
    return () => {
      unsub();
    };
  }, [subscribeDownloadEvents]);
}
