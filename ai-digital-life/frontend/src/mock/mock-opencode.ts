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
const MOCK_V2_VERSION = '2.2.5';
const MOCK_V2_OLDER = '2.0.0';
const MOCK_BETA = '0.0.0-beta-202608110357';

/**
 * 离线回退快照：无网络 / 上游不可达时沿用，保证设置页与单测离线可用。
 * 在线时 `getVersionStatus` / `getVersionCatalog` 会先查上游 packument 并覆盖。
 */
const FALLBACK_CATALOG: DshVersionCatalog = {
  stable: [
    { version: MOCK_V2_VERSION, publishedAt: '2026-11-01T00:00:00.000Z' },
    { version: MOCK_V2_OLDER, publishedAt: '2026-10-20T00:00:00.000Z' },
    { version: MOCK_VERSION, publishedAt: '2026-10-28T06:17:11.100Z' },
    { version: '1.19.4', publishedAt: '2026-10-27T10:00:00.000Z' },
  ],
  prerelease: [{ version: MOCK_BETA, publishedAt: '2026-08-11T03:57:00.000Z' }],
  latestStable: MOCK_V2_VERSION,
  latestPrerelease: MOCK_BETA,
};

const status: DshVersionStatus = {
  currentSelected: MOCK_VERSION,
  installed: [MOCK_VERSION],
  latestAvailable: MOCK_V2_VERSION,
  hasUpdate: true,
  prereleaseAvailable: MOCK_BETA,
  hasPrereleaseUpdate: true,
  prereleaseUnknown: false,
};

/** 与 Rust `spec::OPENCODE` 同口径：稳定版 + beta（`beta-` 前缀）各保留最新 50 个。 */
const STABLE_LIMIT = 50;
const PRERELEASE_LIMIT = 50;
/** `beta-`（带横线）：排除上游遗留 `0.1.0-beta3`（`pre` 为 `beta3` 会反超全部真 beta）。 */
const PRERELEASE_PREFIX = 'beta-';
const LIVE_TIMEOUT_MS = 10_000;
/** 设置页每次挂载/操作后都会刷 status+catalog：在途去重 + 5 分钟复用，避免重复拉几 MB 的 packument。 */
const LIVE_TTL_MS = 5 * 60 * 1000;

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

function parseSemver(version: string): ParsedSemver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
    version.trim(),
  );
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : [],
  };
}

function isNumericIdentifier(id: string): boolean {
  return /^\d+$/.test(id);
}

/** 与 Rust `semver` 排序同向：主版本数值比 → 无 pre 大于有 pre → pre 标识逐段比。 */
export function compareOpencodeSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (pa.major !== pb.major) {
    return pa.major - pb.major;
  }
  if (pa.minor !== pb.minor) {
    return pa.minor - pb.minor;
  }
  if (pa.patch !== pb.patch) {
    return pa.patch - pb.patch;
  }
  if (pa.pre.length === 0 && pb.pre.length === 0) {
    return 0;
  }
  if (pa.pre.length === 0) {
    return 1;
  }
  if (pb.pre.length === 0) {
    return -1;
  }
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i += 1) {
    const ia = pa.pre[i];
    const ib = pb.pre[i];
    if (ia === undefined) {
      return -1;
    }
    if (ib === undefined) {
      return 1;
    }
    if (ia === ib) {
      continue;
    }
    const na = isNumericIdentifier(ia);
    const nb = isNumericIdentifier(ib);
    if (na && nb) {
      return Number(ia) - Number(ib);
    }
    if (na) {
      return -1;
    }
    if (nb) {
      return 1;
    }
    return ia < ib ? -1 : 1;
  }
  return 0;
}

/** 与 Rust `semver_is_newer` 同语义：`latest` 是否严格新于 `current`。 */
function isSemverNewer(current: string | null, latest: string | null): boolean {
  if (!latest) {
    return false;
  }
  if (!current) {
    return true;
  }
  if (!parseSemver(current) || !parseSemver(latest)) {
    return false;
  }
  return compareOpencodeSemver(current, latest) < 0;
}

