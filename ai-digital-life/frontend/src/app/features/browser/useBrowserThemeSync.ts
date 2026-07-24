import { useEffect } from 'react';
import { themeController } from '@utils/theme';

export function useBrowserThemeSync(): void {
  useEffect(() => {
    const state = themeController.getState();
    window.digitalLife?.browser?.setBrowserColorScheme(state.resolvedTheme).catch((err) => {
      console.warn('browser theme sync failed', err);
    });

    const unsubscribe = themeController.subscribe((newState) => {
      window.digitalLife?.browser?.setBrowserColorScheme(newState.resolvedTheme).catch((err) => {
        console.warn('browser theme sync failed', err);
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);
}

/**
 * Get the current resolved theme for WebView creation.
 *
 * Used by `useWebViewLifecycle` to pass the resolved theme to
 * `browser_create_for_tab`, eliminating the race where BrowserManager's
 * `current_color_scheme` defaults to "dark" before the first
 * `setBrowserColorScheme` call arrives.
 */
export function getResolvedTheme(): 'light' | 'dark' {
  return themeController.getState().resolvedTheme;
}
