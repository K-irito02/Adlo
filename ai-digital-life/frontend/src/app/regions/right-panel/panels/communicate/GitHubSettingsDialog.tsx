import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '../../../../icons';

export function GitHubSettingsDialog({
  open,
  workspaceName,
  initialOwner,
  initialRepo,
  initialBranch,
  error,
  copy,
  onSave,
  onCancel,
}: {
  open: boolean;
  workspaceName: string;
  initialOwner: string;
  initialRepo: string;
  initialBranch: string;
  error: string | null;
  copy: Record<string, string>;
  onSave: (owner: string, repo: string, branch: string, token: string) => void;
  onCancel: () => void;
}) {
  const [owner, setOwner] = useState(initialOwner);
  const [repo, setRepo] = useState(initialRepo);
  const [branch, setBranch] = useState(initialBranch);
  const [token, setToken] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);

  const prevInitialOwnerRef = useRef(initialOwner);
  if (initialOwner !== prevInitialOwnerRef.current) {
    prevInitialOwnerRef.current = initialOwner;
    setOwner(initialOwner);
    setRepo(initialRepo);
    setBranch(initialBranch);
    setToken('');
  }

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="adl-dialog-overlay" onClick={onCancel}>
      <div className="adl-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="adl-dialog__header">
          <h3 className="adl-dialog__title">配置 CI - {workspaceName}</h3>
          <button type="button" className="adl-dialog__close" onClick={onCancel}>
            <IconClose size={14} decorative />
          </button>
        </div>
        <div className="adl-dialog__body">
          <div className="adl-github__config">
            <div className="adl-github__config-row">
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciOwnerPlaceholder}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(owner, repo, branch, token)}
              />
              <span className="adl-github__config-sep">/</span>
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciRepoPlaceholder}
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(owner, repo, branch, token)}
              />
            </div>
            <div className="adl-github__config-row">
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciBranchPlaceholder}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(owner, repo, branch, token)}
              />
            </div>
            <div className="adl-github__config-row">
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciTokenPlaceholder}
                type={tokenVisible ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(owner, repo, branch, token)}
              />
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--sm"
                onClick={() => setTokenVisible((v) => !v)}
                title={tokenVisible ? '隐藏' : '显示'}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  {tokenVisible ? (
                    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.75 1.034-1.246 1.571C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
                  ) : (
                    <>
                      <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.75 1.034-1.246 1.571-.389.422-.816.812-1.27 1.145l.242.234z" />
                      <path d="M3.588 4.243A7.025 7.025 0 0 0 1.172 6.66 13.133 13.133 0 0 0 0 8s3 5.5 8 5.5c2.024 0 3.743-.685 5.022-1.714l.707.707a.5.5 0 1 0 .707-.707l-12-12a.5.5 0 1 0-.707.707l1.86 1.86zM2.063 9.675A12.3 12.3 0 0 0 1.172 8a13.134 13.134 0 0 1 2.298-2.649l.735.735A6.68 6.68 0 0 0 2.99 9.782c.33.475.744.98 1.258 1.444C5.332 12.332 7.12 13.5 9 13.5c1.15 0 2.187-.353 3.06-.942l.656.656a6.535 6.535 0 0 1-1.582.938c-.337.135-.664.243-.97.318l.737.737a.5.5 0 1 1-.707.707l-12-12a.5.5 0 1 1 .707-.707l2.152 2.152z" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            <div className="adl-github__token-hint adl-text--xs adl-text--secondary">
              Token 仅保存在浏览器本地，不会上传至服务器
            </div>
          </div>
          {error && (
            <div className="adl-github__error">
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="adl-dialog__footer">
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--sm"
            onClick={() => onSave(owner, repo, branch, token)}
            disabled={!owner.trim() || !repo.trim()}
          >
            保存并查询
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
