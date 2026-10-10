/**
 * 编辑器切片
 * 管理编辑器标签页、文件内容、大纲等状态
 */
import type {
  FileOutlineItem,
  WorkspaceChangePreview,
  WorkspaceMediaDocument,
} from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { EditorTabState } from '@utils/editorTabs';
import type { PersistedViewport } from '../persisted/viewport';
import { persistField } from '../persisted/apply';

/** 文件树选中节点（按工作区隔离的持久化记录，`adl:files.clickedNode`，Task 22） */
export interface FileTreeClickedNode {
  path?: string;
  kind?: 'directory' | 'file';
  /** 点击"工作区顶级目录"（根目录）时记录 */
  workspaceRoot?: string;
}

/** 会话恢复：上次打开的文件（`adl:session.lastFile`，Task 26） */
export interface SessionLastFile {
  workspaceId: string;
  relativePath: string;
}

/**
 * 会话恢复的瞬态提示（Task 26，非持久化）。
 * 恢复失败时置位，打开任意文件成功时清空 —— 提示不常驻。
 */
export type SessionRestoreNotice = 'sessionLastFileMissing';

/** 主区开文件失败信息（事项 46 调整项，Phase 4 审查 L1 抽为共享类型）。 */
export interface FileOpenError {
  path: string;
  code: string;
  message: string;
  workspaceId?: string;
  workspacePath?: string;
}

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
  /**
   * 媒体/办公二进制文档（图片/音视频/docx/pdf/表格/演示）。
   * 与 fileContent 互斥：媒体打开成功时置位并清空 fileContent；
   * 文本打开成功/失败时清空。承载 base64 字节，前端解码为 Blob 后渲染。
   */
  fileMedia?: WorkspaceMediaDocument | null;
  /**
   * 主区开文件失败信息（事项 46 调整项）：失败时主区展示友好错误，
   * 不回退显示旧文件内容；成功打开任意文件时清掉。
   */
  fileOpenError?: FileOpenError | null;
  /**
   * 正在定位中的路径（事项 46 调整项）：主区隐藏该文件表面直到揭示完成，
   * 全程不绘制中间态；揭示成功/放弃时清掉。
   */
  positioningPath?: string | null;
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
  /**
   * 文件树选中节点（按工作区隔离，`adl:files.clickedNode`，Task 22）。
   * 与上方四个扁平字段互为镜像：扁平字段是"当前会话选中"（重启即空），
   * 本记录是"各工作区上次选中"（跨重启还原，回退显示用）。
   */
  fileTreeClicked: Record<string, FileTreeClickedNode>;
  /** 文件大纲展开项（按工作区隔离，`adl:files.outlineExpanded`，Task 22） */
  filesOutlineExpanded: Record<string, string[]>;
  /**
   * 上次打开的文件（`adl:session.lastFile`，Task 26）。
   * null = 从未成功打开过文件（与登记表 fallback 一致，见 registry 注释）。
   */
  lastOpenedFile: SessionLastFile | null;
  /**
   * 会话恢复的瞬态提示（Task 26，非持久化，不登记）。
   * 恢复失败时置位，打开任意文件成功时清空。
   */
  sessionRestoreNotice?: SessionRestoreNotice;
  /**
   * 编辑器视口（`adl:session.editorViewport`，Task 27）。
   * null = 尚无记录；只存行号/偏移/折叠区间数值（见 persisted/viewport.ts）。
   */
  editorViewport: PersistedViewport | null;

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
  setFileMedia: (media: WorkspaceMediaDocument | null) => void;
  setFileOpenError: (error: FileOpenError | null) => void;
  setPositioningPath: (path: string | null) => void;
  setExternalFileChange: (change: { path: string; lastModifiedAt: number } | undefined) => void;
  setOutline: (items: FileOutlineItem[]) => void;
  setDirtyEditorPaths: (paths: string[]) => void;
  addDirtyPath: (path: string) => void;
  removeDirtyPath: (path: string) => void;
  setFileTreeClickedNode: (workspaceId: string, path: string, kind: 'directory' | 'file') => void;
  setFileTreeClickedWorkspaceRoot: (workspaceId: string) => void;
  clearFileTreeClickedNode: () => void;
  setFilesOutlineExpanded: (workspaceId: string, ids: string[]) => void;
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
  get: () => StoreState,
): EditorSlice => ({
  openTabs: [],
  outline: [],
  changePreviewLoading: false,
  dirtyEditorPaths: [],
  fileOpenError: null,
  positioningPath: null,
  fileTreeClicked: {},
  filesOutlineExpanded: {},
  lastOpenedFile: null,
  editorViewport: null,

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
  setFileMedia: (fileMedia) => set({ fileMedia }),
  setFileOpenError: (fileOpenError) => set({ fileOpenError }),
  setPositioningPath: (positioningPath) => set({ positioningPath }),
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
    const current = get();
    if (
      current.fileTreeClickedWorkspaceId === workspaceId &&
      current.fileTreeClickedPath === path &&
      current.fileTreeClickedKind === kind
    ) {
      // 重复选中同一节点：不写盘也不通知（Task 22，避免冗余落盘）
      return;
    }
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
      ...persistField('adl:files.clickedNode', {
        ...current.fileTreeClicked,
        [workspaceId]: { path, kind },
      }),
    });
  },
  setFileTreeClickedWorkspaceRoot: (workspaceId) => {
    const current = get();
    if (
      current.fileTreeClickedWorkspaceId === workspaceId &&
      current.fileTreeClickedWorkspaceRoot === workspaceId
    ) {
      return;
    }
    set({
      fileTreeClickedWorkspaceId: workspaceId,
      fileTreeClickedPath: undefined,
      fileTreeClickedKind: undefined,
      fileTreeClickedWorkspaceRoot: workspaceId,
      ...persistField('adl:files.clickedNode', {
        ...current.fileTreeClicked,
        [workspaceId]: { workspaceRoot: workspaceId },
      }),
    });
  },
  clearFileTreeClickedNode: () => {
    const current = get();
    const clearedWorkspaceId = current.fileTreeClickedWorkspaceId;
    const nextClicked = { ...current.fileTreeClicked };
    if (clearedWorkspaceId !== undefined) {
      // 用户亲手清除选中（如点击空白处）：该工作区的上次选中记录一并删除，
      // 否则重启后会高亮一个用户已放弃的项
      delete nextClicked[clearedWorkspaceId];
    }
    set({
      fileTreeClickedPath: undefined,
      fileTreeClickedWorkspaceId: undefined,
      fileTreeClickedKind: undefined,
      fileTreeClickedWorkspaceRoot: undefined,
      // 清除选中态时同步清空"选中工作区"，使回退分支（derivedActiveWorkspaceId）
      // 可重新触达，避免点击后高亮/新建目标永久粘滞在陈旧工作区（后端激活工作区
      // 切换或该工作区被移除时指向错误）。
      fileNavigatorActiveWorkspaceId: undefined,
      ...persistField('adl:files.clickedNode', nextClicked),
    });
  },
  setFilesOutlineExpanded: (workspaceId, ids) =>
    set((state) =>
      persistField('adl:files.outlineExpanded', {
        ...state.filesOutlineExpanded,
        [workspaceId]: [...ids],
      }),
    ),
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
      // 与 Files 面板一致：清除选中态时同步清空"选中工作区"，使回退分支可重新触达。
      changesNavigatorActiveWorkspaceId: undefined,
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
      fileMedia: null,
      fileOpenError: null,
      positioningPath: null,
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
