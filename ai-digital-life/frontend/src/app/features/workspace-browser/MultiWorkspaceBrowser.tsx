import React, { useMemo, useCallback } from "react";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import type { BrowserTabState, TabFolderState, BrowserHistoryState } from "../../stores/slices/browserSlice";
import { MultiWorkspaceContainer } from "../multi-workspace/MultiWorkspaceContainer";
import { WorkspaceBrowserEntry } from "./WorkspaceBrowserEntry";
import { TabFolderEntry } from "./TabFolderEntry";
import { IconHistory } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";

export interface MultiWorkspaceBrowserProps {
  workspaces: RecentWorkspaceEntry[];
  tabFolders: TabFolderState[];
  browserHistory?: BrowserHistoryState[];
  expandedStates: Record<string, boolean>;
  browserTabs: BrowserTabState[];
  activeTabId: string | undefined;
  onToggleExpand: (id: string) => void;
  onCreateTab: (workspaceId: string) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree?: () => void;
  onCloseAllTabs?: (workspaceId: string) => void;
  onDeleteTabFolder: (folderId: string) => void;
  onRenameTabFolder?: (folderId: string, newName: string) => void;
  onOpenHistoryItem?: (url: string, title: string) => void;
  t: CopyDict;
  editingTabId?: string | null;
  editValue?: string;
  editInputRef?: React.RefObject<HTMLInputElement | null>;
  isDragging?: boolean;
  dragOverTabId?: string | null;
  onDragStart?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDrop?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onTabContextMenu?: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  onTabDoubleClick?: (tabId: string, title: string) => void;
  onEditChange?: (value: string) => void;
  onEditSubmit?: () => void;
  onEditKeyDown?: (e: React.KeyboardEvent) => void;
}

const INDEPENDENT_WORKSPACE_ID = "__independent__";

// 从 URL 中提取友好的网站名称
function getDisplayTitle(title: string, url: string): string {
  // 如果有标题且标题不是 URL 本身，使用标题
  if (title && title.trim() && title !== url) {
    // 检查标题是否只是 URL 或 IP 地址
    try {
      new URL(title);
      // 如果标题是有效的 URL，继续处理
    } catch {
      // 不是 URL，直接返回标题
      return title;
    }
  }

  // 尝试从 URL 中提取有用信息
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname.replace(/^www\./, "");
    
    // 常见域名前缀映射为更友好的名称
    const domainMap: Record<string, string> = {
      "github.com": "GitHub",
      "gitlab.com": "GitLab",
      "stackoverflow.com": "Stack Overflow",
      "google.com": "Google",
      "google.cn": "Google",
      "bing.com": "Bing",
      "baidu.com": "百度",
      "youtube.com": "YouTube",
      "twitter.com": "Twitter",
      "x.com": "X (Twitter)",
      "facebook.com": "Facebook",
      "instagram.com": "Instagram",
      "linkedin.com": "LinkedIn",
      "amazon.com": "Amazon",
      "taobao.com": "淘宝",
      "jd.com": "京东",
      "tmall.com": "天猫",
      "zhihu.com": "知乎",
      "bilibili.com": "哔哩哔哩",
      "douyin.com": "抖音",
      "weibo.com": "微博",
      "qq.com": "腾讯",
      "163.com": "网易",
      "sina.com.cn": "新浪",
      "csdn.net": "CSDN",
      "juejin.cn": "掘金",
      "zhubai.love": "竹白",
      "rust-lang.org": "Rust 官网",
      "react.dev": "React 官网",
      "vuejs.org": "Vue.js 官网",
      "npmjs.com": "npm",
      "deno.com": "Deno",
      "vitejs.dev": "Vite",
      "tailwindcss.com": "Tailwind CSS",
      "figma.com": "Figma",
      "docs.github.com": "GitHub 文档"
    };
    
    // 检查是否有精确匹配的域名
    if (domainMap[hostname]) {
      return domainMap[hostname];
    }
    
    // 检查是否有子域名匹配
    for (const [domain, name] of Object.entries(domainMap)) {
      if (hostname.endsWith(domain)) {
        return name;
      }
    }
    
    // 如果没有匹配，提取域名的主要部分（第一个点之前的部分）
    const parts = hostname.split('.');
    if (parts.length > 2) {
      // 对于像 subdomain.example.com 这样的域名，取主域名
      return parts.slice(-2).join('.');
    }
    
    return hostname;
  } catch {
    // URL 解析失败，返回原始值
    return url;
  }
}

// 从 URL 获取 favicon
function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return "";
  }
}

function HistoryEntry({ 
  item, 
  onClick 
}: { 
  item: BrowserHistoryState; 
  onClick: (url: string, title: string) => void; 
}) {
  // 简化显示的标题 - 使用更好的提取逻辑
  const displayTitle = getDisplayTitle(item.title, item.url);

  return (
    <div 
      className="adl-browser-history-entry"
      onClick={() => onClick(item.url, item.title)}
    >
      <div className="adl-browser-history-entry__icon">
        {getFaviconUrl(item.url) ? (
          <img 
            src={getFaviconUrl(item.url)}
            alt=""
            className="adl-tool-list__favicon"
          />
        ) : (
          <IconHistory size={12} decorative />
        )}
      </div>
      <div className="adl-browser-history-entry__content">
        <div className="adl-browser-history-entry__title" title={item.title || item.url}>
          {displayTitle}
        </div>
      </div>
    </div>
  );
}

