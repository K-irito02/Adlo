import { useEffect } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import { themeController } from '../utils/theme';

export function useThemeSync(appInfo: AppInfo | undefined) {
  useEffect(() => {
    if (!appInfo) {
      return;
    }

    const { themeMode } = appInfo.config;
    const resolvedTheme =
      themeMode === 'system'
        ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
          ? 'dark'
          : 'light'
        : appInfo.config.resolvedTheme;

    themeController.setTheme({ mode: themeMode, resolvedTheme });
    themeController.hydrate();
  }, [appInfo, appInfo?.config.themeMode, appInfo?.config.resolvedTheme]);
}
