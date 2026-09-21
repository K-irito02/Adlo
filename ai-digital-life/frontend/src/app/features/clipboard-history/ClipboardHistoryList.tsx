import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { EmptyRow, LoadingRow } from '@components/LoadingRow';
import { TooltipSimple } from '@components/Tooltip';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { usePersistedScrollTop } from '@hooks/usePersistedScrollTop';
import { useTCopy } from '@i18n/useTCopy';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { ClipboardHistoryHeader, CLIPBOARD_SEARCH_PANEL_ID } from './ClipboardHistoryHeader';
import { ClipboardItemRow } from './ClipboardItemRow';
import { ClipboardItemViewer } from './ClipboardItemViewer';
import { buildClipboardFilterInput, filterClipboardItems } from './clipboardFilter';

const REFRESH_INTERVAL_MS = 2000;
const CLIPBOARD_SCROLL_TOP_KEY = 'adl:ui.clipboardScrollTop';

/**
 * 剪贴板历史主列表容器。
 * - 顶部渲染 ClipboardHistoryHeader（标题 + 计数 + 清空 + 搜索切换 + 类型筛选）
 * - 搜索模式下在历史区域顶部渲染搜索框 + Aa/ab/.* 选项（无替换功能）
 * - 条目按类型筛选 + 搜索词（大小写/全字/正则）联合过滤
 * - 列表用 CustomScrollArea 承载（与文件树一致的自定义滚动条）
 * - 空状态使用 EmptyRow（居中、无句号）
 * - 挂载时触发 fetchClipboardHistory()
 * - 以 2s 间隔轮询刷新；页面隐藏（document.hidden）时暂停、恢复可见时立即刷新并恢复轮询
 */
