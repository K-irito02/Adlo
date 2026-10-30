import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

/**
 * 运行中 dsh 进程信息。
 * `managed` 为 true 表示该进程是本应用本次会话拉起并持有 Child 的，
 * `version` 即本次 spawn 的来源版本；外部复用一律 `managed=false` +
 * `version=null`，UI 按未知展示、不猜版本。
 * `source` 记录拉起来源：`host`/`system` 为宿主拉起，`external` 为外部进程。
 */
export interface DshRunningInfo {
  url: string;
  port: number;
  managed: boolean;
  version: string | null;
  source: DshRunningSource;
}

export type DshRunningSource = 'host' | 'system' | 'external';

/**
 * dsh 下载源状态（system / running / config）
 */
export interface DshSourceStatus {
  system: { path: string; version: string | null } | null;
  running: DshRunningInfo | null;
  /**
   * 宿主正在拉起 dsh（spawn 进行中）。前端读数据此显示骨架胶囊，避免
   * 「未知/旧值 → 真实版本」的可见跳变；缺省按 false 处理。
   */
  starting?: boolean;
  /**
   * 版本来源偏好与实际生效来源。
   * - `effective`：运行时实际来源（可能为 `running`），用于当前版本读数与运行状态。
   * - `resolvedByMode`：三种模式在忽略 running 下的偏好解析结果，用于管理项显隐、
   *   切源确认与无可用来源提示。running 可能是应用自启或用户外部手动拉起，
   *   不应遮蔽来源偏好。
   */
  versionSource: {
    mode: DshVersionSourceMode;
    effective: DshEffectiveSource;
    resolvedByMode: Record<DshVersionSourceMode, DshResolvedSource>;
    /** 宿主当前选中且完整安装的版本号（无可用宿主版本为 null）。 */
    hostVersion: string | null;
  };
  config: {
    npm_registry: string;
    dsh_mirror: string | null;
    /** 下载源选择模式：auto=自动检测（延迟实测选优），manual=用户手选 */
    source_mode: 'auto' | 'manual';
    /** 版本来源偏好：auto=自动检测，system=系统安装，host=宿主托管 */
    version_source: DshVersionSourceMode;
    /** 代理模式（后端 ProxyMode snake_case 封闭值域：auto | manual | none） */
    proxy: {
      mode: 'auto' | 'manual' | 'none';
      http_proxy: string | null;
      https_proxy: string | null;
      no_proxy: string | null;
    };
  };
  /**
   * 代理「背后真实状态」（服务端按当前代理配置 + 端点可达性计算）。
   * 自动检测代理不可达时服务端已静默改走直连，下拉仍显示「自动检测」，
   * 界面用蓝色提示行说明真实状态；缺省（旧后端/首帧）不渲染提示。
   */
  proxyEffective?: DshProxyEffective;
}

/** 代理生效状态（与 Rust `ProxyHealth` camelCase 对齐；端点已脱敏）。 */
export interface DshProxyEffective {
  /** 实际使用的代理端点；直连为 null。 */
  endpoint: string | null;
  /** 端点可达性（直连恒 true）。 */
  reachable: boolean;
  /** 当前是否会绕过代理（模式=关闭，或自动检测回退直连）。 */
  usingDirect: boolean;
  /** 自动检测因代理不可达而回退直连。 */
  autoFallback: boolean;
}

export type DshVersionSourceMode = 'auto' | 'system' | 'host';
/** 实际生效来源。所有版本都由通用版本层按普通宿主版本管理，不存在独立来源。 */
export type DshEffectiveSource = 'running' | 'host' | 'system' | 'none';
/** 忽略 running 后的偏好解析来源（管理项显隐 / 切源判定的唯一依据）。 */
export type DshResolvedSource = 'host' | 'system' | 'none';

/** `/dsh/restart` 结果：是否重启过、重启后的地址。 */
export interface DshRestartResult {
  restarted: boolean;
  url: string | null;
}

/** `/dsh/running` 结果：轻量运行状态（不触发 where/版本探测）。 */
export interface DshRunningResult {
  running: DshRunningInfo | null;
  /** 宿主是否正在拉起 dsh（spawn 进行中）。 */
  starting: boolean;
}

