import React, { useEffect, useMemo, useState } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconClose,
  IconFileText,
  IconGlobe,
  IconHome,
  IconPanelLeft,
  IconPanelLeftClose,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconStar
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore } from "../../ui-store";
import type { RightPanelViewProps } from "./types";

type BrowserNavigatorMode = "bookmarks" | "history" | "start";

function normalizeBrowserUrl(value: string): string {
  const input = value.trim();
  if (!input) return "about:blank";
  if (/^[a-z]+:\/\//i.test(input) || input === "about:blank") {
    return input;
  }
  return `https://${input}`;
}

export function BrowserPanel({ t }: RightPanelViewProps) {
  const [navigatorMode, setNavigatorMode] = useState<BrowserNavigatorMode>("bookmarks");
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.browser);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const browserTabs = useUiStore((state) => state.browserTabs);
  const browserActiveTabId = useUiStore((state) => state.browserActiveTabId);
  const browserBookmarks = useUiStore((state) => state.browserBookmarks);
  const browserHistory = useUiStore((state) => state.browserHistory);
  const browserOpenTab = useUiStore((state) => state.browserOpenTab);
  const browserSelectTab = useUiStore((state) => state.browserSelectTab);
  const browserCloseTab = useUiStore((state) => state.browserCloseTab);
  const browserNavigateActiveTab = useUiStore((state) => state.browserNavigateActiveTab);
  const browserToggleBookmark = useUiStore((state) => state.browserToggleBookmark);
  const activeTab = useMemo(
    () => browserTabs.find((tab) => tab.id === browserActiveTabId) ?? browserTabs[0],
    [browserActiveTabId, browserTabs]
  );
  const [address, setAddress] = useState(activeTab?.url ?? "about:blank");
  const isBookmarked = browserBookmarks.some((bookmark) => bookmark.url === activeTab?.url);

  useEffect(() => {
    setAddress(activeTab?.url ?? "about:blank");
  }, [activeTab?.url]);

  return (
    <div className="adl-tool-panel adl-tool-panel--browser">
      <div className="adl-tool-context">
        <div className="adl-tool-context__group adl-tool-context__group--grow">
          <TooltipSimple content={t.browserBack} placement="top">
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" disabled>
              <IconArrowLeft size={12} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserForward} placement="top">
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" disabled>
              <IconArrowRight size={12} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserRefresh} placement="top">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={() => browserNavigateActiveTab(activeTab?.url ?? "about:blank", activeTab?.title)}
            >
              <IconRefreshCw size={12} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserHome} placement="top">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={() => browserNavigateActiveTab("about:blank", "Start Page")}
            >
              <IconHome size={12} decorative />
            </button>
          </TooltipSimple>
          <label className="adl-tool-search adl-tool-search--address">
            <IconGlobe size={12} decorative />
            <input
              type="search"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  browserNavigateActiveTab(normalizeBrowserUrl(address));
                }
              }}
              placeholder={t.browserAddress}
              aria-label={t.browserAddress}
            />
          </label>
        </div>
        <div className="adl-tool-context__group">
          <TooltipSimple content={t.browserBookmarks} placement="top">
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={() => browserToggleBookmark()}>
              <IconStar size={12} decorative className={isBookmarked ? "is-bookmarked" : undefined} />
            </button>
          </TooltipSimple>
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={() => browserOpenTab()}>
            <IconPlus size={12} decorative />
            <span>{t.browserNewTab}</span>
          </button>
        </div>
      </div>

      <div className={`adl-tool-surface${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}>
        <aside className="adl-tool-rail" aria-label={`${t.toolBrowser} rail`}>
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="right">
            <button type="button" className="adl-tool-rail__btn" onClick={() => toggleNavigator("browser")}>
              {navigatorCollapsed ? <IconPanelLeft size={14} decorative /> : <IconPanelLeftClose size={14} decorative />}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserBookmarks} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "bookmarks" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("bookmarks")}
            >
              <IconStar size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserHistory} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "history" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("history")}
            >
              <IconFileText size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserStartPage} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "start" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("start")}
            >
              <IconSearch size={14} decorative />
            </button>
          </TooltipSimple>
        </aside>

        <aside className="adl-tool-navigator" aria-label={t.toolBrowser}>
          <header className="adl-tool-navigator__header">
            <strong>
              {navigatorMode === "bookmarks" ? t.browserBookmarks : navigatorMode === "history" ? t.browserHistory : t.browserStartPage}
            </strong>
            <span className="adl-tool-navigator__meta">
              {navigatorMode === "bookmarks"
                ? browserBookmarks.length
                : navigatorMode === "history"
                  ? browserHistory.length
                  : browserTabs.length}
            </span>
          </header>

          {navigatorMode === "bookmarks" ? (
            browserBookmarks.length ? (
              <ul className="adl-tool-list">
                {browserBookmarks.map((bookmark) => (
                  <li key={bookmark.url}>
                    <button
                      type="button"
                      className="adl-tool-list__item"
                      onClick={() => browserNavigateActiveTab(bookmark.url, bookmark.title)}
                    >
                      <span className="adl-tool-list__title">{bookmark.title}</span>
                      <small>{bookmark.url}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adl-empty-hint">{t.browserNoBookmarks}</p>
            )
          ) : null}

          {navigatorMode === "history" ? (
            browserHistory.length ? (
              <ul className="adl-tool-list">
                {browserHistory.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="adl-tool-list__item"
                      onClick={() => browserNavigateActiveTab(entry.url, entry.title)}
                    >
                      <span className="adl-tool-list__title">{entry.title}</span>
                      <small>{entry.url}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adl-empty-hint">{t.browserNoHistory}</p>
            )
          ) : null}

          {navigatorMode === "start" ? (
            <div className="adl-startpage-list">
              <button type="button" className="adl-startpage-card" onClick={() => browserNavigateActiveTab("http://localhost:5173/", t.browserLocalPreview)}>
                <strong>{t.browserLocalPreview}</strong>
                <span>http://localhost:5173/</span>
              </button>
              <button type="button" className="adl-startpage-card" onClick={() => browserNavigateActiveTab("about:blank", t.browserStartPage)}>
                <strong>{t.browserBlankTab}</strong>
                <span>{t.browserCleanShellPage}</span>
              </button>
            </div>
          ) : null}
        </aside>

        <div className="adl-tool-primary">
          <div className="adl-tool-primary__tabs adl-tool-primary__tabs--browser">
            {browserTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === browserActiveTabId ? "is-active" : ""}
                onClick={() => browserSelectTab(tab.id)}
              >
                <IconGlobe size={12} decorative />
                <span>{tab.title}</span>
                {browserTabs.length > 1 ? (
                  <span
                    className="adl-tool-primary__tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      browserCloseTab(tab.id);
                    }}
                  >
                    <IconClose size={12} decorative />
                  </span>
                ) : null}
              </button>
            ))}
            <div className="adl-tool-primary__tabs-spacer" />
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={() => browserOpenTab()}>
              <IconPlus size={12} decorative />
            </button>
          </div>

          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser">
            {activeTab?.url === "about:blank" ? (
              <div className="adl-browser-welcome">
                <h3>{t.browserStartPage}</h3>
                <p>{t.browserEmpty}</p>
                <div className="adl-browser-welcome__cards">
                  <button type="button" className="adl-browser-card" onClick={() => browserNavigateActiveTab("http://localhost:5173/", t.browserLocalPreview)}>
                    <strong>{t.browserOpenLocalPreview}</strong>
                    <span>{t.browserReviewInContext}</span>
                  </button>
                  <button type="button" className="adl-browser-card" onClick={() => browserNavigateActiveTab("https://github.com", "GitHub")}>
                    <strong>{t.browserOpenGithub}</strong>
                    <span>{t.browserSavedLocalShell}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="adl-browser-preview">
                <div className="adl-browser-preview__header">
                  <span className="adl-chip adl-chip--info">{t.browserShellPreview}</span>
                  <strong>{activeTab?.title}</strong>
                </div>
                <p>{activeTab?.url}</p>
                <p className="adl-empty-hint">{t.browserShellPending}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
