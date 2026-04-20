import type { DigitalLifeBridge } from "../../shared/ipc";
import type {
  AppInfo,
  AppPreferencePatch,
  ApprovalRequestSummary,
  CheckpointPayloadPreview,
  CheckpointRecord,
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

import {
  ThemeController,
  classNames,
  escapeHtml,
  formatBytes,
  html,
  raw,
  renderBanner,
  renderButton,
  renderCard,
  renderEmptyState,
  renderHtml,
  renderIcon,
  renderNavItem,
  renderPill,
  renderSegmentedControl,
  type IconName,
  type PillTone,
  type Renderable
} from "./design-system";
import { enUS } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";
import { setupMockBridge } from "./mock-bridge";
import "./styles/index.css";

if (typeof window !== "undefined" && !window.digitalLife) {
  setupMockBridge();
}

declare global {
  interface Window {
    digitalLife: DigitalLifeBridge;
  }
}

type Messages = { readonly [K in keyof typeof zhCN]: string };

interface BannerState {
  tone: "neutral" | "success" | "warning" | "danger";
  text: string;
}

interface DashboardSnapshot {
  info: AppInfo;
  health?: HealthSnapshot;
  diagnostics?: RuntimeDiagnosticsSnapshot;
  recentWorkspaces: RecentWorkspaceEntry[];
  retrieval?: RetrievalSnapshot;
  taskSnapshot?: TaskCenterSnapshot;
  checkpointPreview?: CheckpointPayloadPreview;
}

const rootNode = getRootNode();
const themeController = new ThemeController();

let currentSnapshot: DashboardSnapshot | undefined;
let currentBanner: BannerState | undefined;

function getRootNode(): HTMLDivElement {
  const node = document.querySelector<HTMLDivElement>("#app");
  if (!node) {
    throw new Error("App root not found.");
  }
  return node;
}

function formatDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
}

function healthTone(status: HealthComponent["status"] | "pending"): PillTone {
  switch (status) {
    case "healthy":
      return "healthy";
    case "degraded":
      return "degraded";
    case "unavailable":
      return "unavailable";
    default:
      return "pending";
  }
}

