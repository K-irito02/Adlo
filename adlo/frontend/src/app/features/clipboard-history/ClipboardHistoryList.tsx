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

const REFRESH_INTERVAL_MS = 10000;
const CHANGE_THROTTLE_MS = 100;
const CLIPBOARD_SCROLL_TOP_KEY = 'adl:ui.clipboardScrollTop';
const INITIAL_VISIBLE_ROWS = 30;
const LOAD_MORE_STEP = 30;
/** 距底部多少像素内即自动再取一页（滚轮/拖动滚动条到底后无需再点按钮）。 */
const AUTO_LOAD_MORE_THRESHOLD_PX = 48;

/**
 * 剪贴板历史主列表容器。
 * - 顶部渲染 ClipboardHistoryHeader（标题 + 计数 + 清空 + 搜索切换 + 类型筛选）
 * - 搜索模式下在历史区域顶部渲染搜索框 + Aa/ab/.* 选项（无替换功能）
 * - 条目按类型筛选 + 搜索词（大小写/全字/正则）联合过滤
 * - 列表用 CustomScrollArea 承载（与文件树一致的自定义滚动条）
 * - 空态使用 EmptyRow（居中、无句号）
 * - 挂载时触发 fetchClipboardHistory()
 * - 订阅剪贴板推送（`clipboard.onChanged`），变化到达即立即重取（100ms 节流合并突发），
 *   数十毫秒内出现新条目；10s 轮询仅作兜底，页面隐藏时暂停、恢复可见时立即刷新并恢复轮询
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
  const changeThrottleRef = useRef<number | undefined>(undefined);
  const changeTrailingPendingRef = useRef(false);
  const [viewerItem, setViewerItem] = useState<ClipboardItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);
  // 弹窗展示走 store 实时条目而非打开时快照：编辑保存后 `replaceClipboardHistoryItem`
  // 原位替换列表项，快照会让弹窗的 prop 永远停在旧内容（默认浏览态不刷新、重进编辑
  // 甚至用旧草稿覆盖新存档）；找不到（条目已删）则沿用快照，保持弹窗不闪退。
  const liveViewerItem = viewerItem
    ? (clipboardHistory.find((candidate) => candidate.id === viewerItem.id) ?? viewerItem)
    : null;
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
      // 先清掉可能存在的旧 interval：连续两次非 hidden 事件不该泄漏前一个计时器。
      window.clearInterval(timerId);
      if (document.hidden) {
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

  // 剪贴板推送：收到变化信号即重取，采用前缘+后缘 100ms 节流——首个变化立即刷新（前缘），
  // 节流窗内到达的变化合并为窗口结束时的一次补刷（后缘），保证每次变化 ~100ms 内可见；
  // 轮询仅作兜底。
  useEffect(() => {
    const unsubscribe = window.digitalLife.clipboard.onChanged(() => {
      if (changeThrottleRef.current === undefined) {
        void fetchClipboardHistory(true);
        changeThrottleRef.current = window.setTimeout(() => {
          changeThrottleRef.current = undefined;
          // 后缘：窗口内还有变化则补刷一次（合并为一次，避免窗口内多次重取）。
          if (changeTrailingPendingRef.current) {
            changeTrailingPendingRef.current = false;
            void fetchClipboardHistory(true);
          }
        }, CHANGE_THROTTLE_MS);
        return;
      }
      // 节流窗内的变化：标记待补刷，由窗口结束时的定时器统一执行。
      changeTrailingPendingRef.current = true;
    });
    return () => {
      unsubscribe();
      if (changeThrottleRef.current !== undefined) {
        window.clearTimeout(changeThrottleRef.current);
        changeThrottleRef.current = undefined;
      }
      changeTrailingPendingRef.current = false;
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

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ROWS);
  }, [
    clipboardSearch,
    clipboardKindFilter,
    clipboardSearchOpen,
    clipboardMatchCase,
    clipboardMatchWholeWord,
    clipboardUseRegex,
  ]);

  const visibleItems = filtered.slice(0, visibleCount);

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
          onScroll={(event) => {
            // 触底自动追加一页：点击「加载更多」仍保留为键盘/无滚动场景的显式入口。
            const el = event.currentTarget;
            if (visibleItems.length >= filtered.length) {
              return;
            }
            const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
            if (remaining <= AUTO_LOAD_MORE_THRESHOLD_PX) {
              setVisibleCount((count) => Math.min(count + LOAD_MORE_STEP, filtered.length));
            }
          }}
        >
          <ul className="adl-clipboard__list" role="list">
            {visibleItems.map((item) => (
              <ClipboardItemRow key={item.id} item={item} onZoom={handleZoom} />
            ))}
            {visibleItems.length < filtered.length ? (
              <li className="adl-clipboard__load-more">
                <button
                  type="button"
                  className="adl-clipboard__load-more-btn"
                  onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}
                >
                  {t.searchLoadMore}
                </button>
              </li>
            ) : null}
          </ul>
        </CustomScrollArea>
      )}
      {liveViewerItem ? (
        <ClipboardItemViewer item={liveViewerItem} onClose={handleCloseViewer} />
      ) : null}
    </section>
  );
}
