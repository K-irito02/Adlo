/**
 * 编辑器切片
 * 管理编辑器标签页、文件内容、大纲等状态
 */
import type { FileOutlineItem, WorkspaceChangePreview } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import { type EditorTabState } from '../../utils/editorTabs';

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
  clearEditorState: () => void;
}

export const createEditorSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
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
          (p) => p.toLowerCase().replace(/\\/g, '/') !== norm
        ),
      };
    }),
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
    }),
});
