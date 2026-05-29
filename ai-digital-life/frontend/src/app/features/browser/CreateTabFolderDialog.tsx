import { useEffect, useRef, useState, useCallback } from "react";
import type { CopyDict } from "../../copy";

interface CreateTabFolderDialogProps {
  open: boolean;
  t: CopyDict;
  onCreate: (name?: string) => void | Promise<void>;
  onCancel: () => void;
}

export function CreateTabFolderDialog({ open, t, onCreate, onCancel }: CreateTabFolderDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setLoading(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  const handleOk = useCallback(async () => {
    const trimmed = value.trim();
    setLoading(true);
    try {
      await onCreate(trimmed || undefined);
    } finally {
      setLoading(false);
    }
  }, [value, onCreate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !loading) {
        void handleOk();
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [handleOk, loading, onCancel]
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel]
  );

  if (!open) return null;

  return (
    <div 
      className="adl-prompt-modal" 
      onKeyDown={handleKeyDown}
      onClick={handleBackdrop}
    >
      <div className="adl-prompt-modal__panel" role="dialog" aria-modal="true" aria-label="新建标签目录">
        <div className="adl-prompt-modal__header">新建标签目录</div>
        <input
          ref={inputRef}
          className="adl-prompt-modal__input"
          type="text"
          value={value}
          placeholder="输入目录名称（留空使用默认名称）"
          onChange={(e) => setValue(e.currentTarget.value)}
          disabled={loading}
        />
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
            disabled={loading}
          >
            {loading ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
