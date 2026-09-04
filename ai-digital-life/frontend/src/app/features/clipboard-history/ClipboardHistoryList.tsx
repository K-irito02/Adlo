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

const REFRESH_INTERVAL_MS = 2000;

/**
 * 剪贴板历史主列表容器。
 * - 顶部渲染 ClipboardHistoryHeader
 * - 下方渲染按 clipboardSearch 过滤后的条目列表
 * - 空状态使用 EmptyRow（居中、无句号）
 * - 挂载时触发 fetchClipboardHistory()
 * - 以 2s 间隔轮询刷新；页面隐藏（document.hidden）时暂停、恢复可见时立即刷新并恢复轮询
 */
export function ClipboardHistoryList() {
  const { t } = useTCopy();
  const clipboardHistory = useAppStore((s) => s.clipboardHistory);
  const clipboardSearch = useAppStore((s) => s.clipboardSearch);
  const clipboardHistoryLoading = useAppStore((s) => s.clipboardHistoryLoading);
  const fetchClipboardHistory = useAppStore((s) => s.fetchClipboardHistory);

  useEffect(() => {
    let timerId: number;
    const poll = () => {
      void fetchClipboardHistory();
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearInterval(timerId);
        return;
      }
      poll();
      timerId = window.setInterval(poll, REFRESH_INTERVAL_MS);
    };

    poll();
    timerId = window.setInterval(poll, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
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
