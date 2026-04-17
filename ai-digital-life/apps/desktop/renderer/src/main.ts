import type { DigitalLifeBridge } from "../../shared/ipc";
import type { AppInfo, HealthComponent, HealthSnapshot, RecentWorkspaceEntry, RetrievalSnapshot } from "@ai-digital-life/kernel";
import { enUS } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";
import "./styles.css";

declare global {
  interface Window {
    digitalLife: DigitalLifeBridge;
  }
}

type Messages = {
  [Key in keyof typeof zhCN]: string;
};

function getRootNode(): HTMLDivElement {
  const node = document.querySelector<HTMLDivElement>("#app");
  if (!node) {
    throw new Error("App root not found.");
  }

  return node;
}

const rootNode = getRootNode();

const formatDate = (timestamp: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);

const statusClassName = (status: HealthComponent["status"]): string => `pill ${status}`;

async function bootstrap(): Promise<void> {
  const [retrievalResult, infoResult, healthResult, recentResult] = await Promise.all([
    window.digitalLife.retrieval.getStatus(),
    window.digitalLife.app.getInfo(),
    window.digitalLife.app.getHealth(),
    window.digitalLife.workspace.listRecent()
  ]);

  if (!infoResult.ok) {
    renderFailure(infoResult.error.message);
    return;
  }

  const locale = infoResult.data.config.language;
  const messages = locale === "en-US" ? enUS : zhCN;
  document.documentElement.lang = locale;
  document.documentElement.dataset.theme = infoResult.data.config.resolvedTheme;

  renderApp(
    infoResult.data,
    healthResult.ok ? healthResult.data : undefined,
    recentResult.ok ? recentResult.data : [],
    retrievalResult.ok ? retrievalResult.data : undefined,
    messages,
    locale
  );
}

function renderFailure(message: string): void {
  rootNode.innerHTML = `
    <main class="shell">
      <section class="panel">
        <h1>Initialization failed</h1>
        <p class="status-banner error">${message}</p>
      </section>
    </main>
  `;
}

function renderApp(
  info: AppInfo,
  health: HealthSnapshot | undefined,
  recentWorkspaces: RecentWorkspaceEntry[],
  retrieval: RetrievalSnapshot | undefined,
  messages: Messages,
  locale: string
): void {
  const currentWorkspaceMarkup = info.currentWorkspace
    ? `
      <div class="current-workspace">
        <strong>${info.currentWorkspace.name}</strong>
        <span class="mono">${info.currentWorkspace.rootPath}</span>
      </div>
    `
    : `<p class="panel-subtitle">${messages.noWorkspace}</p>`;

  const recentMarkup =
    recentWorkspaces.length > 0
      ? recentWorkspaces
          .map(
            (workspace) => `
              <li class="workspace-item">
                <strong>${workspace.name}</strong>
                <div class="mono">${workspace.rootPath}</div>
                <div class="panel-subtitle">${messages.lastOpenedAt}: ${formatDate(workspace.lastOpenedAt, locale)}</div>
                <button data-open-workspace="${workspace.path}" type="button">${messages.openWorkspace}</button>
              </li>
            `
          )
          .join("")
      : `<li class="workspace-item">${messages.emptyRecent}</li>`;

  const healthMarkup = health
    ? health.components
        .map(
          (component) => `
            <div class="health-item">
              <div class="${statusClassName(component.status)}">${component.status}</div>
              <h3>${messages[component.name]}</h3>
              <p class="panel-subtitle">${component.detail}</p>
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
                <strong>${entry.scope}</strong>
                <div>${entry.message}</div>
                <div class="panel-subtitle">${formatDate(entry.timestamp, locale)}</div>
              </li>
            `
          )
          .join("")
      : `<li class="log-item">No logs yet.</li>`;

  const retrievalMarkup = retrieval
    ? `
      <div class="retrieval-metrics">
        <div class="retrieval-stat">
          <div class="${statusClassName(retrieval.status === "failed" ? "unavailable" : retrieval.status === "running" ? "degraded" : "healthy")}">${retrieval.status}</div>
          <p>${messages.retrievalScanned}: ${retrieval.scannedFiles}</p>
          <p>${messages.retrievalIndexed}: ${retrieval.indexedTextFiles}</p>
        </div>
        <div class="retrieval-stat">
          <strong>${messages.retrievalTopExtensions}</strong>
          <ul class="retrieval-list">
            ${retrieval.topExtensions
              .map((item) => `<li>${item.extension}: ${item.count}</li>`)
              .join("")}
          </ul>
        </div>
      </div>
      <div class="retrieval-stat">
        <strong>${messages.retrievalRepoMap}</strong>
        <ul class="retrieval-list">
          ${retrieval.repoMap
            .slice(0, 12)
            .map((entry) => `<li>${entry.type === "directory" ? "[D]" : "[F]"} ${entry.path}</li>`)
            .join("")}
        </ul>
      </div>
    `
    : `<p class="panel-subtitle">${messages.retrievalIdle}</p>`;

  rootNode.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <h1>${messages.title}</h1>
          <p>${messages.subtitle}</p>
        </div>
        <div class="panel">
          <strong>${info.appName}</strong>
          <div class="panel-subtitle">v${info.version}</div>
        </div>
      </header>

      <section class="grid">
        <div class="panel">
          <h2>${messages.currentWorkspace}</h2>
          ${currentWorkspaceMarkup}
          <form id="workspace-form">
            <input id="workspace-path" name="workspacePath" placeholder="${messages.workspacePlaceholder}" />
            <button type="submit">${messages.submit}</button>
          </form>
          <p id="status-banner" class="status-banner"></p>
        </div>

        <section class="panel">
          <h2>${messages.retrieval}</h2>
          ${retrievalMarkup}
        </section>
      </section>

      <section class="grid">
        <section class="panel">
          <h2>${messages.recentWorkspaces}</h2>
          <ul class="workspace-list">${recentMarkup}</ul>
        </section>

        <section class="panel">
          <h2>${messages.health}</h2>
          <div class="health-grid">${healthMarkup}</div>
        </section>
      </section>

      <section class="grid">
        <section class="panel">
          <h2>${messages.logs}</h2>
          <ul class="log-list">${logsMarkup}</ul>
        </section>
        <section class="panel">
          <h2>${messages.retrievalRepoMap}</h2>
          <ul class="retrieval-list">
            ${
              retrieval?.repoMap
                .slice(0, 18)
                .map((entry) => `<li>${entry.type === "directory" ? "[D]" : "[F]"} ${entry.path}</li>`)
                .join("") ?? `<li>${messages.retrievalIdle}</li>`
            }
          </ul>
        </section>
      </section>
    </main>
  `;

  attachListeners(messages);
}

function attachListeners(messages: Messages): void {
  const form = document.querySelector<HTMLFormElement>("#workspace-form");
  const input = document.querySelector<HTMLInputElement>("#workspace-path");
  const banner = document.querySelector<HTMLParagraphElement>("#status-banner");
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-open-workspace]");

  const openWorkspace = async (workspacePath: string): Promise<void> => {
    const result = await window.digitalLife.workspace.open(workspacePath);
    if (!banner) {
      return;
    }

    if (result.ok) {
      banner.classList.remove("error");
      banner.textContent = `${messages.openSuccess} ${result.data.rootPath}`;
      await bootstrap();
      return;
    }

    banner.classList.add("error");
    banner.textContent = `${messages.openFailure} ${result.error.message}`;
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
}

void bootstrap();
