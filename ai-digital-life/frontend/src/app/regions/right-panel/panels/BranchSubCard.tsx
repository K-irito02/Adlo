import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconChevronRight, IconGitBranch, IconPendingCommit } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { SearchInput } from '@components/SearchInput';
import { Spinner } from '@components/Spinner';
import { CopyButton } from '@components/CopyButton';
import { useStashConfirm } from '@hooks/useStashConfirm';
import type { GitBranchSummary } from '@ai-digital-life/kernel';

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

  const storeBranches = useAppStore((s) => s.gitBranches);
  const switchGitBranch = useAppStore((s) => s.switchGitBranch);
  const fetchGitBranches = useAppStore((s) => s.fetchGitBranches);
  const gitSnapshot = useAppStore((s) => s.gitSnapshot);
  const currentBranch = gitSnapshot?.branch ?? '';
  const openWorkspace = useAppStore((s) => s.openWorkspace);
  const currentWorkspacePath = useAppStore((s) => s.appInfo?.currentWorkspace?.path);

  const { needsConfirm, confirm, cancel, initiateSwitch } = useStashConfirm({
    snapshot: gitSnapshot,
    onConfirm: async (action) => {
      if (action.kind === 'switch') {
        if (workspacePath && workspacePath !== currentWorkspacePath) {
          await openWorkspace(workspacePath);
        }
        await switchGitBranch(action.input);
      }
      onOpenChange(false);
    },
  });

  const gitBranches = useMemo(
    () => (workspacePath ? (localBranches ?? []) : (localBranches ?? storeBranches)),
    [workspacePath, localBranches, storeBranches]
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
    }
  }, [isOpen]);

  const localCount = useMemo(() => gitBranches.filter(b => b.local).length, [gitBranches]);
  const remoteCount = useMemo(() => gitBranches.filter(b => b.remote).length, [gitBranches]);

  const filteredBranches = useMemo(() => {
    let result = gitBranches;
    const q = branchSearch.toLowerCase().trim();
    if (q) {
      result = result.filter((b) => b.name.toLowerCase().includes(q));
    }
    const bothActive = localFilterActive && remoteFilterActive;
    const noneActive = !localFilterActive && !remoteFilterActive;
    if (!bothActive && !noneActive) {
      if (localFilterActive) result = result.filter(b => b.local);
      if (remoteFilterActive) result = result.filter(b => b.remote);
    }
    return result;
  }, [gitBranches, branchSearch, localFilterActive, remoteFilterActive]);

  const isRepo = isRepoProp ?? (gitBranches.length > 0 || !!currentBranch);

  const handleSelect = useCallback(async (branchName: string) => {
    onSelect?.(branchName);
    initiateSwitch({ branchName, allowStash: false });
  }, [onSelect, initiateSwitch]);

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
          onClick={() => setLocalFilterActive(v => !v)}
          aria-pressed={localFilterActive}
        >
          <span className="adl-changes-branch-filter-label">{t.changesBranchLocal}</span>
          <strong className="adl-changes-branch-filter-value">
            <span className="adl-changes-branch-filter-code" aria-hidden="true">L:</span>
            {localCount}
          </strong>
        </button>
        <button
          type="button"
          className={`adl-changes-branch-filter${remoteFilterActive ? ' is-active' : ''}`}
          onClick={() => setRemoteFilterActive(v => !v)}
          aria-pressed={remoteFilterActive}
        >
          <span className="adl-changes-branch-filter-label">{t.changesBranchRemote}</span>
          <strong className="adl-changes-branch-filter-value">
            <span className="adl-changes-branch-filter-code" aria-hidden="true">R:</span>
            {remoteCount}
          </strong>
        </button>
      </div>
      <div className="adl-changes-branch-list">
        {isLoadingBranches ? (
          <div className="adl-changes-branch-loading">
            <Spinner size="sm" />
          </div>
        ) : !isRepo ? (
          <div className="adl-changes-branch-empty">{t.changesBranchInitRepo}</div>
        ) : gitBranches.length <= 1 && !branchSearch ? (
          <div className="adl-changes-branch-empty">{t.changesBranchNoOther}</div>
        ) : filteredBranches.length === 0 && branchSearch ? (
          <div className="adl-changes-branch-empty">{t.changesBranchSearchNone}</div>
        ) : (
          filteredBranches.map((branch) => (
            <button
              key={branch.name}
              type="button"
              role="menuitemradio"
              aria-checked={branch.name === currentBranch}
              className={`adl-changes-branch-item${branch.name === currentBranch ? ' is-current' : ''}`}
              onClick={() => handleSelect(branch.name)}
              title={branch.name}
            >
              <span className="adl-changes-branch-item-name">{branch.name}</span>
              {branch.name === currentBranch ? <IconCheck size={14} decorative /> : null}
              {branch.hasStash ? <IconPendingCommit size={14} decorative /> : null}
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
              <CopyButton text={branch.name} size={12} />
            </button>
          ))
        )}
      </div>
      {needsConfirm ? (
        <div className="adl-changes-branch-confirm">
          <p>{t.changesBranchStashConfirm}</p>
          <div className="adl-changes-branch-confirm-actions">
            <button type="button" className="adl-btn adl-btn--primary adl-btn--sm" onClick={confirm}>
              {t.approve}
            </button>
            <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={cancel}>
              {t.cancel}
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
      data-anchor-name="branch-sub-trigger"
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
