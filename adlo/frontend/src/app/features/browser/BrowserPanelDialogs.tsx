import { RenameDialog } from '@components/RenameDialog';
import { ToastContainer } from '@components/Toast';
import { CreateTabDialog } from './browser-landing';
import { BookmarkToFolderDialogs } from './BookmarkToFolderDialogs';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import type { ToastData } from '@components/Toast';
import type { FileTreeRenderableNode } from '@features/file-tree/fileTree.utils';

export interface BrowserPanelDialogsProps {
  t: CopyDict;
  createTabDialog: { open: boolean; workspaceId?: string; folderId?: string };
  editTabDialog: { open: boolean; name: string; url: string };
  isCreatingTab: boolean;
  handleCreateTabConfirm: (name: string, url: string, mode: 'save-only' | 'save-and-open') => void;
  handleCreateTabCancel: () => void;
  handleEditTabConfirm: (name: string, url: string, mode: 'save-only' | 'save-and-open') => void;
  handleEditTabCancel: () => void;
  bookmarkDialogOpen: boolean;
  bookmarkTreeData: {
    workspaceNodes: FileTreeRenderableNode[];
    userFolderNodes: FileTreeRenderableNode[];
  };
  handleBookmarkAddToFolder: (path: string | null) => void;
  handleBookmarkCreateDir: (parentPath: string | null) => void;
  handleCloseBookmarkDialog: () => void;
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
  handleCloseBookmarkDialog,
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

      <BookmarkToFolderDialogs
        open={bookmarkDialogOpen}
        t={t}
        workspaceNodes={bookmarkTreeData.workspaceNodes}
        userFolderNodes={bookmarkTreeData.userFolderNodes}
        onAddToFolder={handleBookmarkAddToFolder}
        onCreateDir={handleBookmarkCreateDir}
        onCancel={handleCloseBookmarkDialog}
        bookmarkName={bookmarkName}
        onBookmarkNameChange={setBookmarkName}
        createDirDialog={createDirDialog}
        setCreateDirDialog={setCreateDirDialog}
      />

      <RenameDialog
        open={renameFolderState.open}
        initialValue={renameFolderState.currentName}
        title={t.browserRenamePrompt as string}
        placeholder={t.browserRenamePrompt as string}
        onConfirm={(name) => {
          useAppStore.getState().browserUpdateBookmarkFolder(renameFolderState.folderId, { name });
          setRenameFolderState((prev) => ({ ...prev, open: false }));
        }}
        onCancel={() => setRenameFolderState((prev) => ({ ...prev, open: false }))}
      />

      <ToastContainer toasts={toastMessages} onRemove={removeToast} />
    </>
  );
}
