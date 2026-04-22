import React, { useMemo, useState } from "react";
import { MODEL_PROVIDER_IDS } from "../../constants";
import {
  IconCheckCircle,
  IconFileText,
  IconGitBranch,
  IconGitFork,
  IconPanelLeft,
  IconPanelLeftClose,
  IconRefreshCw
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore } from "../../ui-store";
import type { RightPanelViewProps } from "./types";
import { countGitChanges } from "./types";

type ChangesNavigatorMode = "changes" | "summary" | "models";

function groupGitFiles(paths: string[]) {
  return [...paths].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export function ChangesPanel(props: RightPanelViewProps) {
  const {
    t,
    appInfo,
    activePatchSet,
    latestPatchApplication,
    onOpenFile,
    onSetHunkDecision,
    onApplyPatchSet,
    onRollbackPatchSet,
    modelHealth,
    onRefreshModelHealth,
    onUpdatePreference
  } = props;
  const [navigatorMode, setNavigatorMode] = useState<ChangesNavigatorMode>("changes");
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.changes);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const snapshot = appInfo?.currentWorkspace?.gitSnapshot;
  const validation = latestPatchApplication?.validation;
  const patchFile = activePatchSet?.filePatches[0];
  const changedGroups = useMemo(
    () => [
      { key: "staged", label: t.changesStaged, paths: groupGitFiles(snapshot?.staged ?? []) },
      { key: "changes", label: t.changesModified, paths: groupGitFiles(snapshot?.unstaged ?? []) },
      { key: "untracked", label: t.changesUntracked, paths: groupGitFiles(snapshot?.untracked ?? []) },
      { key: "conflicts", label: t.changesConflicts, paths: groupGitFiles(snapshot?.conflicts ?? []) }
    ].filter((group) => group.paths.length > 0),
    [snapshot, t.changesConflicts, t.changesModified, t.changesStaged, t.changesUntracked]
  );

  return (
    <div className="adl-tool-panel adl-tool-panel--changes">
      <div className="adl-tool-context">
        <div className="adl-tool-context__group adl-tool-context__group--grow">
          <span className="adl-branch-pill">
            <IconGitBranch size={12} decorative />
            <span>{snapshot?.branch ?? "main"}</span>
          </span>
          <span className="adl-tool-context__summary">
            {countGitChanges(appInfo)} {t.changesFilesChanged}
          </span>
        </div>
        <div className="adl-tool-context__group">
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" disabled>
            {t.changesStageAll}
          </button>
          <button type="button" className="adl-btn adl-btn--primary adl-btn--xs" disabled>
            {t.changesCommit}
          </button>
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" disabled>
            {t.changesPush}
          </button>
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" disabled>
            {t.changesPull}
          </button>
        </div>
      </div>

      <div className={`adl-tool-surface${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}>
        <aside className="adl-tool-rail" aria-label={`${t.toolChanges} rail`}>
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="right">
            <button type="button" className="adl-tool-rail__btn" onClick={() => toggleNavigator("changes")}>
              {navigatorCollapsed ? <IconPanelLeft size={14} decorative /> : <IconPanelLeftClose size={14} decorative />}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.toolChanges} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "changes" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("changes")}
            >
              <IconGitFork size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.patchPreview} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "summary" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("summary")}
            >
              <IconFileText size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.models} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "models" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("models")}
            >
              <IconCheckCircle size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.refreshModelHealth} placement="right">
            <button type="button" className="adl-tool-rail__btn" onClick={onRefreshModelHealth}>
              <IconRefreshCw size={14} decorative />
            </button>
          </TooltipSimple>
        </aside>

        <aside className="adl-tool-navigator" aria-label={t.toolChanges}>
          <header className="adl-tool-navigator__header">
            <strong>
              {navigatorMode === "changes" ? t.toolChanges : navigatorMode === "summary" ? t.patchPreview : t.models}
            </strong>
          </header>

          {navigatorMode === "changes" ? (
            changedGroups.length > 0 ? (
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
            ) : (
              <p className="adl-empty-hint">{t.noPatch}</p>
            )
          ) : null}

          {navigatorMode === "summary" ? (
            <div className="adl-summary-list">
              <div className="adl-summary-list__row">
                <span>{t.changesSummaryBranch}</span>
                <strong>{snapshot?.branch ?? "main"}</strong>
              </div>
              <div className="adl-summary-list__row">
                <span>{t.changesSummaryCount}</span>
                <strong>{countGitChanges(appInfo)}</strong>
              </div>
              <div className="adl-summary-list__row">
                <span>{t.changesSummaryPatchFiles}</span>
                <strong>{activePatchSet?.filePatches.length ?? 0}</strong>
              </div>
            </div>
          ) : null}

          {navigatorMode === "models" ? (
            modelHealth?.providers.length ? (
              <ul className="adl-tool-list">
                {modelHealth.providers.map((provider) => (
                  <li key={provider.providerId}>
                    <div className="adl-tool-list__item adl-tool-list__item--static">
                      <span className="adl-tool-list__title">{provider.providerId}</span>
                      <small>{provider.healthy ? t.statusHealthy : t.statusDegraded} · {provider.detail}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adl-empty-hint">{t.modelUnavailable}</p>
            )
          ) : null}
        </aside>

        <div className="adl-tool-primary adl-tool-primary--scrollable">
          <div className="adl-tool-primary__tabs">
            <h3 className="adl-tool-primary__title">{t.patchPreview}</h3>
            {activePatchSet ? <span className="adl-chip adl-chip--info">{activePatchSet.status}</span> : null}
            <div className="adl-tool-primary__tabs-spacer" />
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={onRefreshModelHealth}
              aria-label={t.refreshModelHealth}
            >
              <IconRefreshCw size={12} decorative />
            </button>
          </div>

          <div className="adl-tool-primary__scroll">
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
                      <button
                        type="button"
                        className="adl-btn adl-btn--primary adl-btn--sm"
                        onClick={() => onSetHunkDecision(hunk.id, "accepted")}
                      >
                        {t.accept}
                      </button>
                      <button
                        type="button"
                        className="adl-btn adl-btn--ghost adl-btn--sm"
                        onClick={() => onSetHunkDecision(hunk.id, "rejected")}
                      >
                        {t.reject}
                      </button>
                    </div>
                  </div>
                ))}
                <div className="adl-patch-card__footer">
                  <button
                    data-testid="patch-apply"
                    type="button"
                    className="adl-btn adl-btn--primary"
                    onClick={onApplyPatchSet}
                  >
                    {t.applyPatch}
                  </button>
                  <button type="button" className="adl-btn adl-btn--ghost" onClick={onRollbackPatchSet}>
                    {t.rollbackPatch}
                  </button>
                </div>
              </article>
            ) : (
              <p className="adl-empty-hint">{t.noPatch}</p>
            )}

            <article className="adl-run-card">
              <header>
                <h3>{t.models}</h3>
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--xs"
                  onClick={onRefreshModelHealth}
                >
                  <IconRefreshCw size={12} decorative />
                </button>
              </header>
              {modelHealth?.providers.length ? (
                <ul className="adl-run-card__list">
                  {modelHealth.providers.map((provider) => (
                    <li key={provider.providerId}>
                      <strong>{provider.providerId}</strong>
                      <span className={`adl-chip adl-chip--${provider.healthy ? "success" : "warning"}`}>
                        {provider.healthy ? t.statusHealthy : t.statusDegraded}
                      </span>
                      <span>{provider.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="adl-empty-hint">{t.modelUnavailable}</p>
              )}
              <h4>{t.modelSettings}</h4>
              <div className="adl-run-card__settings">
                {MODEL_PROVIDER_IDS.map((providerId) => {
                  const preference = appInfo?.config.modelPreferences.providers[providerId];
                  if (!preference) return null;
                  return (
                    <section key={providerId}>
                      <strong>{providerId}</strong>
                      <label>
                        <span>{t.providerEnabled}</span>
                        <input
                          type="checkbox"
                          checked={preference.enabled}
                          onChange={(event) =>
                            onUpdatePreference({
                              modelPreferences: { [providerId]: { enabled: event.target.checked } }
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>{t.providerPriority}</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={preference.priority}
                          onChange={(event) =>
                            onUpdatePreference({
                              modelPreferences: { [providerId]: { priority: Number(event.target.value) } }
                            })
                          }
                        />
                      </label>
                    </section>
                  );
                })}
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
