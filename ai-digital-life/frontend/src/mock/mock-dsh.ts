import type {
  DshBridge,
  DshVersionCatalog,
  DshVersionStatus,
  DshSourceStatus,
} from "../shared/ipc/dsh";

const MOCK_VERSION = "0.1.0-rc.8";
const MOCK_VERSION_PREV = "0.1.0-rc.7";
/** 内置预置版本（演示「已内置」徽章；刻意与当前选中版本不同，便于对照）。 */
const MOCK_BUNDLED_VERSION = "0.2.0";

const status: DshVersionStatus = {
  currentSelected: MOCK_VERSION,
  // 预置版本收编后就是一条普通已装版本，因此必须出现在 installed 里。
  installed: [MOCK_VERSION, MOCK_VERSION_PREV, MOCK_BUNDLED_VERSION],
  bundledVersion: MOCK_BUNDLED_VERSION,
  latestAvailable: "0.2.1-rc.2",
  hasUpdate: true,
  prereleaseAvailable: "0.2.1-rc.2",
  hasPrereleaseUpdate: true,
  prereleaseUnknown: false,
};

const MOCK_CATALOG: DshVersionCatalog = {
  stable: [
    { version: "0.2.0", publishedAt: "2026-09-29T09:56:27.000Z" },
    { version: "0.1.0", publishedAt: "2026-08-20T10:00:00.000Z" },
  ],
  prerelease: [{ version: "0.2.1-rc.2", publishedAt: "2026-10-17T08:36:31.000Z" }],
  latestStable: "0.2.0",
  latestPrerelease: "0.2.1-rc.2",
};

const sourceStatus: DshSourceStatus = {
  system: { path: "/usr/local/bin/dsh", version: MOCK_VERSION_PREV },
  running: null,
  versionSource: {
    mode: "auto",
    effective: "host",
    resolvedByMode: {
      auto: "host",
      host: "host",
      system: "system",
    },
    hostVersion: MOCK_VERSION,
  },
  config: {
    npm_registry: "https://registry.npmjs.org",
    dsh_mirror: null,
    source_mode: "auto",
    version_source: "auto",
    proxy: {
      mode: "auto",
      http_proxy: null,
      https_proxy: null,
      no_proxy: null,
    },
  },
};

function syncEffective(): void {
  const mode = sourceStatus.config.version_source;
  const hasHost = status.currentSelected !== null && status.installed.includes(status.currentSelected);
  // 偏好解析（忽略 running，mock 不模拟运行中进程）：与后端 resolve_effective_source 对齐。
  const resolveMode = (target: typeof mode) =>
    target === "host"
      ? hasHost
        ? "host"
        : "none"
      : target === "system"
        ? sourceStatus.system
          ? "system"
          : "none"
        : hasHost
          ? "host"
          : sourceStatus.system
            ? "system"
            : "none";
  sourceStatus.versionSource = {
    mode,
    effective: resolveMode(mode),
    resolvedByMode: {
      auto: resolveMode("auto"),
      host: resolveMode("host"),
      system: resolveMode("system"),
    },
    hostVersion: hasHost ? status.currentSelected : null,
  };
  sourceStatus.system = { path: "/usr/local/bin/dsh", version: MOCK_VERSION_PREV };
}

function cloneSourceStatus(): DshSourceStatus {
  return {
    ...sourceStatus,
    config: { ...sourceStatus.config, proxy: { ...sourceStatus.config.proxy } },
    versionSource: { ...sourceStatus.versionSource },
  };
}

export const mockDsh: DshBridge = {
  open: async () => ({ ok: true, data: { url: "http://127.0.0.1:61234", freedPort: false } }),
  restart: async () => ({
    ok: true,
    data: { restarted: true, url: "http://127.0.0.1:61234" },
  }),
  getVersionTask: async () => ({ ok: true, data: { task: null } }),
  cancelVersionTask: async () => ({ ok: true, data: true }),
  getVersionStatus: async () => ({ ok: true, data: { ...status, installed: [...status.installed] } }),
  getVersionCatalog: async () => ({ ok: true, data: MOCK_CATALOG }),
  installVersion: async (version, select = true) => {
    if (!status.installed.includes(version)) {
      status.installed = [version, ...status.installed];
    }
    // 覆盖该版本内容 → 不再算内置（与后端 install 里清 bundled.txt 一致）。
    if (status.bundledVersion === version) {
      status.bundledVersion = null;
    }
    if (select) {
      status.currentSelected = version;
    }
    syncEffective();
    return { ok: true, data: version };
  },
  update: async () => ({ ok: true, data: MOCK_VERSION }),
  revert: async (version) => {
    if (!status.installed.includes(version)) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: `version ${version} not installed` },
      };
    }
    status.currentSelected = version;
    syncEffective();
    return { ok: true, data: version };
  },
  uninstall: async (version) => {
    status.installed = status.installed.filter((v) => v !== version);
    // 内置只是「来源记录」：该版本卸载后不再算内置（与后端 bundled.txt 语义一致）。
    if (status.bundledVersion === version) {
      status.bundledVersion = null;
    }
    if (status.currentSelected === version) {
      status.currentSelected = status.installed[0] ?? null;
    }
    syncEffective();
    return { ok: true, data: true };
  },
  reinstall: async () => {
    // 重装会覆盖“当前选中版本”的内容 → 若它正是预置版本，则不再算内置（与后端一致）。
    if (status.bundledVersion === status.currentSelected) {
      status.bundledVersion = null;
    }
    return { ok: true, data: status.currentSelected ?? MOCK_VERSION };
  },
  getSourceStatus: async () => ({
    ok: true,
    data: cloneSourceStatus(),
  }),
  getRunning: async () => ({ ok: true, data: { running: sourceStatus.running } }),
  getSettingsSnapshot: async () => ({
    ok: true,
    data: {
      sourceStatus: cloneSourceStatus(),
      versionStatus: { ...status, installed: [...status.installed] },
      catalog: MOCK_CATALOG,
    },
  }),
  saveSourceConfig: async (config) => {
    if (config.version_source) {
      sourceStatus.config.version_source = config.version_source;
    }
    if (config.npm_registry) {
      sourceStatus.config.npm_registry = config.npm_registry;
    }
    if (config.source_mode) {
      sourceStatus.config.source_mode = config.source_mode;
    }
    syncEffective();
    return { ok: true, data: true };
  },
  testSource: async () => ({
    ok: true,
    data: { reachable: true, latency_ms: 42, error: null },
  }),
};
