import type {
  OpencodeBridge,
  OpencodeSourceStatus,
} from '../shared/ipc/opencode';
import type {
  DshVersionCatalog,
  DshVersionStatus,
  DshVersionTaskResult,
} from '../shared/ipc/dsh';

const MOCK_VERSION = '1.19.5';
const MOCK_BETA = '0.0.0-beta-202608110357';

const status: DshVersionStatus = {
  currentSelected: MOCK_VERSION,
  installed: [MOCK_VERSION],
  latestAvailable: MOCK_VERSION,
  hasUpdate: false,
  prereleaseAvailable: MOCK_BETA,
  hasPrereleaseUpdate: true,
  prereleaseUnknown: false,
};

const catalog: DshVersionCatalog = {
  stable: [
    { version: MOCK_VERSION, publishedAt: '2026-10-28T06:17:11.100Z' },
    { version: '1.19.4', publishedAt: '2026-10-27T10:00:00.000Z' },
  ],
  prerelease: [{ version: MOCK_BETA, publishedAt: '2026-08-11T03:57:00.000Z' }],
  latestStable: MOCK_VERSION,
  latestPrerelease: MOCK_BETA,
};

const sourceStatus: OpencodeSourceStatus = {
  system: null,
  versionSource: {
    mode: 'auto',
    effective: 'host',
    resolvedByMode: { auto: 'host', host: 'host', system: 'none' },
    hostVersion: MOCK_VERSION,
  },
  config: { version_source: 'auto', source_mode: 'auto', npm_registry: 'https://registry.npmjs.org' },
  terminalInjection: true,
};

function syncEffective(): void {
  const mode = sourceStatus.config.version_source;
  const hasHost = status.currentSelected !== null && status.installed.includes(status.currentSelected);
  const resolve = (m: typeof mode) =>
    m === 'host'
      ? hasHost
        ? ('host' as const)
        : ('none' as const)
      : m === 'system'
        ? sourceStatus.system
          ? ('system' as const)
          : ('none' as const)
        : hasHost
          ? ('host' as const)
          : sourceStatus.system
            ? ('system' as const)
            : ('none' as const);
  sourceStatus.versionSource = {
    mode,
    effective: resolve(mode),
    resolvedByMode: { auto: resolve('auto'), host: resolve('host'), system: resolve('system') },
    hostVersion: hasHost ? status.currentSelected : null,
  };
}

const ok = <T>(data: T) => Promise.resolve({ ok: true as const, data });
const fail = (message: string) => Promise.resolve({ ok: false as const, error: { code: 'INVALID_INPUT', message } });

export const mockOpencode: OpencodeBridge = {
  getVersionTask: () => ok<DshVersionTaskResult>({ task: null }),
  cancelVersionTask: () => ok(true),
  getVersionStatus: () => ok({ ...status, installed: [...status.installed] }),
  getVersionCatalog: () => ok(catalog),
  installVersion: (version: string, _select?: boolean) => {
    if (!catalog.stable.some((v) => v.version === version) && !catalog.prerelease.some((v) => v.version === version)) {
      return fail(`version ${version} is not published upstream`);
    }
    if (!status.installed.includes(version)) {
      status.installed = [version, ...status.installed];
    }
    status.currentSelected = version;
    status.hasUpdate = false;
    syncEffective();
    return ok(version);
  },
  update: () => ok(MOCK_VERSION),
  revert: (version: string) => {
    if (!status.installed.includes(version)) {
      return fail(`version ${version} not installed`);
    }
    status.currentSelected = version;
    syncEffective();
    return ok(version);
  },
  uninstall: (version: string) => {
    status.installed = status.installed.filter((v) => v !== version);
    if (status.currentSelected === version) {
      status.currentSelected = status.installed[0] ?? null;
    }
    syncEffective();
    return ok(true);
  },
  reinstall: () => ok(status.currentSelected ?? MOCK_VERSION),
  getSourceStatus: () => ok(sourceStatus),
  saveVersionSource: (mode) => {
    sourceStatus.config.version_source = mode;
    syncEffective();
    return ok(true);
  },
  setTerminalInjection: (enabled) => {
    sourceStatus.terminalInjection = enabled;
    return ok(true);
  },
};
