import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconFileText,
  IconLink,
  IconMoreVertical,
  IconPanelLeftClose,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconStar
} from "../../../icons";
import { TooltipSimple } from "../../../components/Tooltip";
import { useUiStore } from "../../../ui-store";
import { useNavigatorResize } from "../../../hooks/useNavigatorResize";
import type { RightPanelViewProps } from "../types";

type BrowserNavigatorMode = "bookmarks" | "history" | "search";
type BrowserSearchScope = "bookmarks" | "history" | "all";

type BrowserLookupItem = {
  title: string;
  url: string;
};

function normalizeBrowserUrl(value: string): string {
  const input = value.trim();
  if (!input) return "about:blank";
  if (/^[a-z]+:\/\//i.test(input) || input === "about:blank") {
    return input;
  }
  return `https://${input}`;
}

function looksLikeUrl(value: string): boolean {
  return /^(about:|[a-z]+:\/\/)/i.test(value) || /[./:]/.test(value);
}

function filterBrowserItems<T extends BrowserLookupItem>(items: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }
  return items.filter((item) => {
    const title = item.title.toLowerCase();
    const url = item.url.toLowerCase();
    return title.includes(normalizedQuery) || url.includes(normalizedQuery);
  });
}

export function BrowserPanel({ t }: RightPanelViewProps) {
  const [navigatorMode, setNavigatorMode] = useState<BrowserNavigatorMode>("bookmarks");
  const [browserMenuOpen, setBrowserMenuOpen] = useState(false);
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [navigatorQuery, setNavigatorQuery] = useState("");
  const [searchScope, setSearchScope] = useState<BrowserSearchScope>("all");
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.browser);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const browserNavigatorWidth = useUiStore((state) => state.browserNavigatorWidth);
  const setBrowserNavigatorWidth = useUiStore((state) => state.setBrowserNavigatorWidth);
  const browserTabs = useUiStore((state) => state.browserTabs);
  const browserActiveTabId = useUiStore((state) => state.browserActiveTabId);
  const browserBookmarks = useUiStore((state) => state.browserBookmarks);
  const browserHistory = useUiStore((state) => state.browserHistory);
  const browserOpenTab = useUiStore((state) => state.browserOpenTab);
  const browserNavigateActiveTab = useUiStore((state) => state.browserNavigateActiveTab);
  const browserToggleBookmark = useUiStore((state) => state.browserToggleBookmark);
  const browserClearHistory = useUiStore((state) => state.browserClearHistory);
  const browserMenuRef = useRef<HTMLDivElement | null>(null);
  const addressSearchRef = useRef<HTMLLabelElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const navigatorSearchRef = useRef<HTMLDivElement | null>(null);
  const navigatorSearchInputRef = useRef<HTMLInputElement | null>(null);
  const activeTab = useMemo(
    () => browserTabs.find((tab) => tab.id === browserActiveTabId) ?? browserTabs[0],
    [browserActiveTabId, browserTabs]
  );
  const [address, setAddress] = useState(activeTab?.url ?? "about:blank");
  const isBookmarked = browserBookmarks.some((bookmark) => bookmark.url === activeTab?.url);
  const navigatorTitle =
    navigatorMode === "bookmarks"
      ? t.browserSavedTabs
      : navigatorMode === "history"
        ? t.browserHistoryTabs
        : t.browserSearchTabs;
  const navigatorItemsCount =
    navigatorMode === "bookmarks" ? browserBookmarks.length : navigatorMode === "history" ? browserHistory.length : 0;
  const quickLinks = useMemo(
    () => [
      { title: t.browserLocalPreview, url: "http://localhost:5173/" },
      { title: t.browserBlankTab, url: "about:blank" }
    ],
    [t.browserBlankTab, t.browserLocalPreview]
  );
  const browserLookupIndex = useMemo(() => {
    const seen = new Set<string>();
    return [...quickLinks, ...browserBookmarks, ...browserHistory, ...browserTabs].filter((item) => {
      const key = `${item.title}::${item.url}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [browserBookmarks, browserHistory, browserTabs, quickLinks]);
  const filteredBookmarks = useMemo(() => filterBrowserItems(browserBookmarks, navigatorQuery), [browserBookmarks, navigatorQuery]);
  const filteredHistory = useMemo(() => filterBrowserItems(browserHistory, navigatorQuery), [browserHistory, navigatorQuery]);
  const searchResults = useMemo(() => {
    if (searchScope === "bookmarks") {
      return filteredBookmarks.map((item) => ({ ...item, source: t.browserSavedTabs }));
    }
    if (searchScope === "history") {
      return filteredHistory.map((item) => ({ ...item, source: t.browserHistoryTabs }));
    }
    const merged = new Map<string, { title: string; url: string; source: string }>();
    for (const item of filteredBookmarks) {
      merged.set(`bookmark:${item.url}`, { ...item, source: t.browserSavedTabs });
    }
    for (const item of filteredHistory) {
      const key = `history:${item.url}:${item.title}`;
      merged.set(key, { ...item, source: t.browserHistoryTabs });
    }
    return [...merged.values()];
  }, [filteredBookmarks, filteredHistory, searchScope, t.browserHistoryTabs, t.browserSavedTabs]);
  const visibleNavigatorItems =
    navigatorMode === "bookmarks" ? filteredBookmarks : navigatorMode === "history" ? filteredHistory : searchResults;
  const navigatorCount = navigatorMode === "search" ? searchResults.length : navigatorQuery.trim() ? visibleNavigatorItems.length : navigatorItemsCount;
  const browserMenuItems = [
    { id: "hard-reload", label: t.browserHardReload, action: () => browserNavigateActiveTab(activeTab?.url ?? "about:blank", activeTab?.title) },
    { id: "copy-url", label: t.browserCopyCurrentUrl, action: () => void navigator.clipboard?.writeText(activeTab?.url ?? "about:blank") },
    { id: "sep-1", separator: true },
    { id: "clear-history", label: t.browserClearHistory, action: browserClearHistory },
    { id: "clear-cookies", label: t.browserClearCookies, disabled: true },
    { id: "clear-cache", label: t.browserClearCache, disabled: true },
    { id: "devtools", label: t.browserDeveloperTools, disabled: true },
    { id: "sep-2", separator: true },
    { id: "zoom-in", label: t.menuZoomIn, disabled: true },
    { id: "zoom-out", label: t.menuZoomOut, disabled: true },
    { id: "zoom-reset", label: t.menuResetZoom, disabled: true }
  ];

  useEffect(() => {
    setAddress(activeTab?.url ?? "about:blank");
  }, [activeTab?.url]);

  useEffect(() => {
    if (!browserMenuOpen && !addressExpanded && navigatorMode !== "search") {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!browserMenuRef.current?.contains(target)) {
        setBrowserMenuOpen(false);
      }
      if (!addressSearchRef.current?.contains(target)) {
        setAddressExpanded(false);
      }
      if (navigatorMode === "search" && !navigatorSearchRef.current?.contains(target)) {
        setNavigatorMode("bookmarks");
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [addressExpanded, browserMenuOpen, navigatorMode]);

  useEffect(() => {
    if (addressExpanded) {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }
  }, [addressExpanded]);

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setBrowserNavigatorWidth,
    minWidth: 180,
    maxWidth: 300
  });

  useEffect(() => {
    if (navigatorMode === "search") {
      navigatorSearchInputRef.current?.focus();
      navigatorSearchInputRef.current?.select();
    }
  }, [navigatorMode]);

  const collapseAddress = () => {
    addressInputRef.current?.blur();
    setAddressExpanded(false);
  };

  const submitAddress = () => {
    const input = address.trim();
    if (!input) {
      browserNavigateActiveTab("about:blank", t.browserStartPage);
      return;
    }
    const normalizedInput = input.toLowerCase();
    const matchedItem =
      browserLookupIndex.find((item) => item.title.toLowerCase() === normalizedInput || item.url.toLowerCase() === normalizedInput) ??
      (!looksLikeUrl(input)
        ? browserLookupIndex.find((item) => item.title.toLowerCase().includes(normalizedInput) || item.url.toLowerCase().includes(normalizedInput))
        : undefined);
    if (matchedItem) {
      browserNavigateActiveTab(matchedItem.url, matchedItem.title);
      setAddress(matchedItem.url);
      return;
    }
    browserNavigateActiveTab(normalizeBrowserUrl(input));
  };

  return (
    <div className="adl-tool-panel adl-tool-panel--browser">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolBrowser}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => toggleNavigator("browser")}
              aria-label={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft}
            >
              <IconPanelLeftClose size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserBack} placement="top">
            <button type="button" className="adl-tool-context__iconbtn" disabled aria-label={t.browserBack}>
              <IconArrowLeft size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserForward} placement="top">
            <button type="button" className="adl-tool-context__iconbtn" disabled aria-label={t.browserForward}>
              <IconArrowRight size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserRefresh} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => browserNavigateActiveTab(activeTab?.url ?? "about:blank", activeTab?.title)}
              aria-label={t.browserRefresh}
            >
              <IconRefreshCw size={14} decorative />
            </button>
          </TooltipSimple>
          <label
            ref={addressSearchRef}
            className={`adl-tool-search adl-tool-search--address${addressExpanded ? " is-expanded" : ""}`}
            onClick={() => setAddressExpanded(true)}
            onMouseEnter={() => setAddressExpanded(true)}
            onMouseLeave={collapseAddress}
          >
            <IconLink size={14} decorative className="adl-tool-search__icon adl-tool-search__icon--address" />
            <span className="adl-tool-search__preview" aria-hidden={addressExpanded}>
              {address.trim()}
            </span>
            <input
              ref={addressInputRef}
              type="search"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitAddress();
                }
              }}
              onBlur={() => setAddressExpanded(false)}
              placeholder={t.browserAddress}
              aria-label={t.browserAddress}
            />
          </label>
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TooltipSimple content={t.browserSavedTabs} placement="top">
            <button type="button" className="adl-tool-context__iconbtn" onClick={() => browserToggleBookmark()} aria-label={t.browserSavedTabs}>
              <IconStar size={14} decorative className={isBookmarked ? "is-bookmarked" : undefined} />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserNewTab} placement="top">
            <button type="button" className="adl-tool-context__iconbtn" onClick={() => browserOpenTab()} aria-label={t.browserNewTab}>
              <IconPlus size={14} decorative />
            </button>
          </TooltipSimple>
          <div ref={browserMenuRef} className="adl-menu adl-file-context__menu">
            <TooltipSimple content={t.browserMoreActions} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn${browserMenuOpen ? " is-open" : ""}`}
                onClick={() => setBrowserMenuOpen((value) => !value)}
                aria-label={t.browserMoreActions}
                aria-haspopup="menu"
                aria-expanded={browserMenuOpen}
              >
                <IconMoreVertical size={14} decorative />
              </button>
            </TooltipSimple>
            {browserMenuOpen ? (
              <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
                {browserMenuItems.map((item) =>
                  "separator" in item ? (
                    <div key={item.id} className="adl-menu__sep" role="separator" />
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className="adl-menu__item"
                      disabled={item.disabled}
                      onClick={() => {
                        item.action?.();
                        setBrowserMenuOpen(false);
                      }}
                    >
                      <span>{item.label}</span>
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}
        style={{ "--adl-files-nav-width": `${browserNavigatorWidth}px` } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator" aria-label={t.toolBrowser}>
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <span className="adl-tool-navigator__context-title">{navigatorTitle}</span>
            </div>
            <span className="adl-tool-navigator__meta">{navigatorCount}</span>
          </div>
          <div className="adl-tool-navigator__context adl-tool-navigator__context--tabs">
            <TooltipSimple content={t.browserSavedTabs} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === "bookmarks" ? " is-active" : ""}`}
                onClick={() => setNavigatorMode("bookmarks")}
                aria-label={t.browserSavedTabs}
              >
                <IconStar size={14} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content={t.browserHistoryTabs} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === "history" ? " is-active" : ""}`}
                onClick={() => setNavigatorMode("history")}
                aria-label={t.browserHistoryTabs}
              >
                <IconFileText size={14} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content={t.browserSearchTabs} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === "search" ? " is-active" : ""}`}
                onClick={() => setNavigatorMode("search")}
                aria-label={t.browserSearchTabs}
              >
                <IconSearch size={14} decorative />
              </button>
            </TooltipSimple>
          </div>
          {navigatorMode === "search" ? (
            <div ref={navigatorSearchRef} className="adl-tool-navigator__context adl-tool-navigator__context--search adl-tool-navigator__context--search-stack">
              <div className="adl-tool-search-scope" role="tablist" aria-label={t.browserSearchTabs}>
                <button
                  type="button"
                  className={`adl-tool-search-scope__btn${searchScope === "bookmarks" ? " is-active" : ""}`}
                  onClick={() => setSearchScope("bookmarks")}
                >
                  {t.browserSearchBookmarks}
                </button>
                <button
                  type="button"
                  className={`adl-tool-search-scope__btn${searchScope === "history" ? " is-active" : ""}`}
                  onClick={() => setSearchScope("history")}
                >
                  {t.browserSearchHistory}
                </button>
                <button
                  type="button"
                  className={`adl-tool-search-scope__btn${searchScope === "all" ? " is-active" : ""}`}
                  onClick={() => setSearchScope("all")}
                >
                  {t.browserSearchAll}
                </button>
              </div>
              <label className="adl-tool-search adl-tool-search--compact adl-tool-search--navigator">
                <IconSearch size={12} decorative />
                <input
                  ref={navigatorSearchInputRef}
                  type="search"
                  value={navigatorQuery}
                  onChange={(event) => setNavigatorQuery(event.target.value)}
                  placeholder={t.searchPlaceholder}
                  aria-label={t.search}
                />
              </label>
            </div>
          ) : null}

          {navigatorMode === "bookmarks" ? (
            filteredBookmarks.length ? (
              <ul className="adl-tool-list">
                {filteredBookmarks.map((bookmark) => (
                  <li key={bookmark.url}>
                    <button type="button" className="adl-tool-list__item" onClick={() => browserNavigateActiveTab(bookmark.url, bookmark.title)}>
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
            filteredHistory.length ? (
              <ul className="adl-tool-list">
                {filteredHistory.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="adl-tool-list__item" onClick={() => browserNavigateActiveTab(entry.url, entry.title)}>
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

          {navigatorMode === "search" ? (
            searchResults.length ? (
              <ul className="adl-tool-list">
                {searchResults.map((entry) => (
                  <li key={`${entry.source}:${entry.url}:${entry.title}`}>
                    <button type="button" className="adl-tool-list__item" onClick={() => browserNavigateActiveTab(entry.url, entry.title)}>
                      <span className="adl-tool-list__title">{entry.title}</span>
                      <small>{entry.url}</small>
                      <small className="adl-tool-list__meta">{entry.source}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adl-empty-hint">{t.searchPlaceholder}</p>
            )
          ) : null}
          <div
            className="adl-tool-navigator__resize-handle"
            onPointerDown={handleNavigatorResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize browser navigator"
            aria-valuemin={180}
            aria-valuemax={300}
            aria-valuenow={browserNavigatorWidth}
          />
        </aside>

        <div className="adl-tool-primary adl-tool-primary--browser-empty">
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser">
            <div className="adl-browser-canvas" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}