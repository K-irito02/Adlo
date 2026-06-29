import { useEffect, useState } from 'react';
import type { ResolvedTheme } from '../../design-system/theme';
import { themeController } from '../utils/theme';

export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(() => themeController.getState().resolvedTheme);

  useEffect(() => {
    return themeController.subscribe((state) => {
      setTheme(state.resolvedTheme);
    });
  }, []);

  return theme;
}
