import React from 'react';
import { useGithubTreeData } from './useGithubTreeData';
import { GitHubCategorySection, type SectionCallbacks } from './GitHubCategorySection';
import { CustomScrollArea } from '../file-tree/CustomScrollArea';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type {
  GitWorkspaceCiConfig,
  GitHubCiFolderState,
} from '../../stores/slices/communicateSlice';

interface GitHubTreeProps {
  workspaces: RecentWorkspaceEntry[];
  gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>;
  gitHubCiFolders: GitHubCiFolderState[];
  gitHubTreeExpanded: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
  labels: {
    ciWorkspaceCategory: string;
    userFolderCategory: string;
  };
  gitHubViewMode: 'tree' | 'list';
}

export function GitHubTree({
  workspaces,
  gitHubWorkspaceConfigs,
  gitHubCiFolders,
  gitHubTreeExpanded,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
  labels,
  gitHubViewMode,
}: GitHubTreeProps) {
  const { ciWorkspaceCategory, userFolderCategory } = useGithubTreeData(
    workspaces,
    gitHubWorkspaceConfigs,
    gitHubCiFolders,
    labels
  );

  if (gitHubViewMode === 'list') {
    return (
      <div
        className="adl-multitree adl-multitree--github"
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span className="adl-empty-hint">目录列表</span>
      </div>
    );
  }

  return (
    <CustomScrollArea
      shellClassName="adl-multitree adl-multitree--github"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <GitHubCategorySection
        category={ciWorkspaceCategory}
        categoryType="ci-workspace"
        expandedPaths={gitHubTreeExpanded}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onTogglePath={onTogglePath}
        callbacks={callbacks}
      />
      <GitHubCategorySection
        category={userFolderCategory}
        categoryType="user-folder"
        expandedPaths={gitHubTreeExpanded}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onTogglePath={onTogglePath}
        callbacks={callbacks}
      />
    </CustomScrollArea>
  );
}
