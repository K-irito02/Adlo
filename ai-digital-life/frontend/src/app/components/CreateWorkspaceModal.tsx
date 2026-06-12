import { useCallback } from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { WorkspaceSplitButton } from './WorkspaceSplitButton';

interface CreateWorkspaceModalProps {
  open: boolean;
  onPickWorkspaceDirectory: () => Promise<string | undefined>;
  onOpenWorkspace: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

export function CreateWorkspaceModal({
  open,
  onPickWorkspaceDirectory,
  onOpenWorkspace,
  onClose,
}: CreateWorkspaceModalProps) {
  const { t } = useTCopy();
  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!open) {
    return null;
  }

  return (
    <div
      className="adl-prompt-modal"
      onClick={handleBackdrop}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div
        className="adl-prompt-modal__panel adl-prompt-modal__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-label={t.workspaceNewTitle}
      >
        <div className="adl-prompt-modal__header">{t.workspaceNewTitle}</div>
        <div className="adl-prompt-modal__body">
          <div className="adl-statusbar__menu-section">
            <WorkspaceSplitButton
              onPickWorkspaceDirectory={onPickWorkspaceDirectory}
              onOpenWorkspace={onOpenWorkspace}
              onClose={onClose}
              initialMode="create"
              persistMode={false}
            />
          </div>
        </div>
        <div className="adl-prompt-modal__actions">
          <button type="button" className="adl-btn adl-btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
