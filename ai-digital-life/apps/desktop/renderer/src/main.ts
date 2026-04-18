import type { DigitalLifeBridge } from "../../shared/ipc";
import type {
  AppInfo,
  ApprovalRequestSummary,
  CheckpointRecord,
  CheckpointPayloadPreview,
  HealthComponent,
  HealthSnapshot,
  LanguageCode,
  RecentWorkspaceEntry,
  RetrievalSnapshot,
  RuntimeDiagnosticsSnapshot,
  TaskCenterSnapshot,
  TaskStatus,
  ThemeMode
} from "@ai-digital-life/kernel";
import { enUS } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";
import { setupMockBridge } from "./mock-bridge";
import "./styles.css";

if (typeof window !== "undefined" && !window.digitalLife) {
  setupMockBridge();
}

declare global {
  interface Window {
    digitalLife: DigitalLifeBridge;
  }
}

type Messages = {
  [Key in keyof typeof zhCN]: string;
};

type BannerState = {
  tone: "neutral" | "error";
  text: string;
};

type DashboardSnapshot = {
  info: AppInfo;
  health?: HealthSnapshot;
  diagnostics?: RuntimeDiagnosticsSnapshot;
  recentWorkspaces: RecentWorkspaceEntry[];
  retrieval?: RetrievalSnapshot;
  taskSnapshot?: TaskCenterSnapshot;
  checkpointPreview?: CheckpointPayloadPreview;
};

const rootNode = getRootNode();
let currentSnapshot: DashboardSnapshot | undefined;
let currentBanner: BannerState | undefined;

function getRootNode(): HTMLDivElement {
  const node = document.querySelector<HTMLDivElement>("#app");
  if (!node) {
    throw new Error("App root not found.");
  }

  return node;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
}

function statusClassName(status: HealthComponent["status"] | "pending"): string {
  return `pill ${status}`;
}

function taskStatusClassName(status: TaskStatus): string {
  switch (status) {
    case "completed":
      return "healthy";
    case "running":
    case "approved":
      return "degraded";
    case "failed":
    case "rejected":
    case "rolled-back":
      return "unavailable";
    default:
      return "pending";
  }
}

function taskStatusLabel(messages: Messages, status: TaskStatus): string {
  switch (status) {
    case "waiting-approval":
      return messages.statusWaitingApproval;
    case "approved":
      return messages.statusApproved;
    case "running":
      return messages.statusRunning;
    case "completed":
      return messages.statusCompleted;
    case "failed":
      return messages.statusFailed;
    case "rejected":
      return messages.statusRejected;
    case "rolled-back":
      return messages.statusRolledBack;
    default:
      return messages.statusPending;
  }
}

function riskLabel(messages: Messages, riskLevel: "low" | "medium" | "high"): string {
  switch (riskLevel) {
    case "medium":
      return messages.riskMedium;
    case "high":
      return messages.riskHigh;
    default:
      return messages.riskLow;
  }
}

async function bootstrap(): Promise<void> {
  const [retrievalResult, infoResult, healthResult, diagnosticsResult, recentResult, taskResult] = await Promise.all([
    window.digitalLife.retrieval.getStatus(),
    window.digitalLife.app.getInfo(),
    window.digitalLife.app.getHealth(),
    window.digitalLife.app.getDiagnostics(),
    window.digitalLife.workspace.listRecent(),
    window.digitalLife.task.getSnapshot()
  ]);

  if (!infoResult.ok) {
    renderFailure(infoResult.error.message);
    return;
  }

  currentSnapshot = {
    info: infoResult.data,
    health: healthResult.ok ? healthResult.data : undefined,
    diagnostics: diagnosticsResult.ok ? diagnosticsResult.data : undefined,
    recentWorkspaces: recentResult.ok ? recentResult.data : [],
    retrieval: retrievalResult.ok ? retrievalResult.data : undefined,
    taskSnapshot: taskResult.ok ? taskResult.data : undefined
  };

  const latestCheckpointId = taskResult.ok ? taskResult.data.latestCheckpoint?.id : undefined;
  if (latestCheckpointId) {
    const checkpointPreviewResult = await window.digitalLife.task.getCheckpointPreview(latestCheckpointId);
    if (checkpointPreviewResult.ok && currentSnapshot) {
      currentSnapshot.checkpointPreview = checkpointPreviewResult.data;
    }
  }

  renderApp();
}

