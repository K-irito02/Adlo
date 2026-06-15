import type { StoreState } from '../StoreState';

/** GitHub tree node types */
export type GitHubTreeNodeType = 'workspace' | 'overview' | 'workflows' | 'jobs' | 'logs';

/** GitHub tree node (for displaying in the navigator) */
export interface GitHubTreeNode {
  path: string;
  name: string;
  kind: 'directory' | 'file';
  children: GitHubTreeNode[];
  nodeType: GitHubTreeNodeType;
  workspaceId?: string;
}

export interface GitHubTreeSlice {
  /** Tree expansion state for GitHub navigator */
  gitHubTreeExpanded: Record<string, boolean>;
  /** Whether the workspace tree is fully expanded */
  gitHubAllTreeExpanded: boolean;
  /** Selected tree path in GitHub navigator */
  selectedGitHubTreePath: string | null;

  setGitHubTreeExpanded: (expanded: Record<string, boolean>) => void;
  toggleGitHubTreePath: (path: string) => void;
  expandAllGitHubTree: () => void;
  collapseAllGitHubTree: () => void;
  setSelectedGitHubTreePath: (path: string | null) => void;
}

export const createGitHubTreeSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubTreeSlice => {
  return {
    gitHubTreeExpanded: {},
    gitHubAllTreeExpanded: false,
    selectedGitHubTreePath: null,

    setGitHubTreeExpanded: (expanded) => set({ gitHubTreeExpanded: expanded }),

    toggleGitHubTreePath: (path) => {
      set((state) => ({
        gitHubTreeExpanded: {
          ...state.gitHubTreeExpanded,
          [path]: !state.gitHubTreeExpanded[path],
        },
      }));
    },

    expandAllGitHubTree: () => {
      set((state) => {
        const paths: Record<string, boolean> = {};
        for (const ws of state.recentWorkspaces) {
          paths[`github-workspace:${ws.id}`] = true;
        }
        const collectFolderPaths = (
          parentId: string | undefined,
          parentType: string | undefined
        ) => {
          const children = state.gitHubCiFolders.filter(
            (f) =>
              f.parentId === parentId &&
              (!f.parentType || f.parentType === parentType || parentType === undefined)
          );
          for (const child of children) {
            paths[`github-folder:${child.id}`] = true;
            collectFolderPaths(child.id, 'folder');
          }
        };
        collectFolderPaths(undefined, undefined);
        return { gitHubTreeExpanded: paths, gitHubAllTreeExpanded: true };
      });
    },

    collapseAllGitHubTree: () => set({ gitHubTreeExpanded: {}, gitHubAllTreeExpanded: false }),

    setSelectedGitHubTreePath: (path) => set({ selectedGitHubTreePath: path }),
  };
};
