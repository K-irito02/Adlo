import { formatT } from '@i18n/formatT';
import type { CopyDict } from '@i18n/types';

export interface ClipboardClearScopeInput {
  /** 搜索面板是否展开（关闭时搜索词不参与过滤，故也不计入清空范围） */
  searchOpen: boolean;
  query: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  useRegex: boolean;
  /** 当前类型筛选，`'all'` 表示不限类型 */
  kindFilter: string;
  /** 已本地化的类型名（kindFilter === 'all' 时忽略） */
  kindLabel: string;
}

/**
 * 生成"清空范围"描述（如 `搜索"good"（区分大小写）和筛选类型为"文本"`），
 * 供清空确认对话框按用户真实操作情况显示。返回 `undefined` 表示未收窄范围（即清空全部）。
 */
export function buildClipboardClearScope(
  input: ClipboardClearScopeInput,
  t: CopyDict,
): string | undefined {
  const parts: string[] = [];

  const query = input.query.trim();
  if (input.searchOpen && query) {
    const options = [
      input.matchCase ? t.searchPanelMatchCase : '',
      input.matchWholeWord ? t.searchPanelMatchWholeWord : '',
      input.useRegex ? t.searchPanelUseRegex : '',
    ].filter(Boolean);
    const search = formatT(t, 'clipboardClearScopeSearch', { query: input.query });
    parts.push(
      options.length
        ? formatT(t, 'clipboardClearScopeOptions', {
            scope: search,
            options: options.join(t.clipboardListSeparator),
          })
        : search,
    );
  }

  if (input.kindFilter !== 'all') {
    parts.push(formatT(t, 'clipboardClearScopeFilter', { kind: input.kindLabel }));
  }

  if (parts.length === 0) {
    return undefined;
  }
  return parts.length === 1
    ? parts[0]
    : formatT(t, 'clipboardClearScopeJoin', { a: parts[0], b: parts[1] });
}
