import { RenameDialog } from '@components/RenameDialog';
import { BookmarkToFolderDialog } from './BookmarkToFolderDialog';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import type { FileTreeRenderableNode } from '@features/file-tree/fileTree.utils';

interface BookmarkToFolderDialogsProps {
  open: boolean;
  t: CopyDict;
  workspaceNodes: FileTreeRenderableNode[];
  userFolderNodes: FileTreeRenderableNode[];
  onAddToFolder: (path: string | null) => void;
  onCreateDir: (parentPath: string | null) => void;
  onCancel: () => void;
  bookmarkName?: string;
  onBookmarkNameChange?: (name: string) => void;
  /** 创建目录对话框状态：由宿主持有，与宿主的其它「新建目录」入口共用同一实例。 */
  createDirDialog: { open: boolean; parentPath: string | null };
  setCreateDirDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; parentPath: string | null }>
  >;
}

/**
 * 「收藏标签 → 选择目录」对话框组（宿主无关，面板与中心共用）。
 *
 * 渲染收藏目录对话框与其「新建目录」子对话框。创建目录对话框状态由宿主持有：
 * 面板的导航器工具栏也复用同一个状态，两端因此都只有一份实例。
 */
export function BookmarkToFolderDialogs({
  open,
  t,
  workspaceNodes,
  userFolderNodes,
  onAddToFolder,
  onCreateDir,
  onCancel,
  bookmarkName,
  onBookmarkNameChange,
  createDirDialog,
  setCreateDirDialog,
}: BookmarkToFolderDialogsProps) {
  return (
    <>
      <BookmarkToFolderDialog
        open={open}
        t={t}
        workspaceNodes={workspaceNodes}
        userFolderNodes={userFolderNodes}
        onAddToFolder={onAddToFolder}
        onCreateDir={onCreateDir}
        onCancel={onCancel}
        bookmarkName={bookmarkName}
        onBookmarkNameChange={onBookmarkNameChange}
      />

      <RenameDialog
        open={createDirDialog.open}
        initialValue=""
        title={t.browserCreateDir}
        onConfirm={(name) => {
          const parentPath = createDirDialog.parentPath;
          if (parentPath?.startsWith('folder:')) {
            const folderId = parentPath.slice('folder:'.length);
            useAppStore.getState().browserCreateTabFolder(name, folderId, 'folder');
          } else if (parentPath?.startsWith('workspace:')) {
            const wsId = parentPath.slice('workspace:'.length);
            useAppStore.getState().browserCreateTabFolder(name, wsId, 'workspace');
          } else {
            useAppStore.getState().browserCreateTabFolder(name, undefined, undefined);
          }
          setCreateDirDialog({ open: false, parentPath: null });
        }}
        onCancel={() => setCreateDirDialog({ open: false, parentPath: null })}
      />
    </>
  );
}
