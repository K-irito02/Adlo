import { buildSearchPattern } from '@utils/searchPattern';
import type { ClipboardItem } from '@shared/ipc/clipboard';

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

/** 已知类型的固定展示顺序；未在表中的类型按字典序排在其后。 */
const KIND_ORDER = ['text', 'image'];

/**
 * 由当前筛选/搜索状态组装过滤入参（header 计数、清空判定、列表渲染共用同一份，
 * 避免"搜索面板关闭则忽略搜索词"之类的条件在多处漂移）。
 */
export function buildClipboardFilterInput(state: {
  kindFilter: string;
  searchOpen: boolean;
  query: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  useRegex: boolean;
}): ClipboardFilterInput {
  return {
    kindFilter: state.kindFilter,
    query: state.searchOpen ? state.query : '',
    matchCase: state.matchCase,
    wholeWord: state.matchWholeWord,
    useRegex: state.useRegex,
  };
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
  const pattern = buildSearchPattern(input.query, {
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
 * 统计各实际类型条目数（筛选菜单数据源），按固定类型序排列，
 * 未登记的 kind 排在已知类型之后并按字典序，避免菜单项随复制行为重排。
 */
export function getClipboardKindCounts(items: ClipboardItem[]): ClipboardKindCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => {
      const ai = KIND_ORDER.indexOf(a.kind);
      const bi = KIND_ORDER.indexOf(b.kind);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? KIND_ORDER.length : ai) - (bi === -1 ? KIND_ORDER.length : bi);
      }
      return a.kind.localeCompare(b.kind);
    });
}
