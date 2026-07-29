import { useContext, useMemo } from 'react';
import { TCopyContext, type TCopyContextValue } from './TCopyContext';
import { formatT } from './formatT';

export function useTCopy(): TCopyContextValue & { formatT: typeof formatT } {
  const ctx = useContext(TCopyContext);
  if (!ctx) {
    throw new Error('useTCopy must be used within a TCopyProvider');
  }
  return useMemo(() => ({ ...ctx, formatT }), [ctx]);
}

export type { TCopyContextValue };
