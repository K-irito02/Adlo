import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { IconChevronDown, IconClipboardList, IconReturn, IconSearch, IconTrash } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';
import { filterClipboardItems, getClipboardKindCounts } from './clipboardFilter';
import { getClipboardKindLabel } from './clipboardKind';
import { buildClipboardClearScope } from './clipboardClearScope';

/**
 * 剪贴板历史头部：标题 + 过滤后计数 + 「清空全部」（二次确认）+ 搜索切换 + 类型筛选。
 */
export function ClipboardHistoryHeader() {
  const { t, formatT } = useTCopy();
  const clipboardHistory = useAppStore((s) => s.clipboardHistory);
  const clipboardSearch = useAppStore((s) => s.clipboardSearch);
  const clipboardSearchOpen = useAppStore((s) => s.clipboardSearchOpen);
  const setClipboardSearchOpen = useAppStore((s) => s.setClipboardSearchOpen);
  const clipboardMatchCase = useAppStore((s) => s.clipboardMatchCase);
  const clipboardMatchWholeWord = useAppStore((s) => s.clipboardMatchWholeWord);
  const clipboardUseRegex = useAppStore((s) => s.clipboardUseRegex);
  const clipboardKindFilter = useAppStore((s) => s.clipboardKindFilter);
  const setClipboardKindFilter = useAppStore((s) => s.setClipboardKindFilter);
  const clearAllClipboard = useAppStore((s) => s.clearAllClipboard);
  const removeClipboardItem = useAppStore((s) => s.removeClipboardItem);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);

  // 当前显示条目（计数与清空均以此为准；搜索词仅在搜索模式下参与过滤）。
  const visibleItems = useMemo(
    () =>
      filterClipboardItems(clipboardHistory, {
        kindFilter: clipboardKindFilter,
        query: clipboardSearchOpen ? clipboardSearch : '',
        matchCase: clipboardMatchCase,
        wholeWord: clipboardMatchWholeWord,
        useRegex: clipboardUseRegex,
      }),
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

  const kindCounts = useMemo(() => getClipboardKindCounts(clipboardHistory), [clipboardHistory]);

  useEffect(() => {
    if (!filterOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFilterOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [filterOpen]);

  // 仅删除当前搜索/筛选结果：可见即全部时走后端全清，否则逐条删除可见条目。
  const handleClearAll = async () => {
    if (visibleItems.length === clipboardHistory.length) {
      await clearAllClipboard();
    } else {
      for (const item of visibleItems) {
        await removeClipboardItem(item.id);
      }
    }
    setConfirmOpen(false);
  };

  const activeFilterLabel =
    clipboardKindFilter === 'all'
      ? t.clipboardFilterAll
      : getClipboardKindLabel(clipboardKindFilter, t);

  // 确认对话框按用户真实操作情况描述清空范围；无收窄条件时回退到"全部"。
  const clearConfirmMessage = useMemo(() => {
    const scope = buildClipboardClearScope(
      {
        searchOpen: clipboardSearchOpen,
        query: clipboardSearch,
        matchCase: clipboardMatchCase,
        matchWholeWord: clipboardMatchWholeWord,
        useRegex: clipboardUseRegex,
        kindFilter: clipboardKindFilter,
        kindLabel: activeFilterLabel,
      },
      t,
    );
    return scope
      ? formatT(t, 'clipboardClearConfirmScoped', { scope })
      : t.clipboardClearConfirmAll;
  }, [
    t,
    formatT,
    clipboardSearchOpen,
    clipboardSearch,
    clipboardMatchCase,
    clipboardMatchWholeWord,
    clipboardUseRegex,
    clipboardKindFilter,
    activeFilterLabel,
  ]);

  return (
    <div className="adl-clipboard__header">
      <div className="adl-workspace-toolbar adl-clipboard__toolbar">
        <div className="adl-section-toolbar__title">
          <IconClipboardList size={14} decorative />
          <span className="adl-section-toolbar__label">{t.clipboardHistory}</span>
        </div>
        <span className="adl-clipboard__count" role="status" aria-live="polite">
          {visibleItems.length}
        </span>
        <TooltipSimple content={t.clipboardClearFiltered} placement="right">
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs adl-clipboard__clear"
            onClick={() => setConfirmOpen(true)}
            aria-label={t.clipboardClearFiltered}
            disabled={visibleItems.length === 0}
          >
            <IconTrash size={12} decorative />
          </button>
        </TooltipSimple>
      </div>

      <div className="adl-clipboard__actions">
        <TooltipSimple
          content={clipboardSearchOpen ? t.browserBack : t.clipboardSearchPlaceholder}
          placement="top"
        >
          <button
            type="button"
            className={`adl-clipboard__searchbtn${clipboardSearchOpen ? ' is-active' : ''}`}
            onClick={() => setClipboardSearchOpen(!clipboardSearchOpen)}
            aria-label={clipboardSearchOpen ? t.browserBack : t.clipboardSearchPlaceholder}
            aria-expanded={clipboardSearchOpen ? 'true' : 'false'}
          >
            {clipboardSearchOpen ? (
              <IconReturn size={14} decorative />
            ) : (
              <IconSearch size={14} decorative />
            )}
          </button>
        </TooltipSimple>

        <div className="adl-clipboard__filter" ref={filterRef}>
          <TooltipSimple content={t.clipboardFilter} placement="top">
            <button
              type="button"
              className={`adl-clipboard__filterbtn${filterOpen ? ' is-open' : ''}`}
              onClick={() => setFilterOpen((v) => !v)}
              aria-label={t.clipboardFilter}
              aria-haspopup="menu"
              aria-expanded={filterOpen ? 'true' : 'false'}
            >
              <span className="adl-clipboard__filterbtn-label">{activeFilterLabel}</span>
              <IconChevronDown size={12} decorative />
            </button>
          </TooltipSimple>

          {filterOpen ? (
            <div className="adl-clipboard__filtermenu" role="menu" aria-label={t.clipboardFilter}>
              <button
                type="button"
                className="adl-clipboard__filtermenu-item"
                role="menuitemradio"
                aria-checked={clipboardKindFilter === 'all' ? 'true' : 'false'}
                onClick={() => {
                  setClipboardKindFilter('all');
                  setFilterOpen(false);
                }}
              >
                <span className="adl-clipboard__filtermenu-name">{t.clipboardFilterAll}</span>
                <span className="adl-clipboard__filtermenu-count">{clipboardHistory.length}</span>
              </button>
              {kindCounts.map(({ kind, count }) => (
                <button
                  key={kind}
                  type="button"
                  className="adl-clipboard__filtermenu-item"
                  role="menuitemradio"
                  aria-checked={clipboardKindFilter === kind ? 'true' : 'false'}
                  onClick={() => {
                    setClipboardKindFilter(kind);
                    setFilterOpen(false);
                  }}
                >
                  <span className="adl-clipboard__filtermenu-name">
                    {getClipboardKindLabel(kind, t)}
                  </span>
                  <span className="adl-clipboard__filtermenu-count">{count}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {confirmOpen
        ? createPortal(
            <div
              className="adl-prompt-modal"
              onClick={(e) => (e.target === e.currentTarget ? setConfirmOpen(false) : undefined)}
            >
              <div
                className="adl-prompt-modal__panel"
                role="dialog"
                aria-modal="true"
                aria-label={t.clipboardClearFiltered}
              >
                <div className="adl-prompt-modal__header">
                  {t.clipboardClearFiltered}
                  <button
                    type="button"
                    className="adl-prompt-modal__header-close"
                    onClick={() => setConfirmOpen(false)}
                    aria-label={t.close}
                  >
                    ✕
                  </button>
                </div>
                <div className="adl-prompt-modal__item-info adl-prompt-modal__item-info--plain">
                  {clearConfirmMessage}
                </div>
                <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
                  <button
                    type="button"
                    className="adl-btn adl-btn--ghost adl-btn--square"
                    onClick={() => setConfirmOpen(false)}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--primary adl-btn--square"
                    onClick={() => void handleClearAll()}
                  >
                    {t.confirm}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
