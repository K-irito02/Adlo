import { useEffect } from 'react';
import { themeController } from '@utils/theme';

export function useBrowserThemeSync(): void {
  useEffect(() => {
    const state = themeController.getState();
    window.digitalLife?.browser?.setBrowserColorScheme(state.resolvedTheme).catch(() => {});

    const unsubscribe = themeController.subscribe((newState) => {
      window.digitalLife?.browser?.setBrowserColorScheme(newState.resolvedTheme).catch(() => {});
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
