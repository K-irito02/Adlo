import type { CopyDict, CopyKey } from './types';

export function formatT(t: CopyDict, key: CopyKey, vars?: Record<string, string | number>): string {
  let str = t[key] ?? key;
  if (!vars) return str;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, String(v));
  }
  return str;
}
