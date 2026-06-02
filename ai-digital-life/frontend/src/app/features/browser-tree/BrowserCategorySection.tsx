import React, { useCallback } from "react";
import { BrowserTreeEntry } from "./BrowserTreeEntry";
import type { BrowserCategoryState, BrowserCategoryType, BrowserTreeNode } from "./types";

export interface SectionCallbacks {
  onCreateTab: (workspaceId?: string, folderId?: string) => void;
  onDeleteAllChildTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onRenameDirectory: (folderId: string) => void;
  onDeleteHistory: (level: "label" | "year" | "month" | "day", nodePath: string) => void;
  onOpenTab: (url: string, tabId?: string) => void;
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
}: BrowserCategorySectionProps) {
  const handleOpenFile = useCallback(
    (path: string) => onOpenFile(path),
    [onOpenFile],
  );

  const totalCount = category.nodes.reduce((sum, n) => sum + countLeaves(n), 0);

  return (
    <div className="adl-browser-category">
      <div className="adl-browser-category__label">
        <span className="adl-browser-category__label-text">{category.label}</span>
        <span className="adl-browser-category__label-count">{totalCount}</span>
      </div>
      {(categoryType === "workspace" || categoryType === "history") && (
        <div className="adl-browser-category__spacer" />
      )}
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
          />
        ))}
      </div>
    </div>
  );
}

function countLeaves(node: BrowserTreeNode): number {
  if (node.kind === "file") return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}