function prereleaseOf(version: string): string {
  const idx = version.indexOf('-');
  return idx < 0 ? '' : version.slice(idx + 1);
}

/**
 * 把 npm packument 按 Rust `parse_catalog` 同口径拆成版本目录：
 * 正式版（无 pre）+ `beta-` 预发布各按 semver 降序取 50，`latest`/`beta` dist-tag
 * 须落在桶内否则回退桶首。入参异常时返回 null（调用方回退快照）。
 */
export function parseOpencodePackument(json: unknown): DshVersionCatalog | null {
  if (!json || typeof json !== 'object') {
    return null;
  }
  const record = json as {
    versions?: unknown;
    time?: unknown;
    ['dist-tags']?: unknown;
  };
  if (!record.versions || typeof record.versions !== 'object') {
    return null;
  }
  const time =
    record.time && typeof record.time === 'object'
      ? (record.time as Record<string, unknown>)
      : null;
  const tags =
    record['dist-tags'] && typeof record['dist-tags'] === 'object'
      ? (record['dist-tags'] as Record<string, unknown>)
      : null;
  const stable: string[] = [];
  const prerelease: string[] = [];
  for (const name of Object.keys(record.versions as Record<string, unknown>)) {
    const parsed = parseSemver(name);
    if (!parsed) {
      continue;
    }
    if (parsed.pre.length === 0) {
      stable.push(name);
    } else if (prereleaseOf(name).startsWith(PRERELEASE_PREFIX)) {
      prerelease.push(name);
    }
  }
  const desc = (x: string, y: string) => compareOpencodeSemver(y, x);
  stable.sort(desc);
  prerelease.sort(desc);
  const stableKept = stable.slice(0, STABLE_LIMIT);
  const prereleaseKept = prerelease.slice(0, PRERELEASE_LIMIT);
  const publishedAt = (version: string): string | null => {
    const hit = time?.[version];
    return typeof hit === 'string' ? hit : null;
  };
  const tagLatest = typeof tags?.['latest'] === 'string' ? (tags['latest'] as string) : null;
  const tagBeta = typeof tags?.['beta'] === 'string' ? (tags['beta'] as string) : null;
  const latestStable =
    tagLatest && stableKept.includes(tagLatest) ? tagLatest : (stableKept[0] ?? null);
  const latestPrerelease =
    tagBeta && prereleaseKept.includes(tagBeta) ? tagBeta : (prereleaseKept[0] ?? null);
  return {
    stable: stableKept.map((version) => ({ version, publishedAt: publishedAt(version) })),
    prerelease: prereleaseKept.map((version) => ({ version, publishedAt: publishedAt(version) })),
    latestStable,
    latestPrerelease,
  };
}

/**
 * 合并 1.x `opencode-ai` 与 2.x `@opencode/cli` 的目录（与 Rust
 * `fetch_catalog_for_lines` 同口径）：按 semver 降序去重，latest 取桶首。
 */
export function mergeOpencodeCatalogs(
  catalogs: DshVersionCatalog[],
): DshVersionCatalog {
  const stable = catalogs
    .flatMap((catalog) => catalog.stable)
    .sort((a, b) => compareOpencodeSemver(b.version, a.version));
  const prerelease = catalogs
    .flatMap((catalog) => catalog.prerelease)
    .sort((a, b) => compareOpencodeSemver(b.version, a.version));
  const dedupe = <T extends { version: string }>(items: T[]): T[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.version)) {
        return false;
      }
      seen.add(item.version);
      return true;
    });
  };
  const stableKept = dedupe(stable);
  const prereleaseKept = dedupe(prerelease);
  return {
    stable: stableKept,
    prerelease: prereleaseKept,
    latestStable: stableKept[0]?.version ?? null,
    latestPrerelease: prereleaseKept[0]?.version ?? null,
  };
}

