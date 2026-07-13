import { useEffect } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import { themeController } from '../utils/theme';

/**
 * appInfo 加载后同步主题控制器。
 *
 * 关键时序：
 * 1. index.html 内联脚本设置 data-theme + colorScheme（从 localStorage 缓存）
 * 2. useThemeSync 用后端 themeMode 调 setTheme（内部同步 DOM + localStorage）
 * 3. 同步完成后移除 no-transition 类，恢复 CSS transition
 *
 * 这样 appInfo 加载触发的主题切换不会产生 transition 动画放大闪烁。
 */
export function useThemeSync(appInfo: AppInfo | undefined) {
  useEffect(() => {
    if (!appInfo) {
      return;
    }

    themeController.setTheme({ mode: appInfo.config.themeMode });

    // 主题已稳定，恢复 CSS 过渡动画
    document.documentElement.classList.remove('no-transition');
  }, [appInfo, appInfo?.config.themeMode]);
}
