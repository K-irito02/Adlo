import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconChevronRight, IconGitBranch } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import type { GitBranchSummary } from '@ai-digital-life/kernel';

interface BranchSubCardProps {
  subRef: React.RefObject<HTMLDivElement | null>;
  triggerRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (branchName: string) => void;
  workspacePath?: string;
}

export function BranchSubCard({
  subRef,
  triggerRef,
  isOpen,
  onOpenChange,
  onSelect,
  workspacePath,
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
      onMouseLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        if (triggerRef.current?.contains(related)) {
          return;
        }
        onOpenChange(false);
      }}
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
  triggerRef,
  isSubOpen,
  onSubOpenChange,
  onSelect,
  workspacePath,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  isSubOpen: boolean;
  onSubOpenChange: (open: boolean) => void;
  onSelect?: (branchName: string) => void;
  workspacePath?: string;
}) {
  const { t } = useTCopy();
  const subRef = useRef<HTMLDivElement | null>(null);

  const handleMenuEnter = () => {
    onSubOpenChange(true);
  };

  const handleMenuLeave = (e: React.MouseEvent) => {
    const related = e.relatedTarget as Node | null;
    if (subRef.current?.contains(related)) {
      return;
    }
    onSubOpenChange(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        className="adl-menu__item adl-multitree-entry__menu-item--with-sub"
        onMouseEnter={handleMenuEnter}
        onMouseLeave={handleMenuLeave}
        aria-haspopup="menu"
        aria-expanded={isSubOpen}
      >
        <IconGitBranch size={14} decorative />
        <span className="adl-multitree-entry__menu-item-content">
          <span className="adl-multitree-entry__menu-item-label">{t.changesBranchSwitch}</span>
          <span className="adl-multitree-entry__menu-item-arrow">
            <IconChevronRight size={14} decorative />
          </span>
        </span>
      </button>
      <BranchSubCard
        subRef={subRef}
        triggerRef={triggerRef}
        isOpen={isSubOpen}
        onOpenChange={onSubOpenChange}
        onSelect={onSelect}
        workspacePath={workspacePath}
      />
    </>
  );
}
