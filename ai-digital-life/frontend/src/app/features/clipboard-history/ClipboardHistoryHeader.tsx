import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { IconChevronDown, IconClipboardList, IconReturn, IconSearch, IconTrash } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { getClipboardKindCounts } from './clipboardFilter';
import { getClipboardKindLabel } from './clipboardKind';
import { buildClipboardClearScope } from './clipboardClearScope';

interface ClipboardHistoryHeaderProps {
  /** 当前可见条目（由列表容器单点派生后下传，避免计数/清空/渲染各自计算导致漂移）。 */
  visibleItems: ClipboardItem[];
}

/** 搜索面板 DOM id（面板由列表容器渲染，此处仅用于 `aria-controls` 关联）。 */
export const CLIPBOARD_SEARCH_PANEL_ID = 'adl-clipboard-search-panel';

const FILTER_MENU_ID = 'adl-clipboard-filter-menu';

/**
 * 剪贴板历史头部：标题 + 过滤后计数 + 「清空」（二次确认）+ 搜索切换 + 类型筛选。
 *
 * 清空语义由 `buildClipboardClearScope` 单点决定：范围为空 → 后端全清；
 * 否则逐条删除可见条目，且说明文案与执行动作同源，不会出现"文案说筛选、实际清全部"。
 */
