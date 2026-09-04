import { useEffect, useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { EmptyRow, LoadingRow } from '@components/LoadingRow';
import { useTCopy } from '@i18n/useTCopy';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { ClipboardHistoryHeader } from './ClipboardHistoryHeader';
import { ClipboardItemRow } from './ClipboardItemRow';

function matchesQuery(item: ClipboardItem, normalizedQuery: string): boolean {
  return (
    item.kind.toLowerCase().includes(normalizedQuery) ||
    (item.content ?? '').toLowerCase().includes(normalizedQuery)
  );
}

/**
 * 剪贴板历史主列表容器。
 * - 顶部渲染 ClipboardHistoryHeader
 * - 下方渲染按 clipboardSearch 过滤后的条目列表
 * - 空状态使用 EmptyRow（居中、无句号）
 * - 挂载时触发 fetchClipboardHistory()
 */
export function ClipboardHistoryList() {
  const { t } = useTCopy();
  const clipboardHistory = useAppStore((s) => s.clipboardHistory);
  const clipboardSearch = useAppStore((s) => s.clipboardSearch);
  const clipboardHistoryLoading = useAppStore((s) => s.clipboardHistoryLoading);
  const fetchClipboardHistory = useAppStore((s) => s.fetchClipboardHistory);

  useEffect(() => {
    void fetchClipboardHistory();
  }, [fetchClipboardHistory]);

  const filtered = useMemo(() => {
    const query = clipboardSearch.trim().toLowerCase();
    if (!query) {
      return clipboardHistory;
    }
    return clipboardHistory.filter((item) => matchesQuery(item, query));
  }, [clipboardHistory, clipboardSearch]);

  return (
    <section className="adl-clipboard adl-leftbar__nav" aria-label={t.clipboardHistory}>
      <ClipboardHistoryHeader />
      {clipboardHistoryLoading ? (
        <LoadingRow variant="center" />
      ) : filtered.length === 0 ? (
        <EmptyRow message={t.clipboardEmpty} variant="center" />
      ) : (
        <ul className="adl-clipboard__list" role="list">
          {filtered.map((item) => (
            <ClipboardItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
