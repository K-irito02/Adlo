import type { CopyDict, CopyKey } from './types';

export function formatT(t: CopyDict, key: CopyKey, vars?: Record<string, string | number>): string {
  const str = t[key] ?? key;
  if (!vars) {
    return str;
  }
  // 单次遍历替换：避免"先注入的文本含 {other} 占位符"时被后续替换命中（病态输入下的串扰）。
  return str.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}