export function ClipboardHistoryHeader({ visibleItems }: ClipboardHistoryHeaderProps) {
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
  const [clearing, setClearing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const filterBtnRef = useRef<HTMLButtonElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  const kindCounts = useMemo(() => getClipboardKindCounts(clipboardHistory), [clipboardHistory]);

  const activeFilterLabel =
    clipboardKindFilter === 'all'
      ? t.clipboardFilterAll
      : getClipboardKindLabel(clipboardKindFilter, t);

  // 清空范围描述：null 表示未收窄（清空全部）。动作、tooltip、确认框标题与正文全部由它派生。
  const clearScope = useMemo(
    () =>
      buildClipboardClearScope(
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
      ) ?? null,
    [
      t,
      clipboardSearchOpen,
      clipboardSearch,
      clipboardMatchCase,
      clipboardMatchWholeWord,
      clipboardUseRegex,
      clipboardKindFilter,
      activeFilterLabel,
    ],
  );

  const clearLabel = clearScope ? t.clipboardClearFiltered : t.clipboardClearAll;
  const clearConfirmMessage = clearScope
    ? formatT(t, 'clipboardClearConfirmScoped', { scope: clearScope })
    : t.clipboardClearConfirmAll;

  // 类型筛选值失效（该类型条目已被删空）时回退到「全部」，避免按钮显示历史中不存在的类型。
  useEffect(() => {
    if (clipboardKindFilter !== 'all' && !kindCounts.some((c) => c.kind === clipboardKindFilter)) {
      setClipboardKindFilter('all');
    }
  }, [clipboardKindFilter, kindCounts, setClipboardKindFilter]);

  const closeFilterMenu = useCallback((refocusTrigger: boolean) => {
    setFilterOpen(false);
    if (refocusTrigger) {
      filterBtnRef.current?.focus();
    }
  }, []);

  // 菜单按钮模式：打开时聚焦选中项，方向键/Home/End 循环移动，Escape 归还焦点，Tab 关闭后自然移出。
  useEffect(() => {
    if (!filterOpen) {
      return;
    }
    const items = Array.from(
      filterMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [],
    );
    const selected = items.find((el) => el.getAttribute('aria-checked') === 'true');
    (selected ?? items[0])?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFilterMenu(true);
        return;
      }
      if (event.key === 'Tab') {
        setFilterOpen(false);
        return;
      }
      const current = items.indexOf(document.activeElement as HTMLElement);
      let next = -1;
      if (event.key === 'ArrowDown') {
        next = current < 0 ? 0 : (current + 1) % items.length;
      } else if (event.key === 'ArrowUp') {
        next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
      } else if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = items.length - 1;
      }
      if (next >= 0 && items[next]) {
        event.preventDefault();
        items[next].focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [filterOpen, closeFilterMenu]);

  const closeConfirm = useCallback(() => {
    if (!clearing) {
      setConfirmOpen(false);
    }
  }, [clearing]);

  useEffect(() => {
    if (!confirmOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeConfirm();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmOpen, closeConfirm]);

  const handleClear = async () => {
    setClearing(true);
    try {
      if (clearScope === null) {
        await clearAllClipboard();
      } else {
        for (const item of visibleItems) {
          await removeClipboardItem(item.id);
        }
      }
    } catch {
      // 单项删除失败已由 store 层 captureError 呈现；此处仅避免未捕获 rejection。
    } finally {
      setClearing(false);
      setConfirmOpen(false);
    }
  };

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
        <TooltipSimple content={clearLabel} placement="right">
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs adl-clipboard__clear adl-icon-btn--danger-hover"
            onClick={() => setConfirmOpen(true)}
            aria-label={clearLabel}
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
            className={`adl-icon-btn adl-clipboard__searchbtn${clipboardSearchOpen ? ' is-toggled' : ''}`}
            onClick={() => setClipboardSearchOpen(!clipboardSearchOpen)}
            aria-label={clipboardSearchOpen ? t.browserBack : t.clipboardSearchPlaceholder}
            aria-expanded={clipboardSearchOpen ? 'true' : 'false'}
            aria-controls={CLIPBOARD_SEARCH_PANEL_ID}
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
              ref={filterBtnRef}
              type="button"
              className={`adl-icon-btn adl-clipboard__filterbtn${filterOpen ? ' is-toggled' : ''}`}
              onClick={() => (filterOpen ? closeFilterMenu(false) : setFilterOpen(true))}
              aria-label={`${t.clipboardFilter}: ${activeFilterLabel}`}
              aria-haspopup="menu"
              aria-expanded={filterOpen ? 'true' : 'false'}
              aria-controls={FILTER_MENU_ID}
            >
              <span className="adl-clipboard__filterbtn-label">{activeFilterLabel}</span>
              <IconChevronDown size={12} decorative />
            </button>
          </TooltipSimple>

          {filterOpen ? (
            <div
              id={FILTER_MENU_ID}
              ref={filterMenuRef}
              className="adl-sidebar-menu adl-clipboard__filtermenu"
              role="menu"
              aria-label={t.clipboardFilter}
            >
              <button
                type="button"
                className="adl-sidebar-menu__item adl-clipboard__filtermenu-item"
                role="menuitemradio"
                aria-checked={clipboardKindFilter === 'all' ? 'true' : 'false'}
                onClick={() => {
                  setClipboardKindFilter('all');
                  closeFilterMenu(true);
                }}
              >
                <span className="adl-clipboard__filtermenu-name">{t.clipboardFilterAll}</span>
                <span className="adl-clipboard__filtermenu-count">{clipboardHistory.length}</span>
              </button>
              {kindCounts.map(({ kind, count }) => (
                <button
                  key={kind}
                  type="button"
                  className="adl-sidebar-menu__item adl-clipboard__filtermenu-item"
                  role="menuitemradio"
                  aria-checked={clipboardKindFilter === kind ? 'true' : 'false'}
                  onClick={() => {
                    setClipboardKindFilter(kind);
                    closeFilterMenu(true);
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
              onClick={(e) => (e.target === e.currentTarget ? closeConfirm() : undefined)}
            >
              <div
                className="adl-prompt-modal__panel"
                role="dialog"
                aria-modal="true"
                aria-label={clearLabel}
              >
                <div className="adl-prompt-modal__header">
                  {clearLabel}
                  <button
                    type="button"
                    className="adl-prompt-modal__header-close"
                    onClick={closeConfirm}
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
                    onClick={closeConfirm}
                    disabled={clearing}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--primary adl-btn--square"
                    onClick={() => void handleClear()}
                    disabled={clearing}
                    aria-busy={clearing ? 'true' : 'false'}
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
