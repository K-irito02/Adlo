import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck,
  IconChevronRight,
  IconGitBranch,
  IconPendingCommit,
  IconBranchAhead,
  IconBranchBehind,
  IconBranchDiverged,
} from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { SearchInput } from '@components/SearchInput';
import { TooltipSimple } from '@components/Tooltip';
import { CopyButton } from '@components/CopyButton';
import { LoadingRow, EmptyRow } from '@components/LoadingRow';
import type { GitBranchSummary, GitSwitchMode } from '@ai-digital-life/kernel';

interface BranchSubCardProps {
  subRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (branchName: string) => void;
  workspacePath?: string;
  onSubEnter?: () => void;
  onSubLeave?: () => void;
  isRepo?: boolean;
}

interface ModeFlow {
  branch: string;
  step: 'choose' | 'confirmRemote' | 'confirmStash';
  mode: GitSwitchMode;
  divergeStatus?: GitBranchSummary['divergeStatus'];
}

function needsModeChoice(branch: GitBranchSummary): boolean {
  return (
    branch.local &&
    branch.remote &&
    (branch.divergeStatus === 'behind' || branch.divergeStatus === 'diverged')
  );
}

export function BranchSubCard({
  subRef,
  isOpen,
  onOpenChange,
  onSelect,
  workspacePath,
  onSubEnter,
  onSubLeave,
  isRepo: isRepoProp,
}: BranchSubCardProps) {
  const { t } = useTCopy();
  const [branchSearch, setBranchSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [localBranches, setLocalBranches] = useState<GitBranchSummary[] | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [localFilterActive, setLocalFilterActive] = useState(false);
  const [remoteFilterActive, setRemoteFilterActive] = useState(false);
  const [modeFlow, setModeFlow] = useState<ModeFlow | null>(null);
  const [busyBranch, setBusyBranch] = useState<string | null>(null);
  // P4 N1：state 提交异步，同 tick 双击看不到 busy——ref 级同步锁双保险。
  const busyRef = useRef(false);

  const storeBranches = useAppStore((s) => s.gitBranches);
  const ensureBranchWorktree = useAppStore((s) => s.ensureBranchWorktree);
  const fetchGitBranches = useAppStore((s) => s.fetchGitBranches);
  const gitSnapshot = useAppStore((s) => s.gitSnapshot);
  const currentBranch = gitSnapshot?.branch ?? '';

  const hasDirtyChanges =
    (gitSnapshot?.staged.length ?? 0) > 0 ||
    (gitSnapshot?.unstaged.length ?? 0) > 0 ||
    (gitSnapshot?.untracked.length ?? 0) > 0;

  const gitBranches = useMemo(
    () => (workspacePath ? (localBranches ?? []) : (localBranches ?? storeBranches)),
    [workspacePath, localBranches, storeBranches],
  );

  useEffect(() => {
    if (isOpen) {
      if (workspacePath) {
        setIsLoadingBranches(true);
        window.digitalLife.workspace.listGitBranches(workspacePath).then((result) => {
          if (result.ok) {
            setLocalBranches(result.data);
          }
          setIsLoadingBranches(false);
        });
      } else {
        fetchGitBranches();
      }
    }
  }, [isOpen, fetchGitBranches, workspacePath]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setBranchSearch('');
      setLocalBranches(null);
      setIsLoadingBranches(false);
      setModeFlow(null);
      setBusyBranch(null);
      busyRef.current = false;
    }
  }, [isOpen]);

  // P4 F6：确认面板打开时 Escape 等价取消（焦点由 autoFocus 送入批准按钮）。
  useEffect(() => {
    if (!modeFlow || modeFlow.step === 'choose') {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setModeFlow(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [modeFlow]);

  const localCount = useMemo(() => gitBranches.filter((b) => b.local).length, [gitBranches]);
  const remoteCount = useMemo(() => gitBranches.filter((b) => b.remote).length, [gitBranches]);

  const filteredBranches = useMemo(() => {
    let result = gitBranches;
    const q = branchSearch.toLowerCase().trim();
    if (q) {
      result = result.filter((b) => b.name.toLowerCase().includes(q));
    }
    const bothActive = localFilterActive && remoteFilterActive;
    const noneActive = !localFilterActive && !remoteFilterActive;
    if (!bothActive && !noneActive) {
      if (localFilterActive) {
        result = result.filter((b) => b.local);
      }
      if (remoteFilterActive) {
        result = result.filter((b) => b.remote);
      }
    }
    return result;
  }, [gitBranches, branchSearch, localFilterActive, remoteFilterActive]);

  const isRepo = isRepoProp ?? (gitBranches.length > 0 || !!currentBranch);

  const doEnsure = useCallback(
    async (branchName: string, mode: GitSwitchMode, allowStash: boolean) => {
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      setBusyBranch(branchName);
      try {
        const path = await ensureBranchWorktree({ branchName, mode, allowStash }, workspacePath);
        if (path) {
          onSelect?.(branchName);
          setModeFlow(null);
          onOpenChange(false);
          return;
        }
        // 失败已进 errorToasts；仅 Dirty 可重试，其余保持列表可视。
        // P4 F3：worktree 流程不碰源目录，Dirty 只可能是目标 worktree（大小写无关匹配；
        // 后端文案若改写/i18n 化，此重试即失效，届时需结构化错误码——见注释，不静默。
        const toasts = useAppStore.getState().errorToasts;
        const lastGitError = [...toasts].reverse().find((entry) => entry.scope === 'git');
        if (lastGitError?.detail.toLowerCase().includes('dirty worktree')) {
          setModeFlow({ branch: branchName, step: 'confirmStash', mode });
        }
      } finally {
        busyRef.current = false;
        setBusyBranch(null);
      }
    },
    [ensureBranchWorktree, workspacePath, onSelect, onOpenChange],
  );

  const handleSelect = useCallback(
    (branch: GitBranchSummary) => {
      if (branch.name === currentBranch || busyBranch) {
        return;
      }
      if (needsModeChoice(branch)) {
        setModeFlow({
          branch: branch.name,
          step: 'choose',
          mode: 'local',
          divergeStatus: branch.divergeStatus,
        });
        return;
      }
      void doEnsure(branch.name, 'local', false);
    },
    [currentBranch, busyBranch, doEnsure],
  );

  const divergeHint = useCallback(
    (branch: GitBranchSummary): string => {
      const ahead = branch.ahead ?? 0;
      const behind = branch.behind ?? 0;
      switch (branch.divergeStatus) {
        case 'ahead':
          return `${t.changesBranchAhead as string} ↑${ahead}`;
        case 'behind':
          return `${t.changesBranchBehind as string} ↓${behind}`;
        case 'diverged':
          return `${t.changesBranchDiverged as string} ↑${ahead} ↓${behind}`;
        case 'synced':
          return t.changesBranchSynced as string;
        default:
          return branch.upstream ?? branch.name;
      }
    },
    [t],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={subRef}
      className="adl-changes-branch-submenu"
      role="menu"
      onMouseEnter={onSubEnter}
      onMouseLeave={onSubLeave ?? (() => onOpenChange(false))}
    >
      <div className="adl-changes-branch-search">
        <SearchInput
          value={branchSearch}
          onChange={setBranchSearch}
          placeholder={t.changesBranchSearch as string}
          ariaLabel={t.changesBranchSearch as string}
          inputRef={searchInputRef}
        />
      </div>
      <div className="adl-changes-branch-filters">
        <button
          type="button"
          className={`adl-changes-branch-filter${localFilterActive ? ' is-active' : ''}`}
          onClick={() => setLocalFilterActive((v) => !v)}
          aria-pressed={localFilterActive}
        >
          <span className="adl-changes-branch-filter-label">{t.changesBranchLocal}</span>
          <strong className="adl-changes-branch-filter-value">
            <span className="adl-changes-branch-filter-code" aria-hidden="true">
              L:
            </span>
            {localCount}
          </strong>
        </button>
        <button
          type="button"
          className={`adl-changes-branch-filter${remoteFilterActive ? ' is-active' : ''}`}
          onClick={() => setRemoteFilterActive((v) => !v)}
          aria-pressed={remoteFilterActive}
        >
          <span className="adl-changes-branch-filter-label">{t.changesBranchRemote}</span>
          <strong className="adl-changes-branch-filter-value">
            <span className="adl-changes-branch-filter-code" aria-hidden="true">
              R:
            </span>
            {remoteCount}
          </strong>
        </button>
      </div>
      <div className="adl-changes-branch-list">
        {isLoadingBranches ? (
          <LoadingRow variant="center" />
        ) : !isRepo ? (
          <EmptyRow variant="center" message={t.changesBranchInitRepo as string} />
        ) : gitBranches.length <= 1 && !branchSearch ? (
          <EmptyRow variant="center" message={t.changesBranchNoOther as string} />
        ) : filteredBranches.length === 0 && branchSearch ? (
          <EmptyRow variant="center" message={t.changesBranchSearchNone as string} />
        ) : (
          filteredBranches.map((branch) => (
            <button
              key={branch.name}
              type="button"
              role="menuitemradio"
              aria-checked={branch.name === currentBranch}
              className={`adl-changes-branch-item${branch.name === currentBranch ? ' is-current' : ''}`}
              onClick={() => handleSelect(branch)}
              title={branch.name}
              disabled={busyBranch !== null}
            >
              <span className="adl-changes-branch-item-name">{branch.name}</span>
              {branch.name === currentBranch ? <IconCheck size={14} decorative /> : null}
              {branch.divergeStatus === 'ahead' ? (
                <TooltipSimple content={divergeHint(branch)} placement="top">
                  <span
                    className="adl-changes-branch-diverge"
                    role="img"
                    aria-label={divergeHint(branch)}
                  >
                    <IconBranchAhead size={14} decorative />
                  </span>
                </TooltipSimple>
              ) : null}
              {branch.divergeStatus === 'behind' ? (
                <TooltipSimple content={divergeHint(branch)} placement="top">
                  <span
                    className="adl-changes-branch-diverge"
                    role="img"
                    aria-label={divergeHint(branch)}
                  >
                    <IconBranchBehind size={14} decorative />
                  </span>
                </TooltipSimple>
              ) : null}
              {branch.divergeStatus === 'diverged' ? (
                <TooltipSimple content={divergeHint(branch)} placement="top">
                  <span
                    className="adl-changes-branch-diverge"
                    role="img"
                    aria-label={divergeHint(branch)}
                  >
                    <IconBranchDiverged size={14} decorative />
                  </span>
                </TooltipSimple>
              ) : null}
              {branch.hasStash || (branch.name === currentBranch && hasDirtyChanges) ? (
                <TooltipSimple
                  content={
                    branch.hasStash
                      ? (t.changesBranchStashCount as string).replace(
                          '{count}',
                          String(branch.stashCount ?? 1),
                        )
                      : (t.changesPendingCommit as string)
                  }
                  placement="top"
                >
                  <span
                    className="adl-icon-pending-commit"
                    role="img"
                    aria-label={
                      branch.hasStash
                        ? (t.changesBranchStashCount as string).replace(
                            '{count}',
                            String(branch.stashCount ?? 1),
                          )
                        : (t.changesPendingCommit as string)
                    }
                  >
                    <IconPendingCommit size={14} decorative />
                  </span>
                </TooltipSimple>
              ) : null}
              {branch.local ? (
                <span className="adl-changes-branch-badge adl-changes-branch-badge--local">
                  {t.changesBranchLocal}
                </span>
              ) : null}
              {branch.remote ? (
                <span className="adl-changes-branch-badge adl-changes-branch-badge--remote">
                  {t.changesBranchRemote}
                </span>
              ) : null}
              {branch.worktreePath ? (
                <TooltipSimple content={t.changesBranchWorktree as string} placement="top">
                  <span
                    className="adl-changes-branch-badge adl-changes-branch-badge--worktree"
                    role="img"
                    aria-label={t.changesBranchWorktree as string}
                  >
                    <IconGitBranch size={12} decorative />
                  </span>
                </TooltipSimple>
              ) : null}
              <CopyButton text={branch.name} size={12} />
            </button>
          ))
        )}
      </div>
      {modeFlow?.step === 'choose' ? (
        <div className="adl-changes-branch-mode">
          <p>
            {modeFlow.branch} ·{' '}
            {modeFlow.divergeStatus === 'behind'
              ? (t.changesBranchBehind as string)
              : (t.changesBranchDiverged as string)}
          </p>
          <div className="adl-changes-branch-mode-actions">
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              disabled={busyBranch !== null}
              onClick={() => void doEnsure(modeFlow.branch, 'local', false)}
            >
              {t.changesBranchSwitchLocal as string}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              disabled={busyBranch !== null}
              onClick={() => setModeFlow({ ...modeFlow, step: 'confirmRemote', mode: 'remote' })}
            >
              {t.changesBranchSwitchRemote as string}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              disabled={busyBranch !== null}
              onClick={() => void doEnsure(modeFlow.branch, 'sync', false)}
            >
              {t.changesBranchSwitchSync as string}
            </button>
          </div>
          <div className="adl-changes-branch-mode-row">
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={() => setModeFlow(null)}
            >
              {t.cancel as string}
            </button>
          </div>
        </div>
      ) : null}
      {modeFlow?.step === 'confirmRemote' ? (
        <div
          className="adl-changes-branch-confirm"
          role="alertdialog"
          aria-modal="false"
          aria-label={t.changesBranchRemoteConfirm as string}
        >
          <p>{t.changesBranchRemoteConfirm as string}</p>
          <div className="adl-changes-branch-confirm-actions">
            <button
              type="button"
              className="adl-btn adl-btn--primary adl-btn--sm"
              disabled={busyBranch !== null}
              autoFocus
              onClick={() => void doEnsure(modeFlow.branch, 'remote', false)}
            >
              {t.approve as string}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={() => setModeFlow({ ...modeFlow, step: 'choose', mode: 'local' })}
            >
              {t.cancel as string}
            </button>
          </div>
        </div>
      ) : null}
      {modeFlow?.step === 'confirmStash' ? (
        <div
          className="adl-changes-branch-confirm"
          role="alertdialog"
          aria-modal="false"
          aria-label={t.changesBranchTargetStashConfirm as string}
        >
          <p>{t.changesBranchTargetStashConfirm as string}</p>
          <div className="adl-changes-branch-confirm-actions">
            <button
              type="button"
              className="adl-btn adl-btn--primary adl-btn--sm"
              disabled={busyBranch !== null}
              autoFocus
              onClick={() => void doEnsure(modeFlow.branch, modeFlow.mode, true)}
            >
              {t.approve as string}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={() => setModeFlow(null)}
            >
              {t.cancel as string}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BranchMenuItem({
  isSubOpen,
  onSubOpenChange,
  onSelect,
  workspacePath,
  currentBranch,
  isRepo,
}: {
  isSubOpen: boolean;
  onSubOpenChange: (open: boolean) => void;
  onSelect?: (branchName: string) => void;
  workspacePath?: string;
  currentBranch?: string;
  isRepo?: boolean;
}) {
  const { t } = useTCopy();
  const subRef = useRef<HTMLDivElement | null>(null);
  const [isOnWrapper, setIsOnWrapper] = useState(false);
  const [isOnSub, setIsOnSub] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  const clearLeaveTimer = () => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const handleMenuEnter = () => {
    setIsOnWrapper(true);
    setIsOnSub(false);
    clearLeaveTimer();
    onSubOpenChange(true);
  };

  const handleMenuLeave = (e: React.MouseEvent) => {
    setIsOnWrapper(false);
    const related = e.relatedTarget as Node | null;
    if (subRef.current?.contains(related)) {
      return;
    }
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      onSubOpenChange(false);
      setIsOnSub(false);
      leaveTimerRef.current = null;
    }, 200);
  };

  const handleSubEnter = () => {
    setIsOnSub(true);
    clearLeaveTimer();
  };

  const handleSubLeave = () => {
    setIsOnSub(false);
  };

  const handleSubClose = () => {
    clearLeaveTimer();
    onSubOpenChange(false);
    setIsOnSub(false);
  };

  return (
    <div
      className="adl-multitree-entry__menu-item--with-sub"
      onMouseEnter={handleMenuEnter}
      onMouseLeave={handleMenuLeave}
    >
      <IconGitBranch size={14} decorative />
      <span className="adl-multitree-entry__menu-item-content">
        <span className="adl-multitree-entry__menu-item-label adl-multitree-entry__menu-item-label--dual">
          <span
            className="adl-multitree-entry__menu-item-label-text"
            data-active={isOnWrapper && !isOnSub}
          >
            {t.changesBranchSwitch}
          </span>
          <span
            className="adl-multitree-entry__menu-item-label-text"
            data-active={!(isOnWrapper && !isOnSub)}
          >
            {currentBranch || t.changesBranchSwitch}
          </span>
        </span>
      </span>
      <span className="adl-multitree-entry__menu-item-arrow">
        <IconChevronRight size={14} decorative />
      </span>
      <BranchSubCard
        subRef={subRef}
        isOpen={isSubOpen}
        onOpenChange={handleSubClose}
        onSelect={onSelect}
        onSubEnter={handleSubEnter}
        onSubLeave={handleSubLeave}
        workspacePath={workspacePath}
        isRepo={isRepo}
      />
    </div>
  );
}