function taskStatusTone(status: TaskStatus): PillTone {
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

function riskTone(level: "low" | "medium" | "high"): PillTone {
  switch (level) {
    case "high":
      return "danger";
    case "medium":
      return "warning";
    default:
      return "success";
  }
}

function riskLabel(messages: Messages, level: "low" | "medium" | "high"): string {
  switch (level) {
    case "high":
      return messages.riskHigh;
    case "medium":
      return messages.riskMedium;
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
  rootNode.innerHTML = renderHtml(html`
    <main class="app-shell" role="alert">
      <section class="page">
        <div class="card">
          <h1 class="card__title">Initialization failed</h1>
          ${renderBanner({ text: message, tone: "danger", live: "assertive" })}
        </div>
      </section>
    </main>
  `);
}

function renderApp(): void {
  if (!currentSnapshot) return;

  const { info, health, diagnostics, recentWorkspaces, retrieval, taskSnapshot, checkpointPreview } = currentSnapshot;
  const locale = info.config.language;
  const messages = locale === "en-US" ? enUS : zhCN;
  const pendingApprovals = taskSnapshot?.pendingApprovals ?? [];
  const selectedApproval = pendingApprovals[0];
  const latestCheckpoint = taskSnapshot?.latestCheckpoint;
  const currentSession = taskSnapshot?.currentSession;

  document.documentElement.lang = locale;
  themeController.setTheme({
    mode: info.config.themeMode,
    resolvedTheme: info.config.resolvedTheme
  });
  themeController.hydrate();

  rootNode.innerHTML = renderHtml(html`
    <a class="skip-link" href="#main-content">${messages.skipToContent}</a>
    <div class="app-shell">
      ${renderTitlebar(messages, info)}
      <div class="app-shell__body">
        ${renderSidebar(messages)}
        <main id="main-content" class="app-shell__main" tabindex="-1" aria-label="${messages.appShellMain}">
          ${renderHero(messages, info)}
          <section class="page" aria-label="${messages.appShellMain}">
            ${renderBanner({
              id: "status-banner",
              tone: currentBanner?.tone ?? "neutral",
              text: currentBanner?.text ?? "",
              empty: !currentBanner?.text,
              live: currentBanner?.tone === "danger" ? "assertive" : "polite"
            })}
            <section class="grid grid--dashboard">
              ${renderWorkspaceCard(messages, info)}
              ${renderRetrievalCard(messages, retrieval)}
              ${renderGovernanceCard(messages, taskSnapshot, selectedApproval, locale)}
            </section>
            <section class="grid grid--cols-2">
              ${renderRecentCard(messages, recentWorkspaces, locale)}
              ${renderHealthCard(messages, health)}
            </section>
            <section class="grid grid--cols-2">
              ${renderLogsCard(messages, info, locale)}
              ${renderRecoveryCard(messages, currentSession, latestCheckpoint, checkpointPreview, diagnostics, taskSnapshot?.policy.highRiskRules ?? [], locale)}
            </section>
          </section>
        </main>
      </div>
      ${renderStatusbar(messages, info, health)}
    </div>
  `);

  attachListeners(messages);
}

function renderTitlebar(messages: Messages, info: AppInfo): Renderable {
  return html`
    <header class="app-shell__titlebar" role="banner" aria-label="${messages.appShellTitlebar}">
      <div class="app-shell__brand">
        ${renderIcon("shield", { size: "sm", decorative: true })}
        <span class="app-shell__brand-name">${info.appName}</span>
        <span class="app-shell__brand-meta">v${info.version}</span>
      </div>
      <div class="app-shell__titlebar-spacer"></div>
    </header>
  `;
}

function renderSidebar(messages: Messages): Renderable {
  const items: Array<{ icon: IconName; label: string; current?: boolean }> = [
    { icon: "home", label: messages.navHome, current: true },
    { icon: "folder", label: messages.navWorkspace },
    { icon: "search", label: messages.navRetrieval },
    { icon: "tasks", label: messages.navTasks },
    { icon: "logs", label: messages.navLogs },
    { icon: "settings", label: messages.navSettings }
  ];

  return html`
    <aside class="app-shell__sidebar" aria-label="${messages.appShellSidebar}">
      <nav class="nav" aria-label="${messages.appShellSidebar}">
        ${items.map((item) =>
          renderNavItem({
            icon: item.icon,
            label: item.label,
            current: item.current,
            ariaLabel: item.label
          })
        )}
      </nav>
    </aside>
  `;
}

function renderHero(messages: Messages, info: AppInfo): Renderable {
  const themeOptions = [
    { value: "light" as const, label: messages.themeLight },
    { value: "dark" as const, label: messages.themeDark },
    { value: "system" as const, label: messages.themeSystem }
  ];
  const langOptions = [
    { value: "zh-CN" as const, label: messages.languageZh },
    { value: "en-US" as const, label: messages.languageEn }
  ];

  return html`
    <section class="page" aria-labelledby="hero-title">
      <div class="card">
        <div class="card__header">
          <div class="stack stack--sm">
            <span class="eyebrow">${messages.phaseStatusTitle}</span>
            <h1 id="hero-title" class="page__title">${messages.title}</h1>
            <p class="card__subtitle">${messages.subtitle}</p>
            <p class="text-muted text-sm">${messages.phaseStatusBody}</p>
            <p class="text-muted text-sm">${messages.designSystemReady}</p>
          </div>
          <div class="stack">
            <div class="stack stack--sm">
              <span class="field__label">${messages.language}</span>
              ${renderSegmentedControl({
                name: "language",
                ariaLabel: messages.language,
                value: info.config.language,
                options: langOptions
              })}
            </div>
            <div class="stack stack--sm">
              <span class="field__label">${messages.themeModeLabel}</span>
              ${renderSegmentedControl({
                name: "theme",
                ariaLabel: messages.themeModeLabel,
                value: info.config.themeMode,
                options: themeOptions
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderWorkspaceCard(messages: Messages, info: AppInfo): Renderable {
  const currentMarkup = info.currentWorkspace
    ? html`
        <div class="tile">
          <strong class="tile__title">${info.currentWorkspace.name}</strong>
          <code class="mono">${info.currentWorkspace.rootPath}</code>
        </div>
      `
    : html`<p class="text-muted text-sm">${messages.noWorkspace}</p>`;

  return renderCard({
    title: messages.currentWorkspace,
    ariaLabel: messages.currentWorkspace,
    children: html`
      ${currentMarkup}
      <p class="text-muted text-sm">${messages.workspaceHint}</p>
      <form id="workspace-form" class="form-row" novalidate>
        <label class="sr-only" for="workspace-path">${messages.workspacePathLabel}</label>
        <input
          id="workspace-path"
          name="workspacePath"
          class="input input--mono"
          autocomplete="off"
          spellcheck="false"
          inputmode="text"
          placeholder="${messages.workspacePlaceholder}"
        />
        ${renderButton({
          label: messages.submit,
          type: "submit",
          icon: "play",
          ariaLabel: messages.submit
        })}
      </form>
    `
  });
}

function renderRetrievalCard(messages: Messages, retrieval: RetrievalSnapshot | undefined): Renderable {
  if (!retrieval) {
    return renderCard({
      title: messages.retrieval,
      ariaLabel: messages.retrieval,
      children: renderEmptyState({ icon: "search", title: messages.retrievalIdle })
    });
  }

  const statusTone: PillTone =
    retrieval.status === "failed" ? "unavailable" : retrieval.status === "running" ? "degraded" : "healthy";

  return renderCard({
    title: messages.retrieval,
    ariaLabel: messages.retrieval,
    children: html`
      <div class="grid grid--cols-2">
        <div class="stat">
          <span class="stat__label">${retrieval.status}</span>
          ${renderPill({ label: retrieval.status, tone: statusTone })}
          <p class="stat__detail">${messages.retrievalScanned}: ${String(retrieval.scannedFiles)}</p>
          <p class="stat__detail">${messages.retrievalIndexed}: ${String(retrieval.indexedTextFiles)}</p>
        </div>
        <div class="stat">
          <span class="stat__label">${messages.retrievalTopExtensions}</span>
          ${
            retrieval.topExtensions.length === 0
              ? html`<p class="stat__detail">${messages.retrievalIdle}</p>`
              : html`<ul class="stack stack--sm">
                  ${retrieval.topExtensions
                    .slice(0, 6)
                    .map((item) => html`<li class="stat__detail mono">${item.extension}: ${String(item.count)}</li>`)}
                </ul>`
          }
        </div>
      </div>
      <p class="text-muted text-sm">${messages.repoMapPreview}</p>
      <ul class="stack stack--sm">
        ${retrieval.repoMap
          .slice(0, 8)
          .map(
            (entry) => html`<li class="mono">${entry.type === "directory" ? "[D]" : "[F]"} ${entry.path}</li>`
          )}
      </ul>
    `
  });
}

function renderGovernanceCard(
  messages: Messages,
  taskSnapshot: TaskCenterSnapshot | undefined,
  selectedApproval: ApprovalRequestSummary | undefined,
  locale: string
): Renderable {
  const tasks = taskSnapshot?.tasks ?? [];
  const approvals = taskSnapshot?.pendingApprovals ?? [];

  const taskList =
    tasks.length === 0
      ? renderEmptyState({ icon: "tasks", title: messages.emptyTasks })
      : html`<ul class="stack stack--sm" aria-label="${messages.ariaTaskList}">
          ${tasks.map(
            (task) => html`
              <li class="tile">
                <div class="tile__row">
                  <div>
                    <p class="tile__title">${task.title}</p>
                    <p class="tile__meta">${task.description}</p>
                  </div>
                  <div class="cluster">
                    ${renderPill({ label: taskStatusLabel(messages, task.status), tone: taskStatusTone(task.status) })}
                    ${renderPill({ label: riskLabel(messages, task.riskLevel), tone: riskTone(task.riskLevel) })}
                  </div>
                </div>
                <p class="tile__detail">${task.detail}</p>
                <p class="tile__meta">${formatDate(task.updatedAt, locale)}</p>
              </li>
            `
          )}
        </ul>`;

  const approvalList =
    approvals.length === 0
      ? html`<p class="text-muted text-sm">${messages.noPendingApprovals}</p>`
      : html`<ul class="stack stack--sm" aria-label="${messages.ariaPendingApprovals}">
          ${approvals.map(
            (approval) => html`
              <li class="tile">
                <p class="tile__title">${approval.title}</p>
                <p class="tile__meta">${riskLabel(messages, approval.riskLevel)}</p>
                <p class="tile__detail">${approval.description}</p>
              </li>
            `
          )}
        </ul>`;

  const detail = selectedApproval ? renderApprovalDetail(selectedApproval, messages, locale) : html`<p class="text-muted text-sm">${messages.approvalDetailEmpty}</p>`;

  return renderCard({
    title: messages.governance,
    ariaLabel: messages.governance,
    children: html`
      <div class="cluster">
        <strong>${messages.currentMode}</strong>
        ${renderPill({ label: messages.manualMode, tone: "info" })}
      </div>
      <p class="text-muted text-sm">${taskSnapshot?.policy.summary ?? messages.approvalDetailEmpty}</p>
      <h3 class="card__subtitle">${messages.taskQueue}</h3>
      ${taskList}
      <h3 class="card__subtitle">${messages.pendingApprovals}</h3>
      ${approvalList}
      <h3 class="card__subtitle">${messages.approvalDetail}</h3>
      ${detail}
    `
  });
}

function renderApprovalDetail(approval: ApprovalRequestSummary, messages: Messages, locale: string): Renderable {
  return html`
    <div class="tile" aria-label="${messages.approvalDetail}">
      <p class="tile__title">${approval.title}</p>
      <p class="tile__detail">${approval.description}</p>
      <div class="cluster">
        ${renderPill({ label: riskLabel(messages, approval.riskLevel), tone: riskTone(approval.riskLevel) })}
        <span class="tile__meta">${formatDate(approval.createdAt, locale)}</span>
      </div>
      <ul class="stack stack--sm">
        ${approval.impact.map((item) => html`<li class="tile__detail">• ${item}</li>`)}
      </ul>
      <div class="field">
        <label class="field__label" for="approval-reason">${messages.approvalReasonLabel}</label>
        <input
          id="approval-reason"
          class="input"
          type="text"
          autocomplete="off"
          placeholder="${messages.approvalReasonPlaceholder}"
        />
      </div>
      <div class="cluster">
        ${renderButton({
          label: messages.approvalApprove,
          icon: "check",
          data: { "approval-decision": "approved", "approval-id": approval.id }
        })}
        ${renderButton({
          label: messages.approvalReject,
          variant: "secondary",
          icon: "close",
          data: { "approval-decision": "rejected", "approval-id": approval.id }
        })}
      </div>
    </div>
  `;
}

function renderRecentCard(messages: Messages, recent: RecentWorkspaceEntry[], locale: string): Renderable {
  return renderCard({
    title: messages.recentWorkspaces,
    ariaLabel: messages.recentWorkspaces,
    children:
      recent.length === 0
        ? renderEmptyState({ icon: "folder", title: messages.emptyRecent })
        : html`<ul class="stack stack--sm" aria-label="${messages.ariaRecentList}">
            ${recent.map(
              (workspace) => html`
                <li class="${classNames("tile", !workspace.available && "tile--disabled")}">
                  <div class="tile__row">
                    <div class="stack stack--sm">
                      <strong class="tile__title">${workspace.name}</strong>
                      <code class="mono">${workspace.rootPath}</code>
                      <span class="tile__meta"
                        >${messages.lastOpenedAt}: ${formatDate(workspace.lastOpenedAt, locale)}</span
                      >
                    </div>
                    ${
                      workspace.available
                        ? renderButton({
                            label: messages.openWorkspace,
                            variant: "secondary",
                            size: "sm",
                            icon: "external-link",
                            data: { "open-workspace": workspace.path }
                          })
                        : renderPill({ label: messages.unavailableWorkspace, tone: "danger" })
                    }
                  </div>
                </li>
              `
            )}
          </ul>`
  });
}

function renderHealthCard(messages: Messages, health: HealthSnapshot | undefined): Renderable {
  if (!health) {
    return renderCard({
      title: messages.health,
      ariaLabel: messages.health,
      children: renderEmptyState({ icon: "shield", title: "Health data unavailable." })
    });
  }

  return renderCard({
    title: messages.health,
    ariaLabel: messages.health,
    children: html`
      <ul class="grid grid--cols-2" aria-label="${messages.ariaHealthList}">
        ${health.components.map(
          (component) => html`
            <li class="stat">
              <span class="stat__label">${messages[component.name]}</span>
              ${renderPill({ label: component.status, tone: healthTone(component.status) })}
              <p class="stat__detail">${component.detail}</p>
            </li>
          `
        )}
      </ul>
    `
  });
}

function renderLogsCard(messages: Messages, info: AppInfo, locale: string): Renderable {
  if (info.recentLogs.length === 0) {
    return renderCard({
      title: messages.logs,
      ariaLabel: messages.logs,
      children: renderEmptyState({ icon: "logs", title: messages.logEmpty })
    });
  }

  return renderCard({
    title: messages.logs,
    ariaLabel: messages.logs,
    children: html`<ul class="stack stack--sm" aria-label="${messages.ariaLogList}">
      ${info.recentLogs.map(
        (entry) => html`
          <li class="tile">
            <div class="tile__row">
              <strong class="tile__title">${entry.scope}</strong>
              ${renderPill({ label: entry.level, tone: entry.level === "error" ? "danger" : entry.level === "warn" ? "warning" : "neutral" })}
            </div>
            <p class="tile__detail">${entry.message}</p>
            <span class="tile__meta">${formatDate(entry.timestamp, locale)}</span>
          </li>
        `
      )}
    </ul>`
  });
}

function renderRecoveryCard(
  messages: Messages,
  session: TaskCenterSnapshot["currentSession"] | undefined,
  checkpoint: CheckpointRecord | undefined,
  preview: CheckpointPayloadPreview | undefined,
  diagnostics: RuntimeDiagnosticsSnapshot | undefined,
  highRiskRules: string[],
  locale: string
): Renderable {
  const sessionMarkup = session
    ? html`
        <div class="tile">
          <strong class="tile__title">${session.id}</strong>
          <span class="tile__meta">${messages.sessionLastTask}: ${session.summary.lastTaskId ?? "-"}</span>
          <span class="tile__meta">${messages.sessionLastCheckpoint}: ${session.summary.lastCheckpointId ?? "-"}</span>
        </div>
      `
    : html`<p class="text-muted text-sm">${messages.noSession}</p>`;

  const checkpointMarkup = checkpoint
    ? renderCheckpointDetail(checkpoint, preview, messages, locale)
    : html`<p class="text-muted text-sm">${messages.noCheckpoint}</p>`;

  const diagnosticsMarkup = diagnostics ? renderDiagnostics(diagnostics, messages, locale) : raw("");

  return renderCard({
    title: messages.recoveryTitle,
    ariaLabel: messages.recoveryTitle,
    children: html`
      <p class="text-muted text-sm">${messages.recoverySummary}</p>
      ${diagnosticsMarkup}
      <h3 class="card__subtitle">${messages.currentSessionTitle}</h3>
      ${sessionMarkup}
      <h3 class="card__subtitle">${messages.latestCheckpoint}</h3>
      ${checkpointMarkup}
      <h3 class="card__subtitle">${messages.highRiskRules}</h3>
      <ul class="stack stack--sm">
        ${highRiskRules.map((rule) => html`<li class="tile__detail">• ${rule}</li>`)}
      </ul>
    `
  });
}

function renderCheckpointDetail(
  checkpoint: CheckpointRecord,
  preview: CheckpointPayloadPreview | undefined,
  messages: Messages,
  locale: string
): Renderable {
  const assetsMarkup =
    preview && preview.assets.length > 0
      ? html`
          <p class="tile__meta">${messages.checkpointAssets}: ${String(preview.assetCount)}</p>
          <ul class="stack stack--sm">
            ${preview.assets.slice(0, 6).map(
              (asset) => html`
                <li class="tile__detail">
                  <code class="mono">${asset.path}</code>
                  <span class="tile__meta"> (${asset.status}${asset.size ? `, ${formatBytes(asset.size)}` : ""})</span>
                </li>
              `
            )}
          </ul>
        `
      : html`<p class="tile__meta">${messages.noCheckpointAssets}</p>`;

  return html`
    <div class="tile">
      <strong class="tile__title">${checkpoint.id}</strong>
      <p class="tile__detail">${checkpoint.description}</p>
      <span class="tile__meta">${formatDate(checkpoint.createdAt, locale)}</span>
      ${assetsMarkup}
      <div class="cluster">
        ${renderButton({
          label: messages.restoreCheckpoint,
          icon: "refresh",
          data: { "restore-checkpoint": checkpoint.id }
        })}
      </div>
    </div>
  `;
}

function renderDiagnostics(diagnostics: RuntimeDiagnosticsSnapshot, messages: Messages, locale: string): Renderable {
  const eventSummary = Object.entries(diagnostics.events.byType)
    .map(([type, count]) => `${type}: ${count}`)
    .join(" | ");
  const latestError = diagnostics.recentErrors[0];

  return html`
    <div class="tile">
      <strong class="tile__title">${messages.lifecycleTitle}</strong>
      <span class="tile__meta">${messages.currentStartedAt}: ${formatDate(diagnostics.lifecycle.currentStartedAt, locale)}</span>
      <span class="tile__meta"
        >${messages.lastShutdownAt}: ${diagnostics.lifecycle.lastShutdownAt ? formatDate(diagnostics.lifecycle.lastShutdownAt, locale) : "-"}</span
      >
      <span class="tile__meta"
        >${messages.lastShutdownState}:
        ${diagnostics.lifecycle.lastShutdownWasClean ? messages.cleanShutdown : messages.uncleanShutdown}</span
      >
      <span class="tile__meta"
        >${messages.recoveryDetected}: ${diagnostics.lifecycle.recoveredFromCrash ? messages.yes : messages.no}</span
      >
      <strong class="tile__title">${messages.migrationTitle}</strong>
      <span class="tile__meta">${messages.migrationChange}: ${diagnostics.migration.change}</span>
      <span class="tile__meta"
        >${messages.migrationVersion}: ${diagnostics.migration.fromVersion ?? "-"} -> ${diagnostics.migration.toVersion}</span
      >
      <span class="tile__meta">${messages.migrationScripts}: ${String(diagnostics.migration.executedScripts.length)}</span>
      <span class="tile__meta">${messages.migrationBackupPath}: ${diagnostics.migration.backupPath ?? "-"}</span>
      ${
        diagnostics.migration.executedScripts.length === 0
          ? html`<span class="tile__meta">${messages.noMigrationScripts}</span>`
          : html`<ul class="stack stack--sm">
              ${diagnostics.migration.executedScripts.map(
                (script) => html`
                  <li class="tile__detail">
                    <code class="mono">${script.scriptId}</code>
                    <span class="tile__meta"> (${script.status})</span>
                  </li>
                `
              )}
            </ul>`
      }
      <strong class="tile__title">${messages.eventsTitle}</strong>
      <span class="tile__meta">${messages.eventsEmitted}: ${String(diagnostics.events.emitted)}</span>
      <span class="tile__meta mono">${eventSummary || "-"}</span>
      <strong class="tile__title">${messages.latestError}</strong>
      <span class="tile__meta">${latestError ? `${latestError.name}: ${latestError.message}` : messages.noRecentErrors}</span>
    </div>
  `;
}

function renderStatusbar(messages: Messages, info: AppInfo, health: HealthSnapshot | undefined): Renderable {
  const workspaceLabel = info.currentWorkspace?.name ?? messages.noWorkspace;
  const branch = info.currentWorkspace?.gitSnapshot?.branch ?? "-";
  const workerStatus = health?.components.find((component) => component.name === "worker");
  const storageStatus = health?.components.find((component) => component.name === "storage");

  return html`
    <footer class="app-shell__statusbar" role="contentinfo" aria-label="${messages.appShellStatusbar}">
      <span class="cluster">
        ${renderIcon("folder", { size: "xs", decorative: true })}
        <span>${workspaceLabel}</span>
      </span>
      <span class="cluster">
        ${renderIcon("git-branch", { size: "xs", decorative: true })}
        <span>${branch}</span>
      </span>
      <span class="cluster">
        ${workerStatus ? renderPill({ label: workerStatus.status, tone: healthTone(workerStatus.status) }) : raw("")}
        ${storageStatus ? renderPill({ label: storageStatus.status, tone: healthTone(storageStatus.status) }) : raw("")}
      </span>
      <span class="app-shell__titlebar-spacer"></span>
      <span>v${info.version}</span>
    </footer>
  `;
}

function attachListeners(messages: Messages): void {
  const form = document.querySelector<HTMLFormElement>("#workspace-form");
  const input = document.querySelector<HTMLInputElement>("#workspace-path");
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-open-workspace]");
  const segmentedButtons = document.querySelectorAll<HTMLButtonElement>("[data-segmented-name]");
  const approvalButtons = document.querySelectorAll<HTMLButtonElement>("[data-approval-decision]");
  const restoreButtons = document.querySelectorAll<HTMLButtonElement>("[data-restore-checkpoint]");
  const approvalReasonInput = document.querySelector<HTMLInputElement>("#approval-reason");

  const updateBanner = (tone: BannerState["tone"], text: string): void => {
    currentBanner = { tone, text };
    renderApp();
  };

  const openWorkspace = async (workspacePath: string): Promise<void> => {
    const result = await window.digitalLife.workspace.open(workspacePath);

    if (result.ok) {
      updateBanner("success", `${messages.openSuccess} ${result.data.rootPath}`);
      await bootstrap();
      return;
    }

    updateBanner("danger", `${messages.openFailure} ${result.error.message}`);
  };

  const updatePreferences = async (patch: AppPreferencePatch): Promise<void> => {
    const result = await window.digitalLife.app.updatePreferences(patch);

    if (!result.ok) {
      updateBanner("danger", `${messages.settingsSaveFailed} ${result.error.message}`);
      return;
    }

    currentSnapshot = {
      ...(currentSnapshot as DashboardSnapshot),
      info: result.data
    };
    updateBanner("success", messages.settingsSaved);
  };

  const decideApproval = async (approvalId: string, decision: "approved" | "rejected"): Promise<void> => {
    const result = await window.digitalLife.task.decideApproval({
      approvalId,
      decision,
      reason: approvalReasonInput?.value.trim() || undefined
    });

    if (!result.ok) {
      updateBanner("danger", `${messages.approvalDecisionFailure} ${result.error.message}`);
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
    updateBanner("success", messages.approvalDecisionSuccess);
  };

  const restoreCheckpoint = async (checkpointId: string): Promise<void> => {
    const result = await window.digitalLife.task.restoreCheckpoint(checkpointId);
    if (!result.ok) {
      updateBanner("danger", `${messages.restoreCheckpointFailed} ${result.error.message}`);
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
    updateBanner("success", messages.restoreCheckpointSuccess);
  };

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const workspacePath = input?.value ?? "";
    await openWorkspace(workspacePath);
  });

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const workspacePath = button.dataset.openWorkspace;
      if (workspacePath) await openWorkspace(workspacePath);
    });
  });

  segmentedButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const name = button.dataset.segmentedName;
      const value = button.dataset.segmentedValue;
      if (!name || !value) return;

      if (name === "language") {
        await updatePreferences({ language: value as LanguageCode });
      } else if (name === "theme") {
        await updatePreferences({ themeMode: value as ThemeMode });
      }
    });
  });

  approvalButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const approvalId = button.dataset.approvalId;
      const decision = button.dataset.approvalDecision as "approved" | "rejected" | undefined;
      if (approvalId && decision) await decideApproval(approvalId, decision);
    });
  });

  restoreButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const checkpointId = button.dataset.restoreCheckpoint;
      if (checkpointId) await restoreCheckpoint(checkpointId);
    });
  });
}

void bootstrap();
