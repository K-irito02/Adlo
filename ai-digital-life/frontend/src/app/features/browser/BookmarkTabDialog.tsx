import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { IconFolder, IconFolderPlus } from "../../icons";
import type { TabFolderState, BrowserTabState } from "../../stores/slices/browserSlice";
import type { CopyDict } from "../../copy";

interface BookmarkTabDialogProps {
  open: boolean;
  t: CopyDict;
  tab: BrowserTabState | null;
  folders: TabFolderState[];
  onBookmark: (folderId?: string, newFolderName?: string) => void | Promise<void>;
  onCancel: () => void;
}

export function BookmarkTabDialog({ 
  open, 
  t, 
  tab, 
  folders, 
  onBookmark, 
  onCancel 
}: BookmarkTabDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [createNewFolder, setCreateNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSelectedFolderId(null);
      setCreateNewFolder(false);
      setNewFolderName("");
      setLoading(false);
      requestAnimationFrame(() => {
        if (createNewFolder) {
          inputRef.current?.focus();
        }
      });
    }
  }, [open, createNewFolder]);

  const handleOk = useCallback(async () => {
    setLoading(true);
    try {
      if (createNewFolder) {
        await onBookmark(undefined, newFolderName);
      } else {
        await onBookmark(selectedFolderId || undefined);
      }
    } finally {
      setLoading(false);
    }
  }, [createNewFolder, newFolderName, selectedFolderId, onBookmark]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !loading) {
        if (createNewFolder && newFolderName.trim()) {
          void handleOk();
        } else if (!createNewFolder && selectedFolderId) {
          void handleOk();
        }
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [handleOk, loading, onCancel, createNewFolder, newFolderName, selectedFolderId]
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel]
  );

  const handleSelectFolder = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
    setCreateNewFolder(false);
  }, []);

  const handleCreateNew = useCallback(() => {
    setCreateNewFolder(true);
    setSelectedFolderId(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

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
          <div className="adl-bookmark-tab__section-label">选择标签工作区</div>
          
          {folders.length > 0 ? (
            <div className="adl-bookmark-tab__folder-list">
              {folders.map(folder => (
                <button
                  key={folder.id}
                  type="button"
                  className={`adl-bookmark-tab__folder-item ${
                    selectedFolderId === folder.id ? "is-selected" : ""
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
              暂无标签工作区
            </div>
          )}

          <button
            type="button"
            className={`adl-bookmark-tab__create-new ${
              createNewFolder ? "is-active" : ""
            }`}
            onClick={handleCreateNew}
          >
            <IconFolderPlus size={16} decorative />
            <span>创建新标签工作区</span>
          </button>

          {createNewFolder && (
            <input
              ref={inputRef}
              className="adl-prompt-modal__input"
              type="text"
              value={newFolderName}
              placeholder="输入新工作区名称"
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
            disabled={
              loading || 
              (!createNewFolder && !selectedFolderId) || 
              (createNewFolder && !newFolderName.trim())
            }
          >
            {loading ? "收藏中..." : "收藏"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
