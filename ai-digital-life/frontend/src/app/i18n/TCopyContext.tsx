import { createContext, useMemo, type ReactNode } from 'react';
import type { CopyDict, Locale } from './types';

export interface TCopyContextValue {
  t: CopyDict;
  locale: Locale;
}

// eslint-disable-next-line react-refresh/only-export-components
export const TCopyContext = createContext<TCopyContextValue | null>(null);

export function TCopyProvider({
  t,
  locale,
  children,
}: TCopyContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ t, locale }), [t, locale]);
  return <TCopyContext.Provider value={value}>{children}</TCopyContext.Provider>;
}
