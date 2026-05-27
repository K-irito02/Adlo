import { useEffect } from "react";
import type { AppInfo } from "@ai-digital-life/kernel";
import { useAppActions } from "./useAppActions";

export function useTaskCenterPolling(appInfo: AppInfo | undefined) {
  const actions = useAppActions();

  useEffect(() => {
    if (!appInfo?.currentWorkspace) return;
    const timer = window.setInterval(() => {
      void actions.refreshTaskCenter();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [appInfo?.currentWorkspace, actions.refreshTaskCenter]);
}
