import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  IconChevronDown,
  IconFileText,
  IconGitBranch,
  IconMoreVertical,
  IconPanelLeftClose,
  IconUpload
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore } from "../../ui-store";
import type { RightPanelViewProps } from "./types";
import { countGitChanges } from "./types";

const CHANGES_BRANCH_STORAGE_KEY = "adl-ui:changes-branch";
const FALLBACK_BRANCHES = ["main", "develop", "release/0.1.0", "feature/right-panel"];

function groupGitFiles(paths: string[]) {
  return [...paths].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function readSelectedBranch(initialBranch: string): string {
  try {
    return window.localStorage.getItem(CHANGES_BRANCH_STORAGE_KEY)?.trim() || initialBranch;
  } catch {
    return initialBranch;
  }
}

function writeSelectedBranch(branch: string) {
  try {
    window.localStorage.setItem(CHANGES_BRANCH_STORAGE_KEY, branch);
  } catch {
    // ignore local preview persistence failures
  }
}

export function ChangesPanel(props: RightPanelViewProps) {
  const { t, appInfo, activePatchSet, latestPatchApplication, onOpenFile, onSetHunkDecision, onApplyPatchSet, onRollbackPatchSet } =
    props;
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.changes);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const changesNavigatorWidth = useUiStore((state) => state.changesNavigatorWidth);
  const setChangesNavigatorWidth = useUiStore((state) => state.setChangesNavigatorWidth);
  const snapshot = props.gitSnapshot ?? appInfo?.currentWorkspace?.gitSnapshot;
  const fallbackBranch = snapshot?.branch ?? "main";
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [changesMenuOpen, setChangesMenuOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(() => readSelectedBranch(fallbackBranch));
  const branchMenuRef = useRef<HTMLDivElement | null>(null);
  const changesMenuRef = useRef<HTMLDivElement | null>(null);
  const validation = latestPatchApplication?.validation;
  const patchFile = activePatchSet?.filePatches[0];
  const changedGroups = useMemo(
    () =>
      [
        { key: "staged", label: t.changesStaged, paths: groupGitFiles(snapshot?.staged ?? []) },
        { key: "changes", label: t.changesModified, paths: groupGitFiles(snapshot?.unstaged ?? []) },
        { key: "untracked", label: t.changesUntracked, paths: groupGitFiles(snapshot?.untracked ?? []) },
        { key: "conflicts", label: t.changesConflicts, paths: groupGitFiles(snapshot?.conflicts ?? []) }
      ].filter((group) => group.paths.length > 0),
    [snapshot, t.changesConflicts, t.changesModified, t.changesStaged, t.changesUntracked]
  );
  const branchOptions = useMemo(() => {
    const options = new Set<string>([fallbackBranch, ...FALLBACK_BRANCHES]);
    return [...options];
  }, [fallbackBranch]);
  const changesMenuItems = [
    { id: "stage-all", label: t.changesStageAll, disabled: true },
    { id: "unstage-all", label: t.changesUnstageAll, disabled: true },
    { id: "commit", label: t.changesCommit, disabled: true },
    { id: "push", label: t.changesPush, disabled: true },
    { id: "pull", label: t.changesPull, disabled: true },
    { id: "sep-1", separator: true },
    { id: "discard-all", label: t.changesDiscardAll, disabled: true }
  ];

  useEffect(() => {
    if (!branchOptions.includes(selectedBranch)) {
      setSelectedBranch(fallbackBranch);
      writeSelectedBranch(fallbackBranch);
    }
  }, [branchOptions, fallbackBranch, selectedBranch]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!branchMenuRef.current?.contains(target)) {
        setBranchMenuOpen(false);
      }
      if (!changesMenuRef.current?.contains(target)) {
        setChangesMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const handleNavigatorResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = changesNavigatorWidth;
    const body = document.body;
    body.classList.add("adl-is-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setChangesNavigatorWidth(startWidth + delta);
    };

    const handleUp = () => {
      body.classList.remove("adl-is-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <div className="adl-tool-panel adl-tool-panel--changes">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolChanges}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => toggleNavigator("changes")}
              aria-label={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft}
            >
              <IconPanelLeftClose size={14} decorative />
            </button>
          </TooltipSimple>
          <div ref={branchMenuRef} className="adl-menu adl-file-context__menu">
            <TooltipSimple content={t.changesSummaryBranch} placement="top">
              <button
                type="button"
                className={`adl-branch-pill adl-branch-pill--button${branchMenuOpen ? " is-open" : ""}`}
                onClick={() => setBranchMenuOpen((value) => !value)}
                aria-label={t.changesSummaryBranch}
                aria-haspopup="menu"
                aria-expanded={branchMenuOpen}
              >
                <IconGitBranch size={12} decorative />
                <span>{selectedBranch}</span>
                <IconChevronDown size={12} decorative />
              </button>
            </TooltipSimple>
            {branchMenuOpen ? (
              <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
                {branchOptions.map((branch) => (
                  <TooltipSimple key={branch} content={branch} placement="right">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={branch === selectedBranch}
                      className="adl-menu__item"
                      onClick={() => {
                        setSelectedBranch(branch);
                        writeSelectedBranch(branch);
                        setBranchMenuOpen(false);
                      }}
                    >
                      <span className="adl-menu__label adl-menu__label--branch">{branch}</span>
                    </button>
                  </TooltipSimple>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TooltipSimple content={t.changesPush} placement="top">
            <button type="button" className="adl-tool-context__iconbtn" disabled aria-label={t.changesPush}>
              <IconUpload size={14} decorative />
            </button>
          </TooltipSimple>
          <div ref={changesMenuRef} className="adl-menu adl-file-context__menu">
            <TooltipSimple content={t.changesMoreActions} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn${changesMenuOpen ? " is-open" : ""}`}
                onClick={() => setChangesMenuOpen((value) => !value)}
                aria-label={t.changesMoreActions}
                aria-haspopup="menu"
                aria-expanded={changesMenuOpen}
              >
                <IconMoreVertical size={14} decorative />
              </button>
            </TooltipSimple>
            {changesMenuOpen ? (
              <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
                {changesMenuItems.map((item) =>
                  "separator" in item ? (
                    <div key={item.id} className="adl-menu__sep" role="separator" />
                  ) : (
                    <button key={item.id} type="button" role="menuitem" className="adl-menu__item" disabled={item.disabled}>
                      <span>{item.label}</span>
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}
        style={{ "--adl-files-nav-width": `${changesNavigatorWidth}px` } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator" aria-label={t.toolChanges}>
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <IconGitBranch size={14} decorative />
              <span className="adl-tool-navigator__context-title">{t.toolChanges}</span>
            </div>
            <span className="adl-tool-navigator__meta">{countGitChanges(snapshot)}</span>
          </div>

          {changedGroups.length > 0 ? (
            <div className="adl-navigator-groups">
              {changedGroups.map((group) => (
                <section key={group.key} className="adl-navigator-group">
                  <header>
                    <strong>{group.label}</strong>
                    <span>{group.paths.length}</span>
                  </header>
                  <ul className="adl-tool-list">
                    {group.paths.map((entry) => (
                      <li key={entry}>
                        <button type="button" className="adl-tool-list__item" onClick={() => onOpenFile(entry)}>
                          <span className="adl-tool-list__title">{entry}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
          <div
            className="adl-tool-navigator__resize-handle"
            onPointerDown={handleNavigatorResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize changes navigator"
            aria-valuemin={180}
            aria-valuemax={300}
            aria-valuenow={changesNavigatorWidth}
          />
        </aside>

        <div className="adl-tool-primary adl-tool-primary--scrollable">
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--changes">
            {validation ? (
              <div className="adl-banner adl-banner--info">
                <strong>{validation.status}</strong>
                <span>{validation.summary}</span>
                {latestPatchApplication?.rolledBack ? <span className="adl-chip adl-chip--warning">{t.changesRolledBack}</span> : null}
                {latestPatchApplication?.patchSet.status === "applied" ? <span className="adl-chip adl-chip--success">{t.changesApplied}</span> : null}
              </div>
            ) : null}

            {patchFile ? (
              <article className="adl-patch-card">
                <header>
                  <IconFileText size={14} decorative />
                  <span>{patchFile.relativePath}</span>
                  <span className="adl-chip adl-chip--info">
                    +{patchFile.afterContent.split("\n").length} -{patchFile.beforeContent.split("\n").length}
                  </span>
                </header>
                {patchFile.hunks.map((hunk) => (
                  <div key={hunk.id} className="adl-hunk">
                    <p>{hunk.preview}</p>
                    <pre>{hunk.afterText}</pre>
                    <div className="adl-hunk__actions">
                      <button type="button" className="adl-btn adl-btn--primary adl-btn--sm" onClick={() => onSetHunkDecision(hunk.id, "accepted")}>
                        {t.accept}
                      </button>
                      <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={() => onSetHunkDecision(hunk.id, "rejected")}>
                        {t.reject}
                      </button>
                    </div>
                  </div>
                ))}
                <div className="adl-patch-card__batch">
                  <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={() => {
                    activePatchSet?.filePatches.forEach((fp) => fp.hunks.forEach((h) => onSetHunkDecision(h.id, "accepted")));
                  }}>
                    {t.batchAcceptAll}
                  </button>
                  <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={() => {
                    activePatchSet?.filePatches.forEach((fp) => fp.hunks.forEach((h) => onSetHunkDecision(h.id, "rejected")));
                  }}>
                    {t.batchRejectAll}
                  </button>
                </div>
                <div className="adl-patch-card__footer">
                  <button data-testid="patch-apply" type="button" className="adl-btn adl-btn--primary" onClick={onApplyPatchSet}>
                    {t.applyPatch}
                  </button>
                  <button type="button" className="adl-btn adl-btn--ghost" onClick={onRollbackPatchSet}>
                    {t.rollbackPatch}
                  </button>
                </div>
              </article>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
