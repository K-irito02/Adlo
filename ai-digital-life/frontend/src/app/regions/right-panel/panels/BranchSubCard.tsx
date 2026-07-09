import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconChevronRight, IconGitBranch } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import type { GitBranchSummary } from '@ai-digital-life/kernel';

interface BranchSubCardProps {
  subRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (branchName: string) => void;
  workspacePath?: string;
  onSubEnter?: () => void;
}

export function BranchSubCard({
  subRef,
  isOpen,
  onOpenChange,
  onSelect,
  workspacePath,
  onSubEnter,
}: BranchSubCardProps) {
  const { t } = useTCopy();
  const [branchSearch, setBranchSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [localBranches, setLocalBranches] = useState<GitBranchSummary[] | null>(null);

  const storeBranches = useAppStore((s) => s.gitBranches);
  const switchGitBranch = useAppStore((s) => s.switchGitBranch);
  const fetchGitBranches = useAppStore((s) => s.fetchGitBranches);
  const gitSnapshot = useAppStore((s) => s.gitSnapshot);
  const currentBranch = gitSnapshot?.branch ?? '';

  const gitBranches = localBranches ?? storeBranches;

  useEffect(() => {
    if (isOpen) {
      if (workspacePath) {
        window.digitalLife.workspace.listGitBranches(workspacePath).then((result) => {
          if (result.ok) {
            setLocalBranches(result.data);
          }
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
    }
  }, [isOpen]);

  const filteredBranches = useMemo(() => {
    const q = branchSearch.toLowerCase().trim();
    if (!q) {
      return gitBranches;
    }
    return gitBranches.filter((b) => b.name.toLowerCase().includes(q));
  }, [gitBranches, branchSearch]);

  const handleSelect = useCallback(
    (branchName: string) => {
      onSelect?.(branchName);
      onOpenChange(false);
      switchGitBranch({ branchName, allowStash: false });
    },
    [onSelect, onOpenChange, switchGitBranch]
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
      onMouseLeave={() => onOpenChange(false)}
    >
      <div className="adl-changes-branch-search">
        <input
          ref={searchInputRef}
          type="text"
          value={branchSearch}
          onChange={(e) => setBranchSearch(e.currentTarget.value)}
          placeholder={t.changesBranchSearch as string}
          aria-label={t.changesBranchSearch as string}
        />
      </div>
      <div className="adl-changes-branch-list">
        {filteredBranches.length === 0 ? (
          <div className="adl-changes-branch-empty">{t.noResults}</div>
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
              {branch.name === currentBranch ? <IconCheck size={14} decorative /> : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function BranchMenuItem({
  isSubOpen,
  onSubOpenChange,
  onSelect,
  workspacePath,
  currentBranch,
}: {
  isSubOpen: boolean;
  onSubOpenChange: (open: boolean) => void;
  onSelect?: (branchName: string) => void;
  workspacePath?: string;
  currentBranch?: string;
}) {
  const { t } = useTCopy();
  const subRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [isOnWrapper, setIsOnWrapper] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  const handleMenuEnter = () => {
    setIsOnWrapper(true);
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    onSubOpenChange(true);
    setHovered(true);
  };

  const handleMenuLeave = (e: React.MouseEvent) => {
    setIsOnWrapper(false);
    const related = e.relatedTarget as Node | null;
    if (subRef.current?.contains(related)) {
      return;
    }
    leaveTimerRef.current = setTimeout(() => {
      onSubOpenChange(false);
      setHovered(false);
      leaveTimerRef.current = null;
    }, 200);
  };

  const handleSubEnter = () => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const handleSubLeave = () => {
    onSubOpenChange(false);
    setHovered(false);
  };

  const label =
    isOnWrapper || (!isSubOpen && hovered)
      ? t.changesBranchSwitch
      : currentBranch || t.changesBranchSwitch;

  return (
    <div
      className="adl-multitree-entry__menu-item--with-sub"
      data-anchor-name="branch-sub-trigger"
      onMouseEnter={handleMenuEnter}
      onMouseLeave={handleMenuLeave}
    >
      <IconGitBranch size={14} decorative />
      <span className="adl-multitree-entry__menu-item-content">
        <span className="adl-multitree-entry__menu-item-label">{label}</span>
      </span>
      <span className="adl-multitree-entry__menu-item-arrow">
        <IconChevronRight size={14} decorative />
      </span>
      <BranchSubCard
        subRef={subRef}
        isOpen={isSubOpen}
        onOpenChange={handleSubLeave}
        onSelect={onSelect}
        onSubEnter={handleSubEnter}
        workspacePath={workspacePath}
      />
    </div>
  );
}
