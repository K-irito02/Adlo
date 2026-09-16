import type { ClipboardItem } from '@shared/ipc/clipboard';

export interface ClipboardSearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export interface ClipboardFilterInput {
  kindFilter: string;
  query: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

export interface ClipboardKindCount {
  kind: string;
  count: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 构造剪贴板搜索正则（对齐文件面板 useSearchPanel 的 buildSearchPattern 语义）：
 * 非正则模式先转义；全字匹配包 \b；非法正则返回 undefined（调用方视为空结果）。
 */
export function buildClipboardSearchPattern(
  query: string,
  options: ClipboardSearchOptions,
): RegExp | undefined {
  if (!query.trim()) {
    return undefined;
  }
  const source = options.useRegex ? query : escapeRegExp(query);
  const wrapped = options.wholeWord ? `\\b${source}\\b` : source;
  try {
    return new RegExp(wrapped, options.matchCase ? 'g' : 'gi');
  } catch {
    return undefined;
  }
}

function matchesClipboardQuery(item: ClipboardItem, pattern: RegExp): boolean {
  const source = `${item.kind}\n${item.content ?? ''}`;
  pattern.lastIndex = 0;
  return pattern.test(source);
}

/**
 * 先按类型过滤（'all' 跳过），再按搜索词过滤；搜索词为空时返回类型过滤结果。
 */
export function filterClipboardItems(
  items: ClipboardItem[],
  input: ClipboardFilterInput,
): ClipboardItem[] {
  const byKind =
    input.kindFilter === 'all' ? items : items.filter((item) => item.kind === input.kindFilter);
  if (!input.query.trim()) {
    return byKind;
  }
  const pattern = buildClipboardSearchPattern(input.query, {
    matchCase: input.matchCase ?? false,
    wholeWord: input.wholeWord ?? false,
    useRegex: input.useRegex ?? false,
  });
  if (!pattern) {
    return [];
  }
  return byKind.filter((item) => matchesClipboardQuery(item, pattern));
}

/**
 * 按首次出现顺序统计各实际类型的条目数（筛选菜单数据源）。
 */
export function getClipboardKindCounts(items: ClipboardItem[]): ClipboardKindCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  return [...counts.entries()].map(([kind, count]) => ({ kind, count }));
}
