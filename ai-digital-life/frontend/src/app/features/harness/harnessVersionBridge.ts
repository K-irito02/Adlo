import type {
  DshVersionCatalog,
  DshVersionSourceMode,
  DshVersionStatus,
  DshVersionTask,
  DshVersionTaskPhase,
} from '@shared/ipc/dsh';

/**
 * 通用版本卡片的唯一依赖面。
 *
 * 卡片不读任何 store、不访问 `window.digitalLife`：版本状态、目录、任务与全部
 * 变更操作都由各工具适配器实现本接口后注入。DSH（ticket #3/#4）与 OpenCode
 * 共用同一张卡片，工具专属内容通过 `HarnessVersionCard` 的插槽传入。
 */

export type HarnessVersionSourceMode = DshVersionSourceMode;
export type HarnessVersionTaskPhase = DshVersionTaskPhase;
export type HarnessVersionStatus = DshVersionStatus;
export type HarnessVersionCatalog = DshVersionCatalog;
export type HarnessVersionTask = DshVersionTask;

/** 通用反馈语调，与项目 toast 语义一致。 */
export type HarnessVersionTone = 'success' | 'warning' | 'error';

/** 卡片当前生效来源（`running` 仅供运行态工具，如 DSH）。 */
export type HarnessVersionEffectiveSource = 'running' | 'host' | 'system' | 'none';

/** 通用版本来源状态；`systemPath` 为系统安装路径（未检测到为 null）。 */
export interface HarnessVersionSourceStatus {
  mode: HarnessVersionSourceMode;
  effective: HarnessVersionEffectiveSource;
  systemPath: string | null;
  /** 系统安装的版本号（探测到路径但版本未知时为 null）。 */
  systemVersion?: string | null;
  /**
   * 来源状态是否已就绪（DSH 的 `resolvedByMode` 到达前为 false）。
   * 缺省按 true；配合 `capabilities.sourceManaged` 可避免首帧闪现管理项。
   */
  ready?: boolean;
  /**
   * 宿主是否管理版本（安装/切换/卸载/更新等管理项是否可用）。
   * 缺省按 true；DSH 在「系统安装」生效时置 false，卡片隐藏管理行。
   */
  managed?: boolean;
}

/** 一次版本变更操作的结果；`cancelled` 让卡片以警告而非错误提示收尾。 */
export interface HarnessVersionResult {
  ok: boolean;
  cancelled?: boolean;
  /** 已本地化的错误文案；缺省时卡片回退到通用失败文案。 */
  error?: string;
  /**
   * 适配器已通过其它通道提示（如工具自己的 toast / 全局错误卡片），
   * 卡片不再追加提示。
   */
  silent?: boolean;
  /** 适配器提供的成功文案；缺省时卡片使用通用成功文案。 */
  message?: string;
}

/**
 * 首屏快照。三份数据一次返回，避免分段到货导致卡片跳动。
 * `failed` 表示版本状态读取失败（卡片显示错误读数）。
 */
export interface HarnessVersionSnapshot<TSource = unknown> {
  status: HarnessVersionStatus | null;
  catalog: HarnessVersionCatalog | null;
  source: HarnessVersionSourceStatus | null;
  /** 工具专属来源数据（如 OpenCode 的 terminalInjection），原样交给插槽渲染。 */
  sourceExtra?: TSource | null;
  failed?: boolean;
  /** 版本目录拉取失败：通道显示「未知」而不是「官方暂无」。 */
  catalogFailed?: boolean;
}

/**
 * 渲染能力开关。未声明的能力按「不支持 / 不显示」处理。
 * 该结构刻意做成两种工具的并集，后续接入方无需改动卡片接口。
 */
export interface HarnessVersionCapabilities {
  /** 卸载当前版本需要二次点击确认（DSH 需要，OpenCode 不需要）。 */
  uninstallConfirm?: boolean;
  /** 版本来源切换方式：直接保存，或交给适配器自行确认（DSH 的切换对话框）。 */
  sourceModeChange?: 'immediate' | 'deferred';
  /**
   * 「检查更新」行的动作语义：`install`（直接装最新，OpenCode 缺省）或
   * `check`（只查询并提示，DSH）。`check` 需要适配器实现 `checkUpdate`。
   */
  updateAction?: 'install' | 'check';
  /** 任务行是否显示完成百分比（OpenCode 显示，DSH 不显示）。 */
  taskPercent?: boolean;
  /** 任务行是否显示已完成/总量（`done/total`）。DSH 把计数并入阶段文案，故关闭。 */
  taskCounts?: boolean;
  /** 显示「恢复默认」来源操作。 */
  resetSourceAction?: boolean;
  /**
   * 行内刷新按钮（检查更新/当前版本/正式版本/预发布版本）：标题前置、
   * 问号后置；分腿在途时该行控件区扫光。缺省不渲染（DSH 无此按钮）。
   */
  refreshRows?: boolean;
  /**
   * 稳定/预发布双通道使用行内版本选择器（下拉菜单列出该通道全部版本），
   * 替代 OpenCode 风格的 `<select>` + 单个最新预发布行。DSH 需要。
   */
  channelPicker?: boolean;
  /**
   * 手动版本行与已安装版本独立卡：`'none'`（缺省）只渲染旧 DSH 的单卡 6 行；
   * `'manual+installed'` 额外渲染手动版本行（主卡内）与已安装版本独立卡
   * （OpenCode 保留其原有功能）。与版本来源行/任务行的显隐无关。
   */
  extraRows?: 'none' | 'manual+installed';
  /**
   * 适配器拥有来源就绪/托管语义：只有 `source.ready === true` 且非系统托管时
   * 才渲染管理行（DSH）。缺省按 `source.managed` 判定。
   */
  sourceManaged?: boolean;
}

