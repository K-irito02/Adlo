import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GitBranchSummary,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from '@ai-digital-life/kernel';
import { useTCopy } from '../i18n/useTCopy';
import { IconCheck, IconChevronRight, IconGitBranch, IconPlus } from '../icons';
import { TooltipSimple } from '../components/Tooltip';
import { gitIcon, gitStatusLabel, type GitStatus } from './StatusBar/utils';

type PendingBranchAction =
  | { kind: 'switch'; input: WorkspaceGitBranchSwitchInput }
  | { kind: 'create'; input: WorkspaceGitBranchCreateInput };

interface StatusBarGitInfoProps {
  gitStatus: GitStatus;
  hasWorkspace: boolean;
  currentBranch: string;
  gitBranches: GitBranchSummary[];
  hasDirtyChanges: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onRequestClose: () => void;
  onRefreshGitBranches: () => Promise<void>;
  onSwitchGitBranch: (input: WorkspaceGitBranchSwitchInput) => Promise<void>;
  onCreateGitBranch: (input: WorkspaceGitBranchCreateInput) => Promise<void>;
}

const StatusBarGitInfo = React.memo(function StatusBarGitInfo({
  gitStatus,
  hasWorkspace,
  currentBranch,
  gitBranches,
  hasDirtyChanges,
  isOpen,
  onToggle,
  onRequestClose,
  onRefreshGitBranches,
  onSwitchGitBranch,
  onCreateGitBranch,
}: StatusBarGitInfoProps) {
  const { t } = useTCopy();
  const [branchDraft, setBranchDraft] = useState('');
  const [baseBranchDraft, setBaseBranchDraft] = useState('');
  const [baseBranchMenuOpen, setBaseBranchMenuOpen] = useState(false);
  const [pendingBranchAction, setPendingBranchAction] = useState<PendingBranchAction>();
  const baseBranchMenuWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && hasWorkspace) {
      void onRefreshGitBranches();
    }
  }, [hasWorkspace, onRefreshGitBranches, isOpen]);

  useEffect(() => {
    if (!baseBranchMenuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!baseBranchMenuWrapRef.current?.contains(event.target as Node)) {
        setBaseBranchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [baseBranchMenuOpen]);

  const handleSwitchBranch = async (input: WorkspaceGitBranchSwitchInput) => {
    await onSwitchGitBranch(input);
    setPendingBranchAction(undefined);
    onRequestClose();
  };

  const handleCreateBranch = async (input: WorkspaceGitBranchCreateInput) => {
    await onCreateGitBranch(input);
    setPendingBranchAction(undefined);
    onRequestClose();
    setBranchDraft('');
    setBaseBranchDraft('');
  };

  const handleSubmitCreateBranch = async () => {
    const branchName = branchDraft.trim();
    if (!branchName) {
      return;
    }
    const input: WorkspaceGitBranchCreateInput = {
      branchName,
      baseBranch: baseBranchDraft.trim() || undefined,
      allowStash: false,
    };
    const requiresStash =
      hasDirtyChanges && Boolean(input.baseBranch) && input.baseBranch !== currentBranch;
    if (requiresStash) {
      setPendingBranchAction({
        kind: 'create',
        input: { ...input, allowStash: true },
      });
      return;
    }
    await handleCreateBranch(input);
  };

  const baseBranchLabel = useMemo(() => {
    if (!baseBranchDraft.trim()) {
      return t.branchCreateFromCurrent;
    }
    return baseBranchDraft.trim();
  }, [baseBranchDraft, t.branchCreateFromCurrent]);

  return (
    <>
      <TooltipSimple content={gitStatusLabel(t, gitStatus)} placement="top">
        <button type="button" className="adl-statusbar__item adl-statusbar__item--readonly">
          {gitIcon(gitStatus)}
          <span>{gitStatusLabel(t, gitStatus)}</span>
        </button>
      </TooltipSimple>

      <span className="adl-statusbar__sep" aria-hidden="true" />

      <div className="adl-statusbar__slot">
        <TooltipSimple
          content={hasWorkspace ? currentBranch : t.branchDisabledHint}
          placement="top"
        >
          <button
            type="button"
            className="adl-statusbar__item"
            onClick={() => hasWorkspace && onToggle()}
            aria-haspopup="dialog"
            disabled={!hasWorkspace}
          >
            <IconGitBranch size={12} decorative />
            <span>{hasWorkspace ? currentBranch : t.branchGlobalLabel}</span>
          </button>
        </TooltipSimple>
        {isOpen && hasWorkspace ? (
          <div className="adl-statusbar__menu adl-statusbar__menu--branch" role="dialog">
            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-title">{t.gitSummaryBranch}</strong>
              <p className="adl-statusbar__menu-hint">{currentBranch}</p>
            </div>

            {pendingBranchAction ? (
              <div className="adl-statusbar__menu-section adl-statusbar__menu-section--warning">
                <strong className="adl-statusbar__menu-subtitle">
                  {t.branchStashConfirmTitle}
                </strong>
                <p className="adl-statusbar__menu-hint">{t.branchStashConfirmBody}</p>
                <div className="adl-statusbar__menu-actions">
                  <button
                    type="button"
                    className="adl-btn adl-btn--primary adl-btn--sm"
                    onClick={() =>
                      void (pendingBranchAction.kind === 'switch'
                        ? handleSwitchBranch(pendingBranchAction.input)
                        : handleCreateBranch(pendingBranchAction.input))
                    }
                  >
                    <IconCheck size={14} decorative />
                    {t.approve}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--ghost adl-btn--sm"
                    onClick={() => setPendingBranchAction(undefined)}
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-subtitle">{t.branchAvailableTitle}</strong>
              <div className="adl-statusbar__menu-list">
                {gitBranches.map((branch) => (
                  <button
                    key={branch.name}
                    type="button"
                    className={`adl-statusbar__menu-option${branch.isCurrent ? ' is-active' : ''}`}
                    onClick={() => {
                      if (branch.isCurrent) {
                        return;
                      }
                      const input: WorkspaceGitBranchSwitchInput = {
                        branchName: branch.name,
                        allowStash: false,
                      };
                      if (hasDirtyChanges) {
                        setPendingBranchAction({
                          kind: 'switch',
                          input: { ...input, allowStash: true },
                        });
                        return;
                      }
                      void handleSwitchBranch(input);
                    }}
                  >
                    <span className="adl-statusbar__menu-option-main">{branch.name}</span>
                    {branch.isCurrent ? <IconCheck size={14} decorative /> : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-subtitle">{t.branchCreateTitle}</strong>
              <div className="adl-statusbar__menu-row adl-statusbar__menu-row--branch-create">
                <input
                  className="adl-statusbar__input"
                  value={branchDraft}
                  onChange={(event) => setBranchDraft(event.currentTarget.value)}
                  placeholder={t.branchCreatePlaceholder}
                />
                <div className="adl-statusbar__submenu-wrap" ref={baseBranchMenuWrapRef}>
                  <button
                    type="button"
                    className="adl-statusbar__submenu-trigger"
                    data-anchor-name="statusbar-sub-trigger"
                    aria-haspopup="menu"
                    aria-expanded={baseBranchMenuOpen}
                    onClick={() => setBaseBranchMenuOpen((current) => !current)}
                  >
                    <span className="adl-statusbar__submenu-label">{baseBranchLabel}</span>
                    <IconChevronRight size={14} decorative />
                  </button>
                  {baseBranchMenuOpen ? (
                    <div
                      className="adl-statusbar__submenu"
                      role="menu"
                      aria-label={t.branchCreateFromCurrent}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className={`adl-statusbar__menu-option${!baseBranchDraft.trim() ? ' is-active' : ''}`}
                        onClick={() => {
                          setBaseBranchDraft('');
                          setBaseBranchMenuOpen(false);
                        }}
                      >
                        <span className="adl-statusbar__menu-option-main">
                          {t.branchCreateFromCurrent}
                        </span>
                        {!baseBranchDraft.trim() ? <IconCheck size={14} decorative /> : null}
                      </button>
                      {gitBranches.map((branch) => (
                        <button
                          key={branch.name}
                          type="button"
                          role="menuitem"
                          className={`adl-statusbar__menu-option${baseBranchDraft === branch.name ? ' is-active' : ''}`}
                          onClick={() => {
                            setBaseBranchDraft(branch.name);
                            setBaseBranchMenuOpen(false);
                          }}
                        >
                          <span className="adl-statusbar__menu-option-main">{branch.name}</span>
                          {baseBranchDraft === branch.name ? (
                            <IconCheck size={14} decorative />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="adl-statusbar__menu-actions">
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--sm"
                  onClick={() => void handleSubmitCreateBranch()}
                  disabled={!branchDraft.trim()}
                >
                  <IconPlus size={14} decorative />
                  {t.branchCreateAction}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
});

export { StatusBarGitInfo };
export type { StatusBarGitInfoProps };
