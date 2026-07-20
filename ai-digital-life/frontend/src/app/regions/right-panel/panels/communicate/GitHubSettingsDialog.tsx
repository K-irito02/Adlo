import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '@app/icons';

interface GitHubSettingsDialogProps {
  open: boolean;
  workspaceName: string;
  initialOwner: string;
  initialRepo: string;
  initialBranch: string;
  initialToken: string;
  error: string | null;
  copy: Record<string, string>;
  onSave: (owner: string, repo: string, branch: string, token: string) => void;
  onCancel: () => void;
}

export function GitHubSettingsDialog({
  open,
  workspaceName,
  initialOwner,
  initialRepo,
  initialBranch,
  initialToken,
  error,
  copy,
  onSave,
  onCancel,
}: GitHubSettingsDialogProps) {
  const [owner, setOwner] = useState(initialOwner);
  const [repo, setRepo] = useState(initialRepo);
  const [branch, setBranch] = useState(initialBranch);
  const [token, setToken] = useState(initialToken);
  const [tokenVisible, setTokenVisible] = useState(false);
  const ownerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setOwner(initialOwner);
      setRepo(initialRepo);
      setBranch(initialBranch);
      setToken(initialToken);
      setTokenVisible(false);
      requestAnimationFrame(() => {
        ownerInputRef.current?.focus();
      });
    }
  }, [open, initialOwner, initialRepo, initialBranch, initialToken]);

  const handleConfirm = useCallback(() => {
    if (!owner.trim() || !repo.trim()) {
      return;
    }
    onSave(owner, repo, branch, token);
  }, [owner, repo, branch, token, onSave]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleConfirm();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [handleConfirm, onCancel],
  );

  const handleBackdrop = useCallback(
    (e: MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel();
      }
    },
    [onCancel],
  );

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
      <div
        className="adl-prompt-modal__panel adl-prompt-modal__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-label={`${copy.ciSettingsDialogTitle} - ${workspaceName}`}
      >
        <div className="adl-prompt-modal__header">
          {copy.ciSettingsDialogTitle} - {workspaceName}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onCancel}
            aria-label={copy.ciClose}
          >
            <IconClose size={14} decorative />
          </button>
        </div>

        <div className="adl-github-settings__body">
          <div className="adl-github-settings__field">
            <div className="adl-github-settings__label">{copy.ciOwnerLabel}</div>
            <input
              ref={ownerInputRef}
              className="adl-prompt-modal__input"
              placeholder={copy.ciOwnerPlaceholder}
              value={owner}
              onChange={(e) => setOwner(e.currentTarget.value)}
            />
          </div>

          <div className="adl-github-settings__field">
            <div className="adl-github-settings__label">{copy.ciRepoLabel}</div>
            <input
              className="adl-prompt-modal__input"
              placeholder={copy.ciRepoPlaceholder}
              value={repo}
              onChange={(e) => setRepo(e.currentTarget.value)}
            />
          </div>

          <div className="adl-github-settings__field">
            <div className="adl-github-settings__label">{copy.ciBranchLabel}</div>
            <input
              className="adl-prompt-modal__input"
              placeholder={copy.ciBranchPlaceholder}
              value={branch}
              onChange={(e) => setBranch(e.currentTarget.value)}
            />
          </div>

          <div className="adl-github-settings__field">
            <div className="adl-github-settings__label">
              {copy.ciTokenLabel}
              <span className="adl-github-settings__optional">({copy.ciTokenOptional})</span>
            </div>
            <div className="adl-github-settings__token-input">
              <input
                className="adl-prompt-modal__input adl-github-settings__token-field"
                placeholder={copy.ciTokenPlaceholder}
                type={tokenVisible ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.currentTarget.value)}
              />
              <button
                type="button"
                className="adl-github-settings__token-toggle"
                onClick={() => setTokenVisible((v) => !v)}
                title={tokenVisible ? copy.ciHideToken : copy.ciShowToken}
                aria-label={tokenVisible ? copy.ciHideToken : copy.ciShowToken}
              >
                {tokenVisible ? (
                  <svg viewBox="0 0 16 16" width="16" height="14" fill="currentColor">
                    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.75 1.034-1.246 1.571C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="16" height="14" fill="currentColor">
                    <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.75 1.034-1.246 1.571-.389.422-.816.812-1.27 1.145l.242.234z" />
                    <path d="M3.588 4.243A7.025 7.025 0 0 0 1.172 6.66 13.133 13.133 0 0 0 0 8s3 5.5 8 5.5c2.024 0 3.743-.685 5.022-1.714l.707.707a.5.5 0 1 0 .707-.707l-12-12a.5.5 0 1 0-.707.707l2.152 2.152zM2.063 9.675A12.3 12.3 0 0 0 1.172 8a13.134 13.134 0 0 1 2.298-2.649l.735.735A6.68 6.68 0 0 0 2.99 9.782c.33.475.744.98 1.258 1.444C5.332 12.332 7.12 13.5 9 13.5c1.15 0 2.187-.353 3.06-.942l.656.656a6.535 6.535 0 0 1-1.582.938c-.337.135-.664.243-.97.318l.737.737a.5.5 0 1 1-.707.707l-12-12a.5.5 0 1 1 .707-.707l2.152 2.152z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <div className="adl-github-settings__error">{error}</div>}
        </div>

        <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={onCancel}
          >
            {copy.ciSettingsCancel}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--square"
            onClick={handleConfirm}
            disabled={!owner.trim() || !repo.trim()}
          >
            {copy.ciSettingsSave}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
