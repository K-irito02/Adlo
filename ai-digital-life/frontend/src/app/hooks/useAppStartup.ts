import { useEffect } from "react";
import type { AppInfo } from "@ai-digital-life/kernel";
import { copy, type Locale } from "../copy";
import { useAppActions } from "./useAppActions";
import { useThemeSync } from "./useThemeSync";
import { useTaskCenterPolling } from "./useTaskCenterPolling";

export function useAppStartup(appInfo: AppInfo | undefined) {
  const actions = useAppActions();

  useThemeSync(appInfo);
  useTaskCenterPolling(appInfo);

  const locale = (appInfo?.config.language ?? "zh-CN") as Locale;
  const t = copy[locale];

  useEffect(() => {
    void window.digitalLife.window.setTitle(t.brandHoverName);
  }, [t.brandHoverName]);

  useEffect(() => {
    void actions.bootstrap();
  }, [actions.bootstrap]);

  useEffect(() => {
    return window.digitalLife.workspace.onFileChanged((event) => {
      actions.markExternalFileChange(event);
    });
  }, [actions.markExternalFileChange]);

  return {
    locale,
    t,
  };
}
