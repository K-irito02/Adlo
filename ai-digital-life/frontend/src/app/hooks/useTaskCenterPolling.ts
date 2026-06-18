import { useEffect } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import { useAppActions } from './useAppActions';

/**
 * Polls the task center for updates every 5 seconds when a workspace is active.
 *
 * NOTE: There is no Tauri event for task center changes. The Rust backend has
 * AppEvent::TaskCreated but it is internal to the Rust broadcast bus and not
 * exposed to the frontend via digital-life:// events. If a Tauri event becomes
 * available in the future, replace setInterval with subscribeChannel().
 */
export function useTaskCenterPolling(appInfo: AppInfo | undefined) {
  const actions = useAppActions();

  useEffect(() => {
    if (!appInfo?.currentWorkspace) {
      return;
    }

    // Initial fetch on mount
    void actions.refreshTaskCenter();

    const timer = window.setInterval(() => {
      void actions.refreshTaskCenter();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [appInfo?.currentWorkspace, actions, actions.refreshTaskCenter]);
}
