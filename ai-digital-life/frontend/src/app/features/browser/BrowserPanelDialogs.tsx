import { RenameDialog } from '@components/RenameDialog';
import { ToastContainer } from '@components/Toast';
import { CreateTabDialog } from './browser-landing';
import { BookmarkToFolderDialog } from './BookmarkToFolderDialog';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import type { ToastData } from '@components/Toast';
import type { FileTreeRenderableNode } from '@features/file-tree/fileTree.utils';

export interface BrowserPanelDialogsProps {
  t: CopyDict;
  createTabDialog: { open: boolean; workspaceId?: string; folderId?: string };
  editTabDialog: { open: boolean; name: string; url: string };
  isCreatingTab: boolean;
  handleCreateTabConfirm: (name: string, url: string) => void;
  handleCreateTabCancel: () => void;
  handleEditTabConfirm: (name: string, url: string) => void;
  handleEditTabCancel: () => void;
  bookmarkDialogOpen: boolean;
  bookmarkTreeData: {
    workspaceNodes: FileTreeRenderableNode[];
    userFolderNodes: FileTreeRenderableNode[];
  };
  handleBookmarkAddToFolder: (path: string | null) => void;
  handleBookmarkCreateDir: (parentPath: string | null) => void;
  setBookmarkDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBookmarkName: React.Dispatch<React.SetStateAction<string>>;
  bookmarkName: string;
  renameFolderState: { open: boolean; folderId: string; currentName: string };
  setRenameFolderState: React.Dispatch<
    React.SetStateAction<{ open: boolean; folderId: string; currentName: string }>
  >;
  createDirDialog: { open: boolean; parentPath: string | null };
  setCreateDirDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; parentPath: string | null }>
  >;
  toastMessages: ToastData[];
  removeToast: (id: string) => void;
}

export function BrowserPanelDialogs({
  t,
  createTabDialog,
  editTabDialog,
  isCreatingTab,
  handleCreateTabConfirm,
  handleCreateTabCancel,
  handleEditTabConfirm,
  handleEditTabCancel,
  bookmarkDialogOpen,
  bookmarkTreeData,
  handleBookmarkAddToFolder,
  handleBookmarkCreateDir,
  setBookmarkDialogOpen,
  setBookmarkName,
  bookmarkName,
  renameFolderState,
  setRenameFolderState,
  createDirDialog,
  setCreateDirDialog,
  toastMessages,
  removeToast,
}: BrowserPanelDialogsProps) {
  return (
    <>
      <CreateTabDialog
        open={createTabDialog.open || editTabDialog.open}
        loading={createTabDialog.open ? isCreatingTab : false}
        t={t}
        initialName={editTabDialog.open ? editTabDialog.name : undefined}
        initialUrl={editTabDialog.open ? editTabDialog.url : undefined}
        onConfirm={createTabDialog.open ? handleCreateTabConfirm : handleEditTabConfirm}
        onCancel={createTabDialog.open ? handleCreateTabCancel : handleEditTabCancel}
      />

      <BookmarkToFolderDialog
        open={bookmarkDialogOpen}
        t={t}
        workspaceNodes={bookmarkTreeData.workspaceNodes}
        userFolderNodes={bookmarkTreeData.userFolderNodes}
        onAddToFolder={handleBookmarkAddToFolder}
        onCreateDir={handleBookmarkCreateDir}
        onCancel={() => {
          setBookmarkDialogOpen(false);
          setBookmarkName('');
          useAppStore.getState().browserSetPendingBookmark(null);
        }}
        bookmarkName={bookmarkName}
        onBookmarkNameChange={setBookmarkName}
      />

      <RenameDialog
        open={renameFolderState.open}
        initialValue={renameFolderState.currentName}
        title={t.browserRenamePrompt as string}
        placeholder={t.browserRenamePrompt as string}
        onConfirm={(name) => {
          useAppStore.getState().browserUpdateTabFolder(renameFolderState.folderId, { name });
          setRenameFolderState((prev) => ({ ...prev, open: false }));
        }}
        onCancel={() => setRenameFolderState((prev) => ({ ...prev, open: false }))}
      />

      <RenameDialog
        open={createDirDialog.open}
        initialValue=""
        title={t.browserCreateDir as string}
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

      <ToastContainer toasts={toastMessages} onRemove={removeToast} />
    </>
  );
}