/**
 * `/dsh/settings-snapshot` 结果：版本管理块首屏原子快照。
 * 三份数据一次返回，store 单次提交，避免分段到货导致的块内跳动；`catalog` 为 null 表示
 * 官方目录当前不可得（服务端无缓存且拉取失败）。
 * `sourceStatus` / `versionStatus` 任一腿失败时该腿为 null（L2 按腿降级，不再全有全无）：
 * 前端保留该腿旧值，无旧值时读数区切错误态。
 */
export interface DshSettingsSnapshot {
  sourceStatus: DshSourceStatus | null;
  versionStatus: DshVersionStatus | null;
  catalog: DshVersionCatalog | null;
}

export type DshVersionTaskKind = `dsh-${'install' | 'uninstall' | 'reinstall'}`;
export type DshVersionTaskPhase = 'preparing' | 'installing' | 'removing' | 'finalizing';

/** 版本任务（安装/卸载/重装）真实进度。 */
export interface DshVersionTask {
  kind: DshVersionTaskKind;
  version: string;
  phase: DshVersionTaskPhase;
  /** 0–100；null 表示总量未知（不确定进度条）。 */
  percent: number | null;
  done: number;
  total: number;
  cancellable: boolean;
}

export interface DshVersionTaskResult {
  task: DshVersionTask | null;
}

/**
 * dsh 下载源配置（可选字段，PATCH 语义）
 */
export interface DshSourceConfig {
  npm_registry?: string;
  dsh_mirror?: string | null;
  /** 下载源选择模式（PATCH：缺省不修改） */
  source_mode?: 'auto' | 'manual';
  /** 版本来源偏好（PATCH：缺省不修改） */
  version_source?: DshVersionSourceMode;
  proxy?: {
    mode?: 'auto' | 'manual' | 'none';
    http_proxy?: string | null;
    https_proxy?: string | null;
    no_proxy?: string | null;
  };
}

/**
 * 下载源探测的失败分类（与 Rust `adl_download_source::SourceErrorKind` 对齐）：
 * 界面按它给本地化、可操作的文案，不直接展示底层错误串。
 */
export type DshSourceProbeErrorKind = 'proxy_unreachable' | 'network' | 'http' | 'unknown';

/**
 * 下载源可达性测试结果
 */
export interface DshTestResult {
  reachable: boolean;
  latency_ms: number | null;
  /** 底层错误细节（日志/诊断用；界面展示走 `error_kind`）。 */
  error: string | null;
  error_kind?: DshSourceProbeErrorKind | null;
  /** 本次探测实际使用的代理端点（已脱敏）；直连为 null。 */
  proxy?: string | null;
  /** 目标返回的 HTTP 状态码（仅 `http` 类失败）。 */
  http_status?: number | null;
}

/**
 * dsh（DeepSeek Harness）宿主壳桥接能力。
 * 业务逻辑位于 `crates/server` 的 `/dsh/*` HTTP handler（httpBridge 直连）。
 * 用于: 拉起 dsh 进程、查询/升级/回退/卸载/重装 dsh cli 版本。
 */