/** 适配器可覆盖的文案（工具术语不同：DSH 用「正式版本/预发布版本」）。 */
export interface HarnessVersionLabels {
  stable?: string;
  prerelease?: string;
  /** 生效来源为 `running` 时的读数标签（DSH 的运行态模型）。 */
  runningSource?: string;
  /** 二次确认卸载当前版本时，当前版本行下方的提示。 */
  uninstallCurrentHint?: string;
}

/**
 * 工具适配器实现的版本桥接。
 *
 * 所有 Promise 都返回 `HarnessVersionResult`，适配器负责把 IPC 错误转成
 * 已本地化文案；卡片只消费结果，不感知底层 IPC。
 */
export interface HarnessVersionBridge<TSource = unknown> {
  /** 已本地化的工具名，用于通用文案的 `{tool}` 插值。 */
  toolName: string;
  /** 底层桥是否可用；false 时卡片所有操作保持禁用。 */
  available: boolean;
  capabilities?: HarnessVersionCapabilities;
  labels?: HarnessVersionLabels;
  /** 首屏/操作完成后重新读取版本状态。 */
  load: () => Promise<HarnessVersionSnapshot<TSource>>;
  /**
   * 会话级快照种子（stale-while-revalidate）：切组重挂时首帧即瞬显上次快照，
   * 后台仍走 `load` 静默再验证。缺省（冷启动）返回 null，卡片画骨架。
   * DSH 由 store 常驻供给；OpenCode 由适配器模块缓存供给。
   */
  peekSnapshot?: () => HarnessVersionSnapshot<TSource> | null;
  /**
   * 关组前的版本来源偏好：冷启动骨架按它定形（含/不含管理三行）。
   * 缺省按 `auto`（管理行按含画，解析为系统后行隐藏）。
   */
  peekSourceMode?: () => HarnessVersionSourceMode | null;
  /** 查询进行中的版本任务；无任务返回 null。 */
  getTask: () => Promise<HarnessVersionTask | null>;
  install: (version: string) => Promise<HarnessVersionResult>;
  update: () => Promise<HarnessVersionResult>;
  /**
   * 仅检查更新（`capabilities.updateAction === 'check'`）：适配器自行查询并
   * 通过 `notify` 给出结果文案，卡片只负责忙碌态。
   */
  checkUpdate?: () => Promise<HarnessVersionResult>;
  /** 切换到某个已安装版本。 */
  revert: (version: string) => Promise<HarnessVersionResult>;
  /** 重装某个已安装的非当前版本（不改变选中）；缺省回退到 `install(version)`。 */
  reinstallVersion?: (version: string) => Promise<HarnessVersionResult>;
  uninstall: (version: string) => Promise<HarnessVersionResult>;
  reinstall: () => Promise<HarnessVersionResult>;
  cancel: () => Promise<HarnessVersionResult>;
  saveSourceMode: (mode: HarnessVersionSourceMode) => Promise<HarnessVersionResult>;
  /** 「恢复默认」来源操作（OpenCode 为 auto）。 */
  resetSourceMode: () => Promise<HarnessVersionResult>;
  /**
   * 延迟确认模式下的来源切换（`capabilities.sourceModeChange === 'deferred'`）。
   * 未提供时卡片回退到 `saveSourceMode`。
   */
  changeSourceMode?: (mode: HarnessVersionSourceMode) => Promise<HarnessVersionResult>;
  /**
   * 任务阶段文案（适配器术语不同）。`task === null` 表示任务已结束但操作仍在
   * 收尾（重启长尾），适配器应返回「收尾中」一类文案；缺省回退通用阶段文案。
   */
  taskStageText?: (task: HarnessVersionTask | null) => string;
  /** 取消按钮文案（DSH 按任务种类区分安装/卸载/重装）；缺省为通用「取消」。 */
  taskCancelLabel?: (task: HarnessVersionTask) => string;
  /** 变更成功后的运行态编排钩子（重启等）；失败按操作失败提示。 */
  afterMutation?: (kind: HarnessVersionMutation) => Promise<HarnessVersionResult>;
  /** 卡片反馈出口（toast）；由适配器注入，卡片不直接依赖 store。 */
  notify: (message: string, tone: HarnessVersionTone) => void;
}

export type HarnessVersionMutation = 'install' | 'update' | 'switch' | 'uninstall' | 'reinstall';
