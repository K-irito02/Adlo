import { createContext, type ReactNode } from 'react';
import type { CopyDict, Locale } from './types';

export interface TCopyContextValue {
  t: CopyDict;
  locale: Locale;
}

export const TCopyContext = createContext<TCopyContextValue | null>(null);

export function TCopyProvider({
  t,
  locale,
  children,
}: TCopyContextValue & { children: ReactNode }) {
  return (
    <TCopyContext.Provider value={{ t, locale }}>
      {children}
    </TCopyContext.Provider>
  );
}