export interface DshBridge {
  /**
   * 拉起 dsh 进程并返回就绪信息（已运行时返回已有 URL）
   * @returns 就绪 URL + 是否释放过被残留 dsh 占用的默认端口，如 http://127.0.0.1:<port>
   * @see httpBridge.ts → dsh.open (/dsh/open)
   */
  open: () => Promise<IpcResult<DshOpenResult>>;
  /**
   * 重启正在运行的 dsh（宿主托管或经验证的外部进程），返回新地址
   */
  restart: () => Promise<IpcResult<DshRestartResult>>;
  /**
   * 查询当前版本任务进度（安装/卸载/重装）
   */
  getVersionTask: () => Promise<IpcResult<DshVersionTaskResult>>;
  /**
   * 请求取消当前版本任务
   */
  cancelVersionTask: () => Promise<IpcResult<boolean>>;
  /**
   * 查询 dsh 版本目录状态（当前选中/已装列表/最新可用/是否有更新，含预发布通道）
   * @see httpBridge.ts → dsh.getVersionStatus (/dsh/get-version-status)
   */
  getVersionStatus: () => Promise<IpcResult<DshVersionStatus>>;
  /**
   * 查询官方版本目录（正式版/预发布分桶 + 各自最新 + 发布时间）
   * @see httpBridge.ts → dsh.getVersionCatalog (/dsh/version-catalog)
   */
  getVersionCatalog: () => Promise<IpcResult<DshVersionCatalog>>;
  /**
   * 安装指定版本（正式版或预发布均可，需官方确已发布），返回该版本串；
   * select 缺省 true（登记并选中，下次 open 即按该版本启动），false 则只修
   * 目录、保持原选中（行内“重装非当前”）。
   * @see httpBridge.ts → dsh.installVersion (/dsh/install-version)
   */
  installVersion: (version: string, select?: boolean) => Promise<IpcResult<string>>;
  /**
   * 升级 dsh 到最新可用版本，返回新版本串
   * @see httpBridge.ts → dsh.update (/dsh/update)
   */
  update: () => Promise<IpcResult<string>>;
  /**
   * 回退到指定已装版本，返回该版本串
   * @see httpBridge.ts → dsh.revert (/dsh/revert)
   */
  revert: (version: string) => Promise<IpcResult<string>>;
  /**
   * 卸载指定版本（安装包不预置版本，所有版本都是普通宿主版本，删除目录即可）
   * @see httpBridge.ts → dsh.uninstall (/dsh/uninstall)
   */
  uninstall: (version: string) => Promise<IpcResult<boolean>>;
  /**
   * 按当前选中版本重装最新可用版本，返回新版本串
   * @see httpBridge.ts → dsh.reinstall (/dsh/reinstall)
   */
  reinstall: () => Promise<IpcResult<string>>;
  /**
   * 获取 dsh 下载源状态（system / running / config）
   * @see httpBridge.ts → dsh.getSourceStatus (/dsh/source-status)
   */
  getSourceStatus: () => Promise<IpcResult<DshSourceStatus>>;
  /**
   * 轻量运行状态（仅探测端口 + 宿主托管，不跑 where/版本探测）；设置面板轮询用
   * @see httpBridge.ts → dsh.getRunning (/dsh/running)
   */
  getRunning: () => Promise<IpcResult<DshRunningResult>>;
  /**
   * 版本管理块首屏原子快照（source-status + version-status + catalog 一次返回）
   * @see httpBridge.ts → dsh.getSettingsSnapshot (/dsh/settings-snapshot)
   */
  getSettingsSnapshot: () => Promise<IpcResult<DshSettingsSnapshot>>;
  /**
   * 保存 dsh 下载源配置（npm registry / mirror / proxy）
   * @see httpBridge.ts → dsh.saveSourceConfig (/dsh/source-config)
   */
  saveSourceConfig: (config: DshSourceConfig) => Promise<IpcResult<boolean>>;
  /**
   * 测试指定下载源 URL 的可达性和延迟
   * @see httpBridge.ts → dsh.testSource (/dsh/test-source)
   */
  testSource: (url: string) => Promise<IpcResult<DshTestResult>>;
}

/**
 * `/dsh/open` 结果：就绪 URL + 是否因端口被残留 dsh 占用而自动释放过进程。
 */
export interface DshOpenResult {
  url: string | null;
  freedPort: boolean;
}

/**
 * dsh 版本目录状态（与 Rust `adl_dsh_version::VersionStatus` serde camelCase 对齐）
 */
export interface DshVersionStatus {
  currentSelected: string | null;
  /** 已装到应用数据目录的版本（全部为普通宿主版本）。 */
  installed: string[];
  latestAvailable: string | null;
  hasUpdate: boolean;
  /** 最新预发布版本（registry `next` 标签；查询失败或官方暂无则为 null） */
  prereleaseAvailable: string | null;
  /** 当前是否有更新的预发布可尝试（尝鲜通道提示用） */
  hasPrereleaseUpdate: boolean;
  /** 预发布通道是否未知（目录拉取失败；此时不得按“暂无预发布”展示） */
  prereleaseUnknown: boolean;
}

/**
 * 官方已发布版本条目（与 Rust `adl_dsh_version::VersionInfo` 对齐）
 */
export interface DshVersionInfo {
  version: string;
  /** 发布时间（RFC3339），缺失为 null */
  publishedAt: string | null;
}

/**
 * 官方版本目录（与 Rust `adl_dsh_version::VersionCatalog` 对齐）
 */
export interface DshVersionCatalog {
  stable: DshVersionInfo[];
  prerelease: DshVersionInfo[];
  latestStable: string | null;
  latestPrerelease: string | null;
}
