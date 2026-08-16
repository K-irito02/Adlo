/**
 * 编辑器切片
 * 管理编辑器标签页、文件内容、大纲等状态
 */
import type { FileOutlineItem, WorkspaceChangePreview } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { EditorTabState } from '@utils/editorTabs';

export interface EditorSlice {
  openTabs: EditorTabState[];
  selectedFilePath?: string;
  selectedFileWorkspaceId?: string;
  selectedChangePreviewPath?: string;
  selectedChangePreviewWorkspaceId?: string;
  changePreview?: WorkspaceChangePreview;
  changePreviewLoading: boolean;
  fileContent?: string;
  fileLastModifiedAt?: number;
  externalFileChange?: { path: string; lastModifiedAt: number };
  outline: FileOutlineItem[];
  dirtyEditorPaths: string[];
  fileTreeClickedPath?: string;
  fileTreeClickedWorkspaceId?: string;
  fileTreeClickedKind?: 'directory' | 'file';
  /** 点击"工作区顶级目录"（根目录）时记录，用于将新建文件/文件夹的目标目录指向根目录 */
  fileTreeClickedWorkspaceRoot?: string;
  /** Changes 面板点击节点选中态（与 Files 面板 fileTreeClicked* 隔离） */
  changesTreeClickedPath?: string;
  changesTreeClickedWorkspaceId?: string;
  changesTreeClickedKind?: 'directory' | 'file';
  /** 点击"工作区顶级目录"（根目录）时记录 */
  changesTreeClickedWorkspaceRoot?: string;
  fileNavigatorActiveWorkspaceId?: string;
  /** Changes 面板"选中工作区"（与 Files 面板 fileNavigatorActiveWorkspaceId 隔离） */
  changesNavigatorActiveWorkspaceId?: string;

  setOpenTabs: (tabs: EditorTabState[]) => void;
  addOpenTab: (tab: EditorTabState) => void;
  removeOpenTab: (path: string) => void;
  setSelectedFilePath: (path: string | undefined) => void;
  setSelectedFileWorkspaceId: (workspaceId: string | undefined) => void;
  setSelectedChangePreviewPath: (path: string | undefined) => void;
  setSelectedChangePreviewWorkspaceId: (workspaceId: string | undefined) => void;
  setChangePreview: (preview: WorkspaceChangePreview | undefined) => void;
  setChangePreviewLoading: (loading: boolean) => void;
  setFileContent: (content: string | undefined) => void;
  setFileLastModifiedAt: (timestamp: number | undefined) => void;
  setExternalFileChange: (change: { path: string; lastModifiedAt: number } | undefined) => void;
  setOutline: (items: FileOutlineItem[]) => void;
  setDirtyEditorPaths: (paths: string[]) => void;
  addDirtyPath: (path: string) => void;
  removeDirtyPath: (path: string) => void;
  setFileTreeClickedNode: (workspaceId: string, path: string, kind: 'directory' | 'file') => void;
  setFileTreeClickedWorkspaceRoot: (workspaceId: string) => void;
  clearFileTreeClickedNode: () => void;
  setChangesTreeClickedNode: (
    workspaceId: string,
    path: string,
    kind: 'directory' | 'file',
  ) => void;
  setChangesTreeClickedWorkspaceRoot: (workspaceId: string) => void;
  clearChangesTreeClickedNode: () => void;
  setFileNavigatorActiveWorkspace: (workspaceId: string | undefined) => void;
  setChangesNavigatorActiveWorkspace: (workspaceId: string | undefined) => void;
  clearEditorState: () => void;
}

