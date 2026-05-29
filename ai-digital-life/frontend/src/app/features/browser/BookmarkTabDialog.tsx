import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { IconFolder, IconFolderPlus, IconFiles } from "../../icons";
import type { TabFolderState, BrowserTabState } from "../../stores/slices/browserSlice";
import type { CopyDict } from "../../copy";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";

interface BookmarkTabDialogProps {
  open: boolean;
  t: CopyDict;
  tab: BrowserTabState | null;
  folders: TabFolderState[];
  workspaces: RecentWorkspaceEntry[];
  onBookmark: (folderId?: string, workspaceId?: string, newFolderName?: string) => void | Promise<void>;
  onCancel: () => void;
}

type SelectionMode = "workspace" | "folder" | "new-folder";

export function BookmarkTabDialog({ 
  open, 
  t, 
  tab, 
  folders, 
  workspaces,
  onBookmark, 
  onCancel 
}: BookmarkTabDialogProps) {
  const [mode, setMode] = useState<SelectionMode>("folder");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [createNewFolder, setCreateNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode("folder");
      setSelectedFolderId(null);
      setSelectedWorkspaceId(null);
      setCreateNewFolder(false);
      setNewFolderName("");
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && createNewFolder) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open, createNewFolder]);

  const handleOk = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "new-folder" && createNewFolder) {
        await onBookmark(undefined, undefined, newFolderName);
      } else if (mode === "folder" && selectedFolderId) {
        await onBookmark(selectedFolderId, undefined);
      } else if (mode === "workspace" && selectedWorkspaceId) {
        await onBookmark(undefined, selectedWorkspaceId);
      }
    } finally {
      setLoading(false);
    }
  }, [mode, createNewFolder, newFolderName, selectedFolderId, selectedWorkspaceId, onBookmark]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !loading) {
        if (mode === "new-folder" && createNewFolder && newFolderName.trim()) {
          void handleOk();
        } else if (mode === "folder" && selectedFolderId) {
          void handleOk();
        } else if (mode === "workspace" && selectedWorkspaceId) {
          void handleOk();
        }
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [handleOk, loading, onCancel, mode, createNewFolder, newFolderName, selectedFolderId, selectedWorkspaceId]
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel]
  );

  const handleSelectFolder = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
    setSelectedWorkspaceId(null);
    setCreateNewFolder(false);
    setMode("folder");
  }, []);

  const handleSelectWorkspace = useCallback((workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setSelectedFolderId(null);
    setCreateNewFolder(false);
    setMode("workspace");
  }, []);

  const handleCreateNew = useCallback(() => {
    setCreateNewFolder(true);
    setSelectedFolderId(null);
    setSelectedWorkspaceId(null);
    setMode("new-folder");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const isOkDisabled = loading || 
    (mode === "new-folder" && (!createNewFolder || !newFolderName.trim())) ||
    (mode === "folder" && !selectedFolderId) ||
    (mode === "workspace" && !selectedWorkspaceId);

  if (!open || !tab) return null;

  return createPortal(
    <div 
      className="adl-prompt-modal" 
      onKeyDown={handleKeyDown}
      onClick={handleBackdrop}
    >
      <div className="adl-prompt-modal__panel" role="dialog" aria-modal="true" aria-label="收藏标签">
        <div className="adl-prompt-modal__header">收藏标签</div>
        
        <div className="adl-bookmark-tab__info">
          <div className="adl-bookmark-tab__title" title={tab.title}>
            {tab.title}
          </div>
          <div className="adl-bookmark-tab__url" title={tab.url}>
            {tab.url}
          </div>
        </div>

        <div className="adl-bookmark-tab__options">
          <div className="adl-bookmark-tab__section-label">选择位置</div>
          
          {/* Workspace selection */}
          {workspaces.length > 0 && (
            <div className="adl-bookmark-tab__section">
              <div className="adl-bookmark-tab__sub-label">工作区</div>
              <div className="adl-bookmark-tab__folder-list">
                {workspaces.map(workspace => (
                  <button
                    key={workspace.id}
                    type="button"
                    className={`adl-bookmark-tab__folder-item ${
                      mode === "workspace" && selectedWorkspaceId === workspace.id ? "is-selected" : ""
                    }`}
                    onClick={() => handleSelectWorkspace(workspace.id)}
                  >
                    <IconFiles size={16} decorative />
                    <span className="adl-bookmark-tab__folder-name">
                      {workspace.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Folder selection */}
          <div className="adl-bookmark-tab__section">
            <div className="adl-bookmark-tab__sub-label">标签文件夹</div>
            {folders.length > 0 ? (
              <div className="adl-bookmark-tab__folder-list">
                {folders.map(folder => (
                  <button
                    key={folder.id}
                    type="button"
                    className={`adl-bookmark-tab__folder-item ${
                      mode === "folder" && selectedFolderId === folder.id ? "is-selected" : ""
                    }`}
                    onClick={() => handleSelectFolder(folder.id)}
                  >
                    <IconFolder size={16} decorative />
                    <span className="adl-bookmark-tab__folder-name">
                      {folder.name}
                    </span>
                    {folder.tabs && folder.tabs.length > 0 && (
                      <span className="adl-bookmark-tab__folder-count">
                        {folder.tabs.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="adl-bookmark-tab__empty">
                暂无标签文件夹
              </div>
            )}
          </div>

          <button
            type="button"
            className={`adl-bookmark-tab__create-new ${
              mode === "new-folder" && createNewFolder ? "is-active" : ""
            }`}
            onClick={handleCreateNew}
          >
            <IconFolderPlus size={16} decorative />
            <span>创建新标签文件夹</span>
          </button>

          {mode === "new-folder" && createNewFolder && (
            <input
              ref={inputRef}
              className="adl-prompt-modal__input"
              type="text"
              value={newFolderName}
              placeholder="输入新文件夹名称"
              onChange={(e) => setNewFolderName(e.currentTarget.value)}
              disabled={loading}
            />
          )}
        </div>

        <div className="adl-prompt-modal__actions">
          <button
            type="button"
            className="adl-btn adl-btn--ghost"
            onClick={onCancel}
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary"
            onClick={() => void handleOk()}
            disabled={isOkDisabled}
          >
            {loading ? "收藏中..." : "收藏"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