function renderFailure(message: string): void {
  rootNode.innerHTML = `
    <main class="shell">
      <section class="panel">
        <h1>Initialization failed</h1>
        <p class="status-banner error">${escapeHtml(message)}</p>
      </section>
    </main>
  `;
}

function renderApp(): void {
  if (!currentSnapshot) {
    return;
  }

  const { info, health, diagnostics, recentWorkspaces, retrieval, taskSnapshot, checkpointPreview } = currentSnapshot;
  const locale = info.config.language;
  const messages = locale === "en-US" ? enUS : zhCN;
  const pendingApprovals = taskSnapshot?.pendingApprovals ?? [];
  const selectedApproval = pendingApprovals[0];
  const latestCheckpoint = taskSnapshot?.latestCheckpoint;
  const currentSession = taskSnapshot?.currentSession;

  document.documentElement.lang = locale;
  document.documentElement.dataset.theme = info.config.resolvedTheme;

  const currentWorkspaceMarkup = info.currentWorkspace
    ? `
      <div class="current-workspace">
        <strong>${escapeHtml(info.currentWorkspace.name)}</strong>
        <span class="mono">${escapeHtml(info.currentWorkspace.rootPath)}</span>
      </div>
    `
    : `<p class="panel-subtitle">${escapeHtml(messages.noWorkspace)}</p>`;

  const recentMarkup =
    recentWorkspaces.length > 0
      ? recentWorkspaces
          .map(
            (workspace) => `
              <li class="workspace-item ${workspace.available ? "" : "is-disabled"}">
                <div class="workspace-row">
                  <div>
                    <strong>${escapeHtml(workspace.name)}</strong>
                    <div class="mono">${escapeHtml(workspace.rootPath)}</div>
                    <div class="panel-subtitle">${escapeHtml(messages.lastOpenedAt)}: ${escapeHtml(formatDate(workspace.lastOpenedAt, locale))}</div>
                  </div>
                  ${
                    workspace.available
                      ? `<button data-open-workspace="${escapeHtml(workspace.path)}" type="button">${escapeHtml(messages.openWorkspace)}</button>`
                      : `<span class="availability-badge">${escapeHtml(messages.unavailableWorkspace)}</span>`
                  }
                </div>
              </li>
            `
          )
          .join("")
      : `<li class="workspace-item">${escapeHtml(messages.emptyRecent)}</li>`;

  const healthMarkup = health
    ? health.components
        .map(
          (component) => `
            <div class="health-item">
              <div class="${statusClassName(component.status)}">${escapeHtml(component.status)}</div>
              <h3>${escapeHtml(messages[component.name])}</h3>
              <p class="panel-subtitle">${escapeHtml(component.detail)}</p>
            </div>
          `
        )
        .join("")
    : `<div class="health-item"><p class="panel-subtitle">Health data unavailable.</p></div>`;

  const logsMarkup =
    info.recentLogs.length > 0
      ? info.recentLogs
          .map(
            (entry) => `
              <li class="log-item">
                <div class="log-row">
                  <strong>${escapeHtml(entry.scope)}</strong>
                  <span class="pill pending">${escapeHtml(entry.level)}</span>
                </div>
                <div>${escapeHtml(entry.message)}</div>
                <div class="panel-subtitle">${escapeHtml(formatDate(entry.timestamp, locale))}</div>
              </li>
            `
          )
          .join("")
      : `<li class="log-item">${escapeHtml(messages.logEmpty)}</li>`;

  const retrievalMarkup = retrieval
    ? `
      <div class="retrieval-overview">
        <div class="retrieval-stat">
          <div class="${statusClassName(
            retrieval.status === "failed" ? "unavailable" : retrieval.status === "running" ? "degraded" : "healthy"
          )}">${escapeHtml(retrieval.status)}</div>
          <p>${escapeHtml(messages.retrievalScanned)}: ${escapeHtml(String(retrieval.scannedFiles))}</p>
          <p>${escapeHtml(messages.retrievalIndexed)}: ${escapeHtml(String(retrieval.indexedTextFiles))}</p>
        </div>
        <div class="retrieval-stat">
          <strong>${escapeHtml(messages.retrievalTopExtensions)}</strong>
          <ul class="retrieval-list compact">
            ${
              retrieval.topExtensions.length > 0
                ? retrieval.topExtensions
                    .map((item) => `<li>${escapeHtml(item.extension)}: ${escapeHtml(String(item.count))}</li>`)
                    .join("")
                : `<li>${escapeHtml(messages.retrievalIdle)}</li>`
            }
          </ul>
        </div>
      </div>
      <p class="panel-subtitle">${escapeHtml(messages.repoMapPreview)}</p>
      <ul class="retrieval-list compact">
        ${retrieval.repoMap
          .slice(0, 8)
          .map((entry) => `<li>${entry.type === "directory" ? "[D]" : "[F]"} ${escapeHtml(entry.path)}</li>`)
          .join("")}
      </ul>
    `
    : `<p class="panel-subtitle">${escapeHtml(messages.retrievalIdle)}</p>`;

  const taskMarkup =
    taskSnapshot && taskSnapshot.tasks.length > 0
      ? taskSnapshot.tasks
          .map(
            (task) => `
              <li class="task-item">
                <div class="task-row">
                  <div>
                    <strong>${escapeHtml(task.title)}</strong>
                    <div class="panel-subtitle">${escapeHtml(task.description)}</div>
                  </div>
                  <div class="task-meta">
                    <span class="${statusClassName(taskStatusClassName(task.status) as HealthComponent["status"] | "pending")}">${escapeHtml(
                      taskStatusLabel(messages, task.status)
                    )}</span>
                    <span class="risk-pill ${task.riskLevel}">${escapeHtml(riskLabel(messages, task.riskLevel))}</span>
                  </div>
                </div>
                <p>${escapeHtml(task.detail)}</p>
                <div class="panel-subtitle">${escapeHtml(formatDate(task.updatedAt, locale))}</div>
              </li>
            `
          )
          .join("")
      : `<li class="task-item">${escapeHtml(messages.emptyTasks)}</li>`;

  const approvalMarkup =
    pendingApprovals.length > 0
      ? pendingApprovals
          .map(
            (approval) => `
              <li class="approval-item">
                <strong>${escapeHtml(approval.title)}</strong>
                <div class="panel-subtitle">${escapeHtml(riskLabel(messages, approval.riskLevel))}</div>
                <div>${escapeHtml(approval.description)}</div>
              </li>
            `
          )
          .join("")
      : `<li class="approval-item empty">${escapeHtml(messages.noPendingApprovals)}</li>`;

  const approvalDetailMarkup = selectedApproval
    ? renderApprovalDetail(selectedApproval, messages, locale)
    : `<div class="approval-detail-empty">${escapeHtml(messages.approvalDetailEmpty)}</div>`;
  const sessionMarkup = currentSession
    ? `
      <div class="approval-detail-card">
        <strong>${escapeHtml(currentSession.id)}</strong>
        <div class="panel-subtitle">${escapeHtml(messages.sessionLastTask)}: ${escapeHtml(currentSession.summary.lastTaskId ?? "-")}</div>
        <div class="panel-subtitle">${escapeHtml(messages.sessionLastCheckpoint)}: ${escapeHtml(currentSession.summary.lastCheckpointId ?? "-")}</div>
      </div>
    `
    : `<div class="approval-detail-empty">${escapeHtml(messages.noSession)}</div>`;
  const checkpointMarkup = latestCheckpoint
    ? renderCheckpointDetail(latestCheckpoint, checkpointPreview, messages, locale)
    : `<div class="approval-detail-empty">${escapeHtml(messages.noCheckpoint)}</div>`;
  const diagnosticsMarkup = diagnostics ? renderDiagnosticsDetail(diagnostics, messages, locale) : "";

  rootNode.innerHTML = `
    <main class="shell">
      <header class="hero panel">
        <div class="hero-copy">
          <div class="eyebrow">${escapeHtml(messages.phaseStatusTitle)}</div>
          <h1>${escapeHtml(messages.title)}</h1>
          <p>${escapeHtml(messages.subtitle)}</p>
          <p class="panel-subtitle">${escapeHtml(messages.phaseStatusBody)}</p>
        </div>
        <div class="hero-actions">
          <div class="preference-group">
            <span>${escapeHtml(messages.language)}</span>
            <div class="segmented-control">
              ${renderToggleButton("language", "zh-CN", messages.languageZh, info.config.language === "zh-CN")}
              ${renderToggleButton("language", "en-US", messages.languageEn, info.config.language === "en-US")}
            </div>
          </div>
          <div class="preference-group">
            <span>${escapeHtml(messages.theme)}</span>
            <div class="segmented-control">
              ${renderToggleButton("theme", "light", messages.themeLight, info.config.themeMode === "light")}
              ${renderToggleButton("theme", "dark", messages.themeDark, info.config.themeMode === "dark")}
            </div>
          </div>
          <div class="app-meta">
            <strong>${escapeHtml(info.appName)}</strong>
            <span class="panel-subtitle">v${escapeHtml(info.version)}</span>
          </div>
        </div>
      </header>

      <section class="grid dashboard-grid">
        <section class="panel workspace-panel">
          <h2>${escapeHtml(messages.currentWorkspace)}</h2>
          ${currentWorkspaceMarkup}
          <p class="panel-subtitle">${escapeHtml(messages.workspaceHint)}</p>
          <form id="workspace-form">
            <input id="workspace-path" name="workspacePath" placeholder="${escapeHtml(messages.workspacePlaceholder)}" />
            <button type="submit">${escapeHtml(messages.submit)}</button>
          </form>
          <p id="status-banner" class="status-banner ${currentBanner?.tone === "error" ? "error" : ""}">${escapeHtml(
            currentBanner?.text ?? ""
          )}</p>
        </section>

        <section class="panel">
          <h2>${escapeHtml(messages.retrieval)}</h2>
          ${retrievalMarkup}
        </section>

        <section class="panel">
          <h2>${escapeHtml(messages.governance)}</h2>
          <div class="panel-stack">
            <div>
              <div class="meta-row">
                <strong>${escapeHtml(messages.currentMode)}</strong>
                <span class="pill pending">${escapeHtml(messages.manualMode)}</span>
              </div>
              <p class="panel-subtitle">${escapeHtml(taskSnapshot?.policy.summary ?? messages.approvalDetailEmpty)}</p>
            </div>
            <div>
              <h3>${escapeHtml(messages.taskQueue)}</h3>
              <ul class="task-list">${taskMarkup}</ul>
            </div>
            <div>
              <h3>${escapeHtml(messages.pendingApprovals)}</h3>
              <ul class="approval-list">${approvalMarkup}</ul>
            </div>
            <div>
              <h3>${escapeHtml(messages.approvalDetail)}</h3>
              ${approvalDetailMarkup}
            </div>
          </div>
        </section>
      </section>

      <section class="grid secondary-grid">
        <section class="panel">
          <h2>${escapeHtml(messages.recentWorkspaces)}</h2>
          <ul class="workspace-list">${recentMarkup}</ul>
        </section>

        <section class="panel">
          <h2>${escapeHtml(messages.health)}</h2>
          <div class="health-grid">${healthMarkup}</div>
        </section>
      </section>

      <section class="grid secondary-grid">
        <section class="panel">
          <h2>${escapeHtml(messages.logs)}</h2>
          <ul class="log-list">${logsMarkup}</ul>
        </section>
        <section class="panel">
          <h2>${escapeHtml(messages.recoveryTitle)}</h2>
          <p>${escapeHtml(messages.recoverySummary)}</p>
          ${diagnosticsMarkup}
          <h3>${escapeHtml(messages.currentSessionTitle)}</h3>
          ${sessionMarkup}
          <h3>${escapeHtml(messages.latestCheckpoint)}</h3>
          ${checkpointMarkup}
          <h3>${escapeHtml(messages.highRiskRules)}</h3>
          <ul class="rule-list">
            ${
              taskSnapshot?.policy.highRiskRules
                .map((rule) => `<li>${escapeHtml(rule)}</li>`)
                .join("") ?? ""
            }
          </ul>
        </section>
      </section>
    </main>
  `;

  attachListeners(messages);
}

