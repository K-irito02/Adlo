import { GitHubTreeEntry } from './GitHubTreeEntry';
import type { GitHubCategoryState, GitHubCategoryType } from './types';

export interface SectionCallbacks {
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectSection: (
    workspaceId: string,
    section: 'overview' | 'workflows' | 'jobs' | 'logs',
  ) => void;
  onDeleteWorkspaceConfig: (workspaceId: string) => void;
  onOpenSettings: (workspaceId: string) => void;
  onOpenFolderSettings: (folderId: string) => void;
  onRefreshWorkspace: (workspaceId: string) => void;
  onDeleteFolderConfig: (folderId: string) => void;
  onClearCiState: () => void;
}

interface GitHubCategorySectionProps {
  category: GitHubCategoryState;
  categoryType: GitHubCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
}

export function GitHubCategorySection({
  category,
  categoryType,
  expandedPaths,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
}: GitHubCategorySectionProps) {
  const topLevelCount = category.nodes.length;

  return (
    <div className="adl-github-category">
      <div className="adl-github-category__label">
        <span className="adl-github-category__label-text">{category.label}</span>
        <span className="adl-github-category__label-count">{topLevelCount}</span>
      </div>
      <div className="adl-github-category__entries">
        {category.nodes.map((node) => (
          <GitHubTreeEntry
            key={node.path}
            node={node}
            categoryType={categoryType}
            expandedPaths={expandedPaths}
            selectedTreePath={selectedTreePath}
            onSelectTreePath={onSelectTreePath}
            onTogglePath={onTogglePath}
            callbacks={callbacks}
          />
        ))}
      </div>
    </div>
  );
}
