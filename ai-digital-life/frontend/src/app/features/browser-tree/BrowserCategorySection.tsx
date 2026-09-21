import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { BrowserTreeEntry } from './BrowserTreeEntry';
import type { BrowserCategoryState, BrowserCategoryType } from './types';

export interface SectionCallbacks {
  onCreateTab: (workspaceId?: string, folderId?: string) => void;
  onDeleteAllChildTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onDeleteOwnChildTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onRenameDirectory: (folderId: string) => void;
  onDeleteHistory: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  onOpenTab: (url: string, tabId?: string) => void;
  // Tab-level operations (for tab leaf nodes in workspace/userFolder trees)
  onRefreshTab: (tabId: string, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title?: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  /** Remove bookmark state without closing the tab. Used for saved-bookmark entries. */
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
}

interface BrowserCategorySectionProps {
  category: BrowserCategoryState;
  categoryType: BrowserCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  onOpenFile: (path: string) => void;
  callbacks: SectionCallbacks;
  counts: Map<string, number>;
  browserViewMode?: 'tree' | 'list' | 'all';
  filterTabIds?: Set<string>;
}

export function BrowserCategorySection({
  category,
  categoryType,
  expandedPaths,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  onOpenFile,
  callbacks,
  counts,
  browserViewMode,
  filterTabIds,
}: BrowserCategorySectionProps) {
  const handleOpenFile = useCallback((path: string) => onOpenFile(path), [onOpenFile]);

  // 大类折叠（Task 24）：展开态由 store 记录驱动（`adl:browser.categoryExpanded`），
  // 收起时只渲染标题行、条目区隐藏。标题行 chevron 即开关（aria 展开态 + 收起/展开文案）。
  const { t } = useTCopy();
  const isExpanded = category.isExpanded;
  const setBrowserCategoryExpanded = useAppStore((s) => s.setBrowserCategoryExpanded);
  const handleToggleCategory = useCallback(() => {
    setBrowserCategoryExpanded(category.id, !isExpanded);
  }, [setBrowserCategoryExpanded, category.id, isExpanded]);

  const topLevelCount = category.nodes.length;

  return (
    <div className="adl-browser-category">
      <div className="adl-browser-category__label">
        <button
          type="button"
          className="adl-browser-category__label-action"
          onClick={handleToggleCategory}
          aria-expanded={isExpanded}
          aria-label={(isExpanded ? t.browserCollapse : t.browserExpand) as string}
          title={(isExpanded ? t.browserCollapse : t.browserExpand) as string}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
          >
            <path
              d="M4.5 2.5 7.5 6l-3 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="adl-browser-category__label-text">{category.label}</span>
        <span className="adl-browser-category__label-count">{topLevelCount}</span>
      </div>
      {(categoryType === 'workspace' || categoryType === 'history') && (
        <div className="adl-browser-category__spacer" />
      )}
      {isExpanded && (
        <div className="adl-browser-category__entries">
          {category.nodes.map((node) => (
            <BrowserTreeEntry
              key={node.path}
              node={node}
              categoryType={categoryType}
              expandedPaths={expandedPaths}
              selectedTreePath={selectedTreePath}
              onSelectTreePath={onSelectTreePath}
              onTogglePath={onTogglePath}
              onOpenFile={handleOpenFile}
              callbacks={callbacks}
              counts={counts}
              browserViewMode={browserViewMode}
              filterTabIds={filterTabIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
