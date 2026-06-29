import { useEffect } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import { themeController } from '../utils/theme';

export function useThemeSync(appInfo: AppInfo | undefined) {
  useEffect(() => {
    if (!appInfo) {
      return;
    }

    themeController.setTheme({ mode: appInfo.config.themeMode });
    themeController.hydrate();
  }, [appInfo, appInfo?.config.themeMode]);
}
