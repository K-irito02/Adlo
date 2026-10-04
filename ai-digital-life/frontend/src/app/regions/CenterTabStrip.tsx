import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { TooltipSimple } from '@components/Tooltip';
import { IconClose, IconNewTabPage, IconPanelRight, IconPlus, IconTerminal } from '@icons';
import { TerminalProfileIcon } from '@features/terminal/TerminalProfileIcon';
import { terminalPtyRuntime } from '@features/terminal/terminalPtyRuntime';
import { removeSiteMetaIfUnreferenced } from '@features/browser/siteMetaCleanup';
import { browserPool } from '@features/browser/browserPoolSingleton';
import type { CenterTabState } from '@stores/slices/centerTabsSlice';

/**
 * 标题栏中心标签条：单行、溢出裁切（滚动条隐藏，`onWheel` 把纵向滚轮映射到横向
 * `scrollLeft`），可拖拽区由容器的 `data-tauri-drag-region` 提供（标签/按钮不设该属性，
 * 点击标签不会拖动窗口）。右端 `+` 固定不随标签滚动。
 */
export const CenterTabStrip = React.memo(function CenterTabStrip() {
  const { t } = useTCopy();
  const {
    centerTabs,
    centerActiveTabId,
    browserTabsById,
    terminalTabsById,
    centerSelectTab,
    centerRemoveTab,
    centerAddTab,
    centerReturnToPanel,
    browserCloseTab,
    terminalUpdateTab,
  } = useAppStore(
    useShallow((state) => ({
      centerTabs: state.centerTabs,
      centerActiveTabId: state.centerActiveTabId,
      browserTabsById: state.browserTabsById,
      terminalTabsById: state.terminalTabsById,
      centerSelectTab: state.centerSelectTab,
      centerRemoveTab: state.centerRemoveTab,
      centerAddTab: state.centerAddTab,
      centerReturnToPanel: state.centerReturnToPanel,
      browserCloseTab: state.browserCloseTab,
      terminalUpdateTab: state.terminalUpdateTab,
    })),
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  // 终端类型中心标签的双击重命名（与右侧终端面板同语义，复用 terminalUpdateTab）。
  // editingTabId 存的是底层终端标签 id（tab.refId），非中心标签 id。
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const handleEditSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      terminalUpdateTab(editingTabId, { title: editValue.trim() });
    }
    setEditingTabId(null);
    setEditValue('');
  }, [editingTabId, editValue, terminalUpdateTab]);

  const handleEditKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        handleEditSubmit();
      } else if (event.key === 'Escape') {
        setEditingTabId(null);
        setEditValue('');
      }
    },
    [handleEditSubmit],
  );

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollLeft += event.deltaY;
  }, []);

  const handleClose = useCallback(
    (tab: CenterTabState) => {
      if (tab.kind === 'browser' && tab.refId) {
        const browserTab = browserTabsById[tab.refId];
        if (browserTab?.isDsh) {
          // dsh 承载标签关闭即终止进程（closeDsh 失败已记卡，此处 catch 仅防未处理 rejection）。
          // 与 browserCloseTab/destroyTab 无重复清理：closeDsh 只停进程，WebView 销毁
          // 归下行的 browserPool.destroyTab，store 状态归 browserCloseTab。
          void useAppStore
            .getState()
            .closeDsh(false)
            .catch((e) => console.warn('[center] closeDsh on tab close failed:', e));
        }
        browserCloseTab(tab.refId);
        // browserCloseTab 只删 store 状态：中心路径不走面板关闭 wrapper，必须显式回收
        // 共享池条目与原生 WebView2，否则该 tabId 的 WebView 永久存活且无法再被回收。
        void browserPool.destroyTab(tab.refId).catch((e) => {
          console.warn('[center] browserPool.destroyTab failed:', e);
        });
        if (browserTab?.url) {
          removeSiteMetaIfUnreferenced(browserTab.url);
        }
      } else if (tab.kind === 'terminal' && tab.refId) {
        terminalPtyRuntime.handleCloseTab(tab.refId);
      }
      centerRemoveTab(tab.id);
    },
    [browserTabsById, browserCloseTab, centerRemoveTab],
  );

  const handleAdd = useCallback(() => {
    centerAddTab('launcher', null);
  }, [centerAddTab]);

  return (
    <div className="adl-center-tab-strip">
      <div
        ref={scrollRef}
        className="adl-center-tab-strip__scroll"
        role="tablist"
        aria-label={t.centerTabStripLabel}
        data-tauri-drag-region
        onWheel={handleWheel}
      >
        {centerTabs.map((tab) => {
          const isActive = tab.id === centerActiveTabId;
          const browserTab =
            tab.kind === 'browser' && tab.refId ? browserTabsById[tab.refId] : null;
          const terminalTab =
            tab.kind === 'terminal' && tab.refId ? terminalTabsById[tab.refId] : null;

          let label: string;
          let icon: React.ReactNode;
          if (tab.kind === 'browser') {
            label = browserTab?.titleResolved ? browserTab.title : t.newTabPage;
            icon = <BrowserFavicon url={browserTab?.url ?? ''} />;
          } else if (tab.kind === 'terminal') {
            label = terminalTab?.title || t.terminalNewTerminal;
            icon = terminalTab ? (
              <TerminalProfileIcon profile={terminalTab.profile} />
            ) : (
              <IconTerminal size={14} decorative />
            );
          } else {
            label = t.centerNewTab;
            icon = <IconNewTabPage size={14} decorative />;
          }

          const showInPanelLabel =
            tab.kind === 'browser' ? t.centerTabShowInBrowserPanel : t.centerTabShowInTerminalPanel;
          const isEditing =
            tab.kind === 'terminal' && tab.refId !== null && editingTabId === tab.refId;
          const actionCount = tab.kind !== 'launcher' && tab.refId !== null ? 2 : 1;

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              data-actions={actionCount}
              className={`adl-center-tab adl-clip-tab${isActive ? ' is-active' : ''}`}
              onClick={() => centerSelectTab(tab.id)}
              onDoubleClick={() => {
                if (tab.kind === 'terminal' && tab.refId) {
                  setEditValue(terminalTab?.title || '');
                  setEditingTabId(tab.refId);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  centerSelectTab(tab.id);
                }
              }}
            >
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onBlur={handleEditSubmit}
                  onKeyDown={handleEditKeyDown}
                  className="adl-center-tab__edit"
                  aria-label={t.rename}
                />
              ) : (
                <>
                  <span className="adl-center-tab__icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="adl-center-tab__label adl-clip-tab__label">{label}</span>
                  <span className="adl-center-tab__actions adl-clip-tab__actions">
                    {tab.kind !== 'launcher' && tab.refId !== null && (
                      <TooltipSimple content={showInPanelLabel} placement="bottom">
                        <button
                          type="button"
                          className="adl-icon-btn adl-icon-btn--xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            centerReturnToPanel(tab.id);
                          }}
                          aria-label={showInPanelLabel}
                        >
                          <IconPanelRight size={12} decorative />
                        </button>
                      </TooltipSimple>
                    )}
                    <TooltipSimple content={t.close} placement="bottom">
                      <button
                        type="button"
                        className="adl-icon-btn adl-icon-btn--xs adl-icon-btn--danger-hover"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleClose(tab);
                        }}
                        aria-label={t.close}
                      >
                        <IconClose size={12} decorative />
                      </button>
                    </TooltipSimple>
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="adl-center-tab-strip__add">
        <TooltipSimple content={t.centerNewTab} placement="bottom">
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs"
            onClick={handleAdd}
            aria-label={t.centerNewTab}
          >
            <IconPlus size={14} decorative />
          </button>
        </TooltipSimple>
      </div>
    </div>
  );
});
