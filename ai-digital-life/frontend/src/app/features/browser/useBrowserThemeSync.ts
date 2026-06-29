import { useEffect } from 'react';
import { themeController } from '../../utils/theme';

export function useBrowserThemeSync(): void {
  useEffect(() => {
    const state = themeController.getState();
    console.log('[ADL-DEBUG] useBrowserThemeSync initial', state.resolvedTheme);
    window.digitalLife?.browser?.setBrowserColorScheme(state.resolvedTheme).catch(() => {});

    const unsubscribe = themeController.subscribe((newState) => {
      console.log('[ADL-DEBUG] useBrowserThemeSync changed', newState.resolvedTheme);
      window.digitalLife?.browser?.setBrowserColorScheme(newState.resolvedTheme).catch(() => {});
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