export const createEditorSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): EditorSlice => ({
  openTabs: [],
  outline: [],
  changePreviewLoading: false,
  dirtyEditorPaths: [],

  setOpenTabs: (tabs) => set({ openTabs: tabs }),
  addOpenTab: (tab) =>
    set((state) => ({
      openTabs: state.openTabs.some((t) => t.path === tab.path)
        ? state.openTabs
        : [...state.openTabs, tab],
    })),
  removeOpenTab: (path) =>
    set((state) => ({
      openTabs: state.openTabs.filter((t) => t.path !== path),
    })),
  setSelectedFilePath: (selectedFilePath) => set({ selectedFilePath }),
  setSelectedFileWorkspaceId: (selectedFileWorkspaceId) => set({ selectedFileWorkspaceId }),
  setSelectedChangePreviewPath: (selectedChangePreviewPath) => set({ selectedChangePreviewPath }),
  setSelectedChangePreviewWorkspaceId: (selectedChangePreviewWorkspaceId) =>
    set({ selectedChangePreviewWorkspaceId }),
  setChangePreview: (changePreview) => set({ changePreview }),
  setChangePreviewLoading: (loading) => set({ changePreviewLoading: loading }),
  setFileContent: (fileContent) => set({ fileContent }),
  setFileLastModifiedAt: (fileLastModifiedAt) => set({ fileLastModifiedAt }),
  setExternalFileChange: (externalFileChange) => set({ externalFileChange }),
  setOutline: (outline) => set({ outline }),
  setDirtyEditorPaths: (paths) => set({ dirtyEditorPaths: paths }),
  addDirtyPath: (path) =>
    set((state) => {
      const norm = path.toLowerCase().replace(/\\/g, '/');
      if (state.dirtyEditorPaths.some((p) => p.toLowerCase().replace(/\\/g, '/') === norm)) {
        return state;
      }
      return { dirtyEditorPaths: [...state.dirtyEditorPaths, path] };
    }),
  removeDirtyPath: (path) =>
    set((state) => {
      const norm = path.toLowerCase().replace(/\\/g, '/');
      return {
        dirtyEditorPaths: state.dirtyEditorPaths.filter(
          (p) => p.toLowerCase().replace(/\\/g, '/') !== norm,
        ),
      };
    }),
  setFileTreeClickedNode: (workspaceId, path, kind) => {
    set({
      fileTreeClickedWorkspaceId: workspaceId,
      fileTreeClickedPath: path,
      fileTreeClickedKind: kind,
      fileTreeClickedWorkspaceRoot: undefined,
      // 点击文件树节点时，把"选中工作区"同步为该节点所属工作区，使顶部工作区高亮
      // （左侧蓝条 + 蓝底）始终跟随用户实际正在操作的工作区。否则会出现：用户先点了
      // B 顶级目录（高亮在 B），随后回到 A 工作区里展开/点击节点，高亮却仍停在 B，
      // 导致在该工作区新建/重命名的目标被错误作用到 B 工作区。
      fileNavigatorActiveWorkspaceId: workspaceId,
    });
  },
  setFileTreeClickedWorkspaceRoot: (workspaceId) =>
    set({
      fileTreeClickedWorkspaceId: workspaceId,
      fileTreeClickedPath: undefined,
      fileTreeClickedKind: undefined,
      fileTreeClickedWorkspaceRoot: workspaceId,
    }),
  clearFileTreeClickedNode: () =>
    set({
      fileTreeClickedPath: undefined,
      fileTreeClickedWorkspaceId: undefined,
      fileTreeClickedKind: undefined,
      fileTreeClickedWorkspaceRoot: undefined,
    }),
  setChangesTreeClickedNode: (workspaceId, path, kind) =>
    set({
      changesTreeClickedWorkspaceId: workspaceId,
      changesTreeClickedPath: path,
      changesTreeClickedKind: kind,
      changesTreeClickedWorkspaceRoot: undefined,
      // 点击 Changes 树节点时，把"选中工作区"同步为该节点所属工作区，使顶部工作区高亮
      // （左侧蓝条 + 蓝底）始终跟随用户实际正在操作的工作区，与 Files 面板行为一致。
      changesNavigatorActiveWorkspaceId: workspaceId,
    }),
  setChangesTreeClickedWorkspaceRoot: (workspaceId) =>
    set({
      changesTreeClickedWorkspaceId: workspaceId,
      changesTreeClickedPath: undefined,
      changesTreeClickedKind: undefined,
      changesTreeClickedWorkspaceRoot: workspaceId,
      changesNavigatorActiveWorkspaceId: workspaceId,
    }),
  clearChangesTreeClickedNode: () =>
    set({
      changesTreeClickedPath: undefined,
      changesTreeClickedWorkspaceId: undefined,
      changesTreeClickedKind: undefined,
      changesTreeClickedWorkspaceRoot: undefined,
    }),
  setFileNavigatorActiveWorkspace: (fileNavigatorActiveWorkspaceId) =>
    set({ fileNavigatorActiveWorkspaceId }),
  setChangesNavigatorActiveWorkspace: (changesNavigatorActiveWorkspaceId) =>
    set({ changesNavigatorActiveWorkspaceId }),
  clearEditorState: () =>
    set({
      openTabs: [],
      selectedFilePath: undefined,
      selectedFileWorkspaceId: undefined,
      selectedChangePreviewPath: undefined,
      selectedChangePreviewWorkspaceId: undefined,
      changePreview: undefined,
      changePreviewLoading: false,
      fileContent: undefined,
      fileLastModifiedAt: undefined,
      externalFileChange: undefined,
      outline: [],
      dirtyEditorPaths: [],
      fileTreeClickedPath: undefined,
      fileTreeClickedWorkspaceId: undefined,
      fileTreeClickedKind: undefined,
      fileTreeClickedWorkspaceRoot: undefined,
      changesTreeClickedPath: undefined,
      changesTreeClickedWorkspaceId: undefined,
      changesTreeClickedKind: undefined,
      changesTreeClickedWorkspaceRoot: undefined,
      fileNavigatorActiveWorkspaceId: undefined,
      changesNavigatorActiveWorkspaceId: undefined,
    }),
});