let liveCache: { at: number; catalog: DshVersionCatalog } | null = null;
let liveInflight: Promise<DshVersionCatalog | null> | null = null;

function registryBase(): string {
  const raw = sourceStatus.config.npm_registry?.trim() || 'https://registry.npmjs.org';
  return raw.replace(/\/+$/, '');
}

/**
 * 直查上游 packument（`GET {registry}/opencode-ai`，与 Rust `fetch_catalog_for`
 * 同一数据源，尊重下载源镜像配置）。失败/超时/无 fetch 环境一律返回 null，
 * 调用方回退离线快照，不得把网络故障变成设置页报错。
 */
async function fetchLiveCatalog(): Promise<DshVersionCatalog | null> {
  const now = Date.now();
  if (liveCache && now - liveCache.at < LIVE_TTL_MS) {
    return liveCache.catalog;
  }
  if (liveInflight) {
    return liveInflight;
  }
  if (typeof fetch === 'undefined') {
    return null;
  }
  liveInflight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
    const fetchPackument = async (packageName: string): Promise<DshVersionCatalog | null> => {
      try {
        const resp = await fetch(`${registryBase()}/${packageName}`, {
          signal: controller.signal,
        });
        if (!resp.ok) {
          return null;
        }
        return parseOpencodePackument(await resp.json());
      } catch {
        return null;
      }
    };
    try {
      const [v1, v2] = await Promise.all([
        fetchPackument('opencode-ai'),
        fetchPackument('@opencode/cli'),
      ]);
      const catalogs = [v1, v2].filter((catalog): catalog is DshVersionCatalog => catalog !== null);
      return catalogs.length > 0 ? mergeOpencodeCatalogs(catalogs) : null;
    } finally {
      clearTimeout(timer);
    }
  })();
  try {
    const result = await liveInflight;
    if (result) {
      liveCache = { at: Date.now(), catalog: result };
    }
    return result;
  } finally {
    liveInflight = null;
  }
}

/** 上游查到即按 Rust `get_version_status_for` 同语义刷新最新版与更新标记。 */
function syncLiveStatus(catalog: DshVersionCatalog): void {
  status.latestAvailable = catalog.latestStable;
  status.hasUpdate = isSemverNewer(status.currentSelected, catalog.latestStable);
  status.prereleaseAvailable = catalog.latestPrerelease;
  status.hasPrereleaseUpdate = isSemverNewer(status.currentSelected, catalog.latestPrerelease);
  status.prereleaseUnknown = false;
}

function cloneCatalog(catalog: DshVersionCatalog): DshVersionCatalog {
  return {
    ...catalog,
    stable: catalog.stable.map((hit) => ({ ...hit })),
    prerelease: catalog.prerelease.map((hit) => ({ ...hit })),
  };
}

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
  getVersionStatus: async () => {
    const live = await fetchLiveCatalog();
    if (live) {
      syncLiveStatus(live);
    }
    return ok({ ...status, installed: [...status.installed] });
  },
  getVersionCatalog: async () => {
    const live = await fetchLiveCatalog();
    return ok(cloneCatalog(live ?? FALLBACK_CATALOG));
  },
  installVersion: async (version: string, _select?: boolean) => {
    const trimmed = version.trim();
    if (!trimmed) {
      return fail('version is empty');
    }
    const live = await fetchLiveCatalog();
    const catalog = live ?? FALLBACK_CATALOG;
    const known =
      catalog.stable.some((v) => v.version === trimmed) ||
      catalog.prerelease.some((v) => v.version === trimmed) ||
      status.installed.includes(trimmed);
    if (!known) {
      return fail(`version ${trimmed} is not published upstream`);
    }
    if (!status.installed.includes(trimmed)) {
      status.installed = [trimmed, ...status.installed];
    }
    status.currentSelected = trimmed;
    status.hasUpdate = isSemverNewer(trimmed, status.latestAvailable);
    status.hasPrereleaseUpdate = isSemverNewer(trimmed, status.prereleaseAvailable);
    syncEffective();
    return ok(trimmed);
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