export function MultiWorkspaceBrowser({
  workspaces,
  tabFolders,
  browserHistory = [],
  expandedStates,
  browserTabs,
  activeTabId,
  onToggleExpand,
  onCreateTab,
  onSelectTab,
  onCloseTab,
  onTogglePin,
  onHideFromRightPanels,
  onRefreshTree,
  onCloseAllTabs,
  onDeleteTabFolder,
  onRenameTabFolder,
  onOpenHistoryItem,
  t,
  editingTabId = null,
  editValue = "",
  editInputRef = { current: null },
  isDragging = false,
  dragOverTabId = null,
  onDragStart = () => {},
  onDragEnd = () => {},
  onDragOver = () => {},
  onDrop = () => {},
  onTabContextMenu = () => {},
  onTabDoubleClick = () => {},
  onEditChange = () => {},
  onEditSubmit = () => {},
  onEditKeyDown = () => {},
}: MultiWorkspaceBrowserProps) {
  const tabsByWorkspace = useMemo(() => {
    const map: Record<string, BrowserTabState[]> = {};
    for (const tab of browserTabs) {
      const key = tab.workspaceId || INDEPENDENT_WORKSPACE_ID;
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(tab);
    }
    return map;
  }, [browserTabs]);

  const tabsById = useMemo(() => {
    const map: Record<string, BrowserTabState> = {};
    for (const tab of browserTabs) {
      map[tab.id] = tab;
    }
    return map;
  }, [browserTabs]);

  const getTabsForFolder = useCallback((folder: TabFolderState) => {
    if (!folder.tabs) return [];
    return folder.tabs
      .map(tabId => tabsById[tabId])
      .filter(Boolean) as BrowserTabState[];
  }, [tabsById]);

  const hasNoWorkspaces = workspaces.length === 0;
  const hasNoFolders = tabFolders.length === 0;
  const hasNoHistory = browserHistory.length === 0;

  return (
    <div className="adl-multitree adl-multitree--browser">
      {(workspaces.length > 0 || tabFolders.length > 0 || browserHistory.length > 0) && (
        <MultiWorkspaceContainer
          visibleWorkspaces={workspaces}
          expandedState={expandedStates}
          onToggleExpand={onToggleExpand}
          tabFolders={tabFolders}
          browserHistory={browserHistory}
          renderContent={(workspace, isExpanded) => (
            <WorkspaceBrowserEntry
              key={workspace.id}
              workspace={workspace}
              isExpanded={isExpanded}
              tabs={tabsByWorkspace[workspace.id] || []}
              activeTabId={activeTabId}
              tabCount={(tabsByWorkspace[workspace.id] || []).length}
              onToggleExpand={() => onToggleExpand(workspace.id)}
              onCreateTab={() => onCreateTab(workspace.id)}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onTogglePin={onTogglePin}
              onHideFromRightPanels={onHideFromRightPanels}
              onRefreshTree={() => onRefreshTree?.()}
              onCloseAllTabs={() => onCloseAllTabs?.(workspace.id)}
              t={t}
              editingTabId={editingTabId}
              editValue={editValue}
              editInputRef={editInputRef}
              isDragging={isDragging}
              dragOverTabId={dragOverTabId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onTabContextMenu={onTabContextMenu}
              onTabDoubleClick={onTabDoubleClick}
              onEditChange={onEditChange}
              onEditSubmit={onEditSubmit}
              onEditKeyDown={onEditKeyDown}
            />
          )}
          renderTabFolderContent={(folder, isExpanded) => (
            <TabFolderEntry
              key={folder.id}
              folder={folder}
              tabs={getTabsForFolder(folder)}
              isExpanded={isExpanded}
              onToggleExpand={() => onToggleExpand(folder.id)}
              onCreateTab={() => onCreateTab("")}
              onDeleteFolder={() => onDeleteTabFolder(folder.id)}
              onDeleteAllFolderTabs={() => {}}
              onRenameFolder={(newName) => onRenameTabFolder?.(folder.id, newName)}
              activeTabId={activeTabId}
              editingTabId={editingTabId}
              editValue={editValue}
              editInputRef={editInputRef}
              isDragging={isDragging}
              dragOverTabId={dragOverTabId}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onTogglePin={onTogglePin}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onTabContextMenu={onTabContextMenu}
              onTabDoubleClick={onTabDoubleClick}
              onEditChange={onEditChange}
              onEditSubmit={onEditSubmit}
              onEditKeyDown={onEditKeyDown}
              t={t}
            />
          )}
          renderHistoryContent={(item) => (
            <HistoryEntry 
              key={item.id} 
              item={item} 
              onClick={onOpenHistoryItem || (() => {})} 
            />
          )}
        />
      )}
      {hasNoWorkspaces && hasNoFolders && hasNoHistory && (
        <div className="adl-multitree__empty">
          <p className="adl-empty-hint">{t.workspaceEmpty as string}</p>
        </div>
      )}
    </div>
  );
}