function renderToggleButton(group: "language" | "theme", value: LanguageCode | Exclude<ThemeMode, "system">, label: string, active: boolean): string {
  return `
    <button
      class="toggle-button ${active ? "is-active" : ""}"
      data-toggle-group="${group}"
      data-toggle-value="${escapeHtml(value)}"
      aria-pressed="${active ? "true" : "false"}"
      type="button"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderApprovalDetail(approval: ApprovalRequestSummary, messages: Messages, locale: string): string {
  return `
    <div class="approval-detail-card">
      <strong>${escapeHtml(approval.title)}</strong>
      <p>${escapeHtml(approval.description)}</p>
      <div class="meta-row">
        <span class="risk-pill ${approval.riskLevel}">${escapeHtml(riskLabel(messages, approval.riskLevel))}</span>
        <span class="panel-subtitle">${escapeHtml(formatDate(approval.createdAt, locale))}</span>
      </div>
      <label class="panel-subtitle" for="approval-reason">${escapeHtml(messages.approvalReasonPlaceholder)}</label>
      <input id="approval-reason" class="approval-reason-input" placeholder="${escapeHtml(messages.approvalReasonPlaceholder)}" />
      <ul class="rule-list">
        ${approval.impact.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      <div class="approval-actions">
        <button type="button" data-approval-decision="approved" data-approval-id="${escapeHtml(approval.id)}">${escapeHtml(messages.approvalApprove)}</button>
        <button type="button" class="secondary-button" data-approval-decision="rejected" data-approval-id="${escapeHtml(approval.id)}">${escapeHtml(messages.approvalReject)}</button>
      </div>
    </div>
  `;
}

function renderCheckpointDetail(
  checkpoint: CheckpointRecord,
  preview: CheckpointPayloadPreview | undefined,
  messages: Messages,
  locale: string
): string {
  const assetsMarkup =
    preview && preview.assets.length > 0
      ? `
        <div class="panel-subtitle">${escapeHtml(messages.checkpointAssets)}: ${escapeHtml(String(preview.assetCount))}</div>
        <ul class="rule-list compact-list">
          ${preview.assets
            .slice(0, 6)
            .map(
              (asset) =>
                `<li><span class="mono">${escapeHtml(asset.path)}</span> <span class="panel-subtitle">(${escapeHtml(
                  asset.status
                )})</span></li>`
            )
            .join("")}
        </ul>
      `
      : `<div class="panel-subtitle">${escapeHtml(messages.noCheckpointAssets)}</div>`;

  return `
    <div class="approval-detail-card">
      <strong>${escapeHtml(checkpoint.id)}</strong>
      <div>${escapeHtml(checkpoint.description)}</div>
      <div class="panel-subtitle">${escapeHtml(formatDate(checkpoint.createdAt, locale))}</div>
      ${assetsMarkup}
      <div class="approval-actions">
        <button type="button" data-restore-checkpoint="${escapeHtml(checkpoint.id)}">${escapeHtml(messages.restoreCheckpoint)}</button>
      </div>
    </div>
  `;
}

function renderDiagnosticsDetail(diagnostics: RuntimeDiagnosticsSnapshot, messages: Messages, locale: string): string {
  const eventSummary = Object.entries(diagnostics.events.byType)
    .map(([type, count]) => `${type}: ${count}`)
    .join(" | ");
  const latestError = diagnostics.recentErrors[0];
  const migrationScriptMarkup =
    diagnostics.migration.executedScripts.length > 0
      ? `<ul class="rule-list compact-list">${diagnostics.migration.executedScripts
          .map(
            (script) =>
              `<li><span class="mono">${escapeHtml(script.scriptId)}</span> <span class="panel-subtitle">(${escapeHtml(
                script.status
              )})</span></li>`
          )
          .join("")}</ul>`
      : `<div class="panel-subtitle">${escapeHtml(messages.noMigrationScripts)}</div>`;

  return `
    <div class="approval-detail-card">
      <strong>${escapeHtml(messages.lifecycleTitle)}</strong>
      <div class="panel-subtitle">${escapeHtml(messages.currentStartedAt)}: ${escapeHtml(
        formatDate(diagnostics.lifecycle.currentStartedAt, locale)
      )}</div>
      <div class="panel-subtitle">${escapeHtml(messages.lastShutdownAt)}: ${escapeHtml(
        diagnostics.lifecycle.lastShutdownAt ? formatDate(diagnostics.lifecycle.lastShutdownAt, locale) : "-"
      )}</div>
      <div class="panel-subtitle">${escapeHtml(messages.lastShutdownState)}: ${escapeHtml(
        diagnostics.lifecycle.lastShutdownWasClean ? messages.cleanShutdown : messages.uncleanShutdown
      )}</div>
      <div class="panel-subtitle">${escapeHtml(messages.recoveryDetected)}: ${escapeHtml(
        diagnostics.lifecycle.recoveredFromCrash ? messages.yes : messages.no
      )}</div>
      <strong>${escapeHtml(messages.migrationTitle)}</strong>
      <div class="panel-subtitle">${escapeHtml(messages.migrationChange)}: ${escapeHtml(diagnostics.migration.change)}</div>
      <div class="panel-subtitle">${escapeHtml(messages.migrationVersion)}: ${escapeHtml(
        `${diagnostics.migration.fromVersion ?? "-"} -> ${diagnostics.migration.toVersion}`
      )}</div>
      <div class="panel-subtitle">${escapeHtml(messages.migrationScripts)}: ${escapeHtml(
        String(diagnostics.migration.executedScripts.length)
      )}</div>
      <div class="panel-subtitle">${escapeHtml(messages.migrationBackupPath)}: ${escapeHtml(
        diagnostics.migration.backupPath ?? "-"
      )}</div>
      ${migrationScriptMarkup}
      <strong>${escapeHtml(messages.eventsTitle)}</strong>
      <div class="panel-subtitle">${escapeHtml(messages.eventsEmitted)}: ${escapeHtml(String(diagnostics.events.emitted))}</div>
      <div class="panel-subtitle mono">${escapeHtml(eventSummary || "-")}</div>
      <strong>${escapeHtml(messages.latestError)}</strong>
      <div class="panel-subtitle">${escapeHtml(
        latestError ? `${latestError.name}: ${latestError.message}` : messages.noRecentErrors
      )}</div>
    </div>
  `;
}

function attachListeners(messages: Messages): void {
  const form = document.querySelector<HTMLFormElement>("#workspace-form");
  const input = document.querySelector<HTMLInputElement>("#workspace-path");
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-open-workspace]");
  const languageButtons = document.querySelectorAll<HTMLButtonElement>("[data-toggle-group='language']");
  const themeButtons = document.querySelectorAll<HTMLButtonElement>("[data-toggle-group='theme']");
  const approvalButtons = document.querySelectorAll<HTMLButtonElement>("[data-approval-decision]");
  const restoreButtons = document.querySelectorAll<HTMLButtonElement>("[data-restore-checkpoint]");
  const approvalReasonInput = document.querySelector<HTMLInputElement>("#approval-reason");

  const updateBanner = (tone: BannerState["tone"], text: string): void => {
    currentBanner = {
      tone,
      text
    };
    renderApp();
  };

  const openWorkspace = async (workspacePath: string): Promise<void> => {
    const result = await window.digitalLife.workspace.open(workspacePath);

    if (result.ok) {
      updateBanner("neutral", `${messages.openSuccess} ${result.data.rootPath}`);
      await bootstrap();
      return;
    }

    updateBanner("error", `${messages.openFailure} ${result.error.message}`);
  };

  const updatePreferences = async (patch: { language?: LanguageCode; themeMode?: Exclude<ThemeMode, "system"> }): Promise<void> => {
    const result = await window.digitalLife.app.updatePreferences(patch);

    if (!result.ok) {
      updateBanner("error", `${messages.settingsSaveFailed} ${result.error.message}`);
      return;
    }

    currentSnapshot = {
      ...(currentSnapshot as DashboardSnapshot),
      info: result.data
    };
    updateBanner("neutral", messages.settingsSaved);
  };

  const decideApproval = async (approvalId: string, decision: "approved" | "rejected"): Promise<void> => {
    const result = await window.digitalLife.task.decideApproval({
      approvalId,
      decision,
      reason: approvalReasonInput?.value.trim() || undefined
    });

    if (!result.ok) {
      updateBanner("error", `${messages.approvalDecisionFailure} ${result.error.message}`);
      return;
    }

    currentSnapshot = {
      ...(currentSnapshot as DashboardSnapshot),
      taskSnapshot: result.data
    };
    const latestCheckpointId = result.data.latestCheckpoint?.id;
    if (latestCheckpointId) {
      const checkpointPreviewResult = await window.digitalLife.task.getCheckpointPreview(latestCheckpointId);
      if (checkpointPreviewResult.ok && currentSnapshot) {
        currentSnapshot.checkpointPreview = checkpointPreviewResult.data;
      }
    }
    updateBanner("neutral", messages.approvalDecisionSuccess);
  };

  const restoreCheckpoint = async (checkpointId: string): Promise<void> => {
    const result = await window.digitalLife.task.restoreCheckpoint(checkpointId);
    if (!result.ok) {
      updateBanner("error", `${messages.restoreCheckpointFailed} ${result.error.message}`);
      return;
    }

    currentSnapshot = {
      ...(currentSnapshot as DashboardSnapshot),
      taskSnapshot: result.data
    };
    const latestCheckpointId = result.data.latestCheckpoint?.id;
    if (latestCheckpointId) {
      const checkpointPreviewResult = await window.digitalLife.task.getCheckpointPreview(latestCheckpointId);
      if (checkpointPreviewResult.ok && currentSnapshot) {
        currentSnapshot.checkpointPreview = checkpointPreviewResult.data;
      }
    }
    updateBanner("neutral", messages.restoreCheckpointSuccess);
  };

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const workspacePath = input?.value ?? "";
    await openWorkspace(workspacePath);
  });

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const workspacePath = button.dataset.openWorkspace;
      if (workspacePath) {
        await openWorkspace(workspacePath);
      }
    });
  });

  languageButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const language = button.dataset.toggleValue as LanguageCode | undefined;
      if (language) {
        await updatePreferences({ language });
      }
    });
  });

  themeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const themeMode = button.dataset.toggleValue as Exclude<ThemeMode, "system"> | undefined;
      if (themeMode) {
        await updatePreferences({ themeMode });
      }
    });
  });

  approvalButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const approvalId = button.dataset.approvalId;
      const decision = button.dataset.approvalDecision as "approved" | "rejected" | undefined;
      if (approvalId && decision) {
        await decideApproval(approvalId, decision);
      }
    });
  });

  restoreButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const checkpointId = button.dataset.restoreCheckpoint;
      if (checkpointId) {
        await restoreCheckpoint(checkpointId);
      }
    });
  });
}

void bootstrap();
