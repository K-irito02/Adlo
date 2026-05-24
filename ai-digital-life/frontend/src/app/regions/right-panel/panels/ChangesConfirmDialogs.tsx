import React, { useCallback } from "react";
import { IconClipboardList, IconCopy, IconFiles, IconFolderOpen, IconPencil, IconTrash, IconUpload } from "../../../icons";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { RenameInput } from "../../../components/RenameInput";
import { useAppStore } from "../../../stores/slicedStore";
import { joinPathSegments } from "../../../workspacePaths";
import type { FileTreeContextMenuItem } from "../../../features/file-tree";
import type { ChangeTreeNode } from "../changesTree";

export type ChangesConfirmDialogsProps = {
  changesDeleteConfirmPath: string | null;
  changesRenamingPath: string | null;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onRenameConfirm: (newName: string) => void;
  onRenameCancel: () => void;
  t: Record<string, string>;
};

export function ChangesConfirmDialogs({
  changesDeleteConfirmPath,
  changesRenamingPath,
  onDeleteConfirm,
  onDeleteCancel,
  onRenameConfirm,
  onRenameCancel,
  t,
}: ChangesConfirmDialogsProps) {
  return (
    <>
      {changesDeleteConfirmPath ? (
        <ConfirmDialog
          title={t.fileDeleteConfirm as string}
          message={t.fileDeleteMessage as string}
          confirmLabel={t.fileDeleteAction as string}
          cancelLabel={t.cancel as string}
          danger
          onConfirm={onDeleteConfirm}
          onCancel={onDeleteCancel}
        />
      ) : null}
      {changesRenamingPath ? (
        <div className="adl-rename-overlay" onClick={onRenameCancel}>
          <div className="adl-rename-dialog" onClick={(e) => e.stopPropagation()}>
            <RenameInput
              initialValue={changesRenamingPath.split("/").pop() || ""}
              onConfirm={onRenameConfirm}
              onCancel={onRenameCancel}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
