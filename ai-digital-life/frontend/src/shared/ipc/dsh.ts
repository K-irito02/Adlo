import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

/**
 * dsh 下载源状态（bundled / system / running / config）
 */
export interface DshSourceStatus {
  bundled: { version: string; path: string } | null;
  system: { path: string; version: string | null } | null;
  running: { url: string; port: number } | null;
  config: {
    npm_registry: string;
    dsh_mirror: string | null;
    /** 下载源选择模式：auto=自动检测（延迟实测选优），manual=用户手选 */
    source_mode: 'auto' | 'manual';
    /** 代理模式（后端 ProxyMode snake_case 封闭值域：auto | manual | none） */
    proxy: {
      mode: 'auto' | 'manual' | 'none';
      http_proxy: string | null;
      https_proxy: string | null;
      no_proxy: string | null;
    };
  };
}

/**
 * dsh 下载源配置（可选字段，PATCH 语义）
 */
export interface DshSourceConfig {
  npm_registry?: string;
  dsh_mirror?: string | null;
  /** 下载源选择模式（PATCH：缺省不修改） */
  source_mode?: 'auto' | 'manual';
  proxy?: {
    mode?: 'auto' | 'manual' | 'none';
    http_proxy?: string | null;
    https_proxy?: string | null;
    no_proxy?: string | null;
  };
}

/**
 * 下载源可达性测试结果
 */
export interface DshTestResult {
  reachable: boolean;
  latency_ms: number | null;
  error: string | null;
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
   * 下次 open 即按该版本启动
   * @see httpBridge.ts → dsh.installVersion (/dsh/install-version)
   */
  installVersion: (version: string) => Promise<IpcResult<string>>;
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
   * 卸载指定版本
   * @see httpBridge.ts → dsh.uninstall (/dsh/uninstall)
   */
  uninstall: (version: string) => Promise<IpcResult<boolean>>;
  /**
   * 按当前选中版本重装最新可用版本，返回新版本串
   * @see httpBridge.ts → dsh.reinstall (/dsh/reinstall)
   */
  reinstall: () => Promise<IpcResult<string>>;
  /**
   * 获取 dsh 下载源状态（bundled / system / running / config）
   * @see httpBridge.ts → dsh.getSourceStatus (/dsh/source-status)
   */
  getSourceStatus: () => Promise<IpcResult<DshSourceStatus>>;
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