export function ClipboardHistoryList() {
  const { t, formatT } = useTCopy();
  const clipboardHistory = useAppStore((s) => s.clipboardHistory);
  const clipboardSearch = useAppStore((s) => s.clipboardSearch);
  const setClipboardSearch = useAppStore((s) => s.setClipboardSearch);
  const clipboardSearchOpen = useAppStore((s) => s.clipboardSearchOpen);
  const clipboardMatchCase = useAppStore((s) => s.clipboardMatchCase);
  const setClipboardMatchCase = useAppStore((s) => s.setClipboardMatchCase);
  const clipboardMatchWholeWord = useAppStore((s) => s.clipboardMatchWholeWord);
  const setClipboardMatchWholeWord = useAppStore((s) => s.setClipboardMatchWholeWord);
  const clipboardUseRegex = useAppStore((s) => s.clipboardUseRegex);
  const setClipboardUseRegex = useAppStore((s) => s.setClipboardUseRegex);
  const clipboardKindFilter = useAppStore((s) => s.clipboardKindFilter);
  const clipboardHistoryLoading = useAppStore((s) => s.clipboardHistoryLoading);
  const fetchClipboardHistory = useAppStore((s) => s.fetchClipboardHistory);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [viewerItem, setViewerItem] = useState<ClipboardItem | null>(null);
  const { scrollRef: clipboardScrollRef, tryRestore: tryRestoreClipboardScroll } =
    usePersistedScrollTop(CLIPBOARD_SCROLL_TOP_KEY, { usePersistChannel: true });

  const handleZoom = useCallback((item: ClipboardItem) => {
    setViewerItem(item);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewerItem(null);
  }, []);

  useEffect(() => {
    let timerId: number;
    const poll = () => {
      void fetchClipboardHistory(true);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearInterval(timerId);
        return;
      }
      poll();
      timerId = window.setInterval(poll, REFRESH_INTERVAL_MS);
    };

    void fetchClipboardHistory();
    timerId = window.setInterval(poll, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchClipboardHistory]);

  useEffect(() => {
    if (clipboardSearchOpen) {
      const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [clipboardSearchOpen]);

  const filtered = useMemo(
    () =>
      filterClipboardItems(
        clipboardHistory,
        buildClipboardFilterInput({
          kindFilter: clipboardKindFilter,
          searchOpen: clipboardSearchOpen,
          query: clipboardSearch,
          matchCase: clipboardMatchCase,
          matchWholeWord: clipboardMatchWholeWord,
          useRegex: clipboardUseRegex,
        }),
      ),
    [
      clipboardHistory,
      clipboardKindFilter,
      clipboardSearchOpen,
      clipboardSearch,
      clipboardMatchCase,
      clipboardMatchWholeWord,
      clipboardUseRegex,
    ],
  );

  // 内容异步加载：条目就绪后回填上次滚动位置（用户手动滚动后不再回填）。
  useEffect(() => {
    if (!clipboardHistoryLoading && filtered.length > 0) {
      tryRestoreClipboardScroll();
    }
  }, [clipboardHistoryLoading, filtered.length, tryRestoreClipboardScroll]);

  return (
    <section className="adl-clipboard adl-leftbar__nav" aria-label={t.clipboardHistory}>
      <ClipboardHistoryHeader visibleItems={filtered} />
      {clipboardSearchOpen ? (
        <div className="adl-clipboard__searchpanel" id={CLIPBOARD_SEARCH_PANEL_ID}>
          <label className="adl-search-panel__field adl-search-panel__field--with-actions">
            <input
              ref={searchInputRef}
              type="search"
              value={clipboardSearch}
              onChange={(event) => setClipboardSearch(event.target.value)}
              placeholder={t.searchPanelSearch as string}
              aria-label={t.searchPanelSearch as string}
            />
            <div
              className="adl-search-panel__toggles"
              role="toolbar"
              aria-label={formatT(t, 'searchOptions')}
            >
              <TooltipSimple content={t.searchPanelMatchCase} placement="top">
                <button
                  type="button"
                  className={`adl-search-panel__modebtn${clipboardMatchCase ? ' is-active' : ''}`}
                  aria-pressed={clipboardMatchCase ? 'true' : 'false'}
                  onClick={() => setClipboardMatchCase(!clipboardMatchCase)}
                  aria-label={t.searchPanelMatchCase as string}
                >
                  Aa
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.searchPanelMatchWholeWord} placement="top">
                <button
                  type="button"
                  className={`adl-search-panel__modebtn${clipboardMatchWholeWord ? ' is-active' : ''}`}
                  aria-pressed={clipboardMatchWholeWord ? 'true' : 'false'}
                  onClick={() => setClipboardMatchWholeWord(!clipboardMatchWholeWord)}
                  aria-label={t.searchPanelMatchWholeWord as string}
                >
                  ab
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.searchPanelUseRegex} placement="top">
                <button
                  type="button"
                  className={`adl-search-panel__modebtn${clipboardUseRegex ? ' is-active' : ''}`}
                  aria-pressed={clipboardUseRegex ? 'true' : 'false'}
                  onClick={() => setClipboardUseRegex(!clipboardUseRegex)}
                  aria-label={t.searchPanelUseRegex as string}
                >
                  .*
                </button>
              </TooltipSimple>
            </div>
          </label>
        </div>
      ) : null}
      {clipboardHistoryLoading ? (
        <LoadingRow variant="center" />
      ) : filtered.length === 0 ? (
        <EmptyRow
          message={clipboardHistory.length === 0 ? t.clipboardEmpty : t.clipboardNoMatch}
          variant="center"
        />
      ) : (
        <CustomScrollArea
          ref={clipboardScrollRef}
          shellClassName="adl-clipboard__scroll-shell"
          scrollClassName="adl-clipboard__scroll"
          scrollbarClassName="adl-clipboard__scrollbar"
          thumbClassName="adl-clipboard__scrollbar-thumb"
        >
          <ul className="adl-clipboard__list" role="list">
            {filtered.map((item) => (
              <ClipboardItemRow key={item.id} item={item} onZoom={handleZoom} />
            ))}
          </ul>
        </CustomScrollArea>
      )}
      {viewerItem ? <ClipboardItemViewer item={viewerItem} onClose={handleCloseViewer} /> : null}
    </section>
  );
}
