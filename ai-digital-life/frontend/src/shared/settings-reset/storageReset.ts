import type { IpcError, IpcResult } from '@ai-digital-life/kernel';
import type { DownloadSettings } from '@shared/ipc/download';
import type {
  StoragePathPatch,
  StoragePreflight,
  StorageStatus,
  TreeCacheStats,
} from '@shared/ipc/storage';
import { resetDownloadPathToDefault } from './downloadPathReset';
import type { DownloadPathResetDeps, DownloadPathResetResult, GroupResetResult } from './types';

/** 仅声明本模块用到的成员，避免依赖完整 bridge 类型。 */
export interface StorageBridgeLike {
  preflight(patch: StoragePathPatch): Promise<IpcResult<StoragePreflight>>;
}

export type StorageTreeBlock = 'full' | 'reenable' | 'ttl' | 'hidden';
export type StorageDownloadBlock = 'on' | 'off' | 'switchOnly' | 'hidden';

export interface StorageResetBlocks {
  coreNeeded: boolean;
  tree: StorageTreeBlock;
  download: StorageDownloadBlock;
}

/** 执行块载荷：执行期不消费 preflight（仅计算/展示侧需要）。 */
export interface StorageResetExecutePlan {
  blocks: StorageResetBlocks;
  /** 计划生成时刻的下载迁移开关（程序化流程无对话框快照，取实时值）。 */
  migrateAtOpen: boolean;
}

export interface StorageResetPlan extends StorageResetExecutePlan {
  preflight: StoragePreflight | null;
}

/**
 * 存储恢复计划的计算结果（判别联合，供对话框区分「无事可做」与「不可用」）：
 * - `ready`：得到可执行计划；
 * - `allDefault`：各块均已默认，存储无事可做（正常跳过）；
 * - `unavailable`：无桥 / 状态不可读 / 核心预检 IPC 调用失败（无法判定）。
 */
export type StorageResetPlanResult =
  | { status: 'ready'; plan: StorageResetPlan }
  | { status: 'allDefault' }
  | { status: 'unavailable' };

/** 计划计算所需依赖：只读状态 / 预检 / 默认性判定数据源。 */
export interface StorageResetComputeDeps {
  bridge?: StorageBridgeLike;
  refreshStatus: () => Promise<StorageStatus | null>;
  previewDownload: () => { settings: DownloadSettings; loaded: boolean };
  /** 传入当前 tree 统计（由调用方从 store/缓存读取）。 */
  readTreeStats: () => TreeCacheStats | null;
}

/** 计划执行所需依赖：路径写入 / 树缓存 / 下载序列（不含只读计算依赖）。 */
export interface StorageResetExecuteDeps {
  setPaths: (
    patch: StoragePathPatch,
    applyNow: boolean,
  ) => Promise<
    | { ok: true; restartRequired: boolean; preflight: StoragePreflight }
    | { ok: false; error: IpcError }
  >;
  resetTreeCache: () => Promise<boolean>;
  /** 下载分支执行用的纯序列依赖（由调用方注入 store action）。 */
  downloadPath: DownloadPathResetDeps;
}

/** 计算 + 执行的完整依赖（供同时需要两者的消费方，如聚合对话框）。 */
export interface StorageResetDeps extends StorageResetComputeDeps, StorageResetExecuteDeps {}

/** 与 UI 同源的默认判定（避免在 shared 内重复常量：这些 helper 由调用方注入）。 */
export interface StorageResetPredicates {
  isCorePathsAtDefault: (status: StorageStatus | null, draftsDirty: boolean) => boolean;
  isTreeCacheAtDefault: (treeStats: TreeCacheStats | null) => boolean;
  treeBlockOf: (treeStats: TreeCacheStats | null) => StorageTreeBlock;
  downloadBlockOf: (settings: DownloadSettings, loaded: boolean) => StorageDownloadBlock;
}

/**
 * 「恢复 核心数据路径 全部默认」的目标补丁：与 `StorageSettings` 的「应用」同一套
 * preflight / 迁移对话框 / setPaths 流程共用（单一事实来源，防两处默认值漂移）。
 */
export const CORE_RESET_PATCH: StoragePathPatch = {
  mode: 'unified',
  root: '',
  categories: {},
  retainSource: false,
};

/**
 * 计算「恢复存储默认」的各块计划，返回判别结果：
 * - `unavailable`：无桥、状态不可用、或核心预检 IPC 调用失败；
 * - `allDefault`：各块均已默认（存储无事可做）；
 * - `ready`：返回计划；核心预检 IPC 成功但 `data.ok === false`（目标不可写等）仍返回计划，
 *   供对话框展示错误并禁用确认键。
 */
export async function computeStorageResetPlan(
  deps: StorageResetComputeDeps,
  predicates: StorageResetPredicates,
): Promise<StorageResetPlanResult> {
  if (!deps.bridge) {
    return { status: 'unavailable' };
  }
  const status = await deps.refreshStatus();
  if (status === null) {
    return { status: 'unavailable' };
  }
  const download = deps.previewDownload();
  const treeStats = deps.readTreeStats();
  const coreNeeded = !predicates.isCorePathsAtDefault(status, false);
  const treeBlock = predicates.treeBlockOf(treeStats);
  const downloadBlock = predicates.downloadBlockOf(download.settings, download.loaded);
  if (!coreNeeded && predicates.isTreeCacheAtDefault(treeStats) && downloadBlock === 'hidden') {
    return { status: 'allDefault' };
  }
  const blocks: StorageResetBlocks = {
    coreNeeded,
    tree: treeBlock,
    download: downloadBlock,
  };
  const migrateAtOpen = download.settings.auto_migrate_on_path_change;
  if (!coreNeeded) {
    return { status: 'ready', plan: { blocks, preflight: null, migrateAtOpen } };
  }
  const preflight = await deps.bridge.preflight(CORE_RESET_PATCH);
  if (!preflight.ok) {
    return { status: 'unavailable' };
  }
  return { status: 'ready', plan: { blocks, preflight: preflight.data, migrateAtOpen } };
}

/**
 * 按计划顺序执行恢复：核心路径 → 树缓存 → 下载路径。
 * 核心块失败即早返（其后两块不可逆且互不阻塞，全部尝试——组级「一次聚合失败」语义）；
 * 非核心块首个失败决定整体 `failedStep`（沿用组级行为，不短路后续块）；`restartRequired`
 * 透传核心块结果。下载块自身结果另经 `downloadFailure` 暴露：调用方据此在树亦失败时
 * 仍能复现下载族失败文案（R6/R9），无需从 `failedStep`（首个失败块）反推。
 */
export async function executeStorageResetPlan(
  deps: StorageResetExecuteDeps,
  plan: StorageResetExecutePlan,
  opts: { applyNow: boolean; retainSource: boolean },
): Promise<{
  result: GroupResetResult;
  restartRequired: boolean;
  downloadFailure?: Extract<DownloadPathResetResult, { ok: false }>;
  /** 核心路径预检未通过（`failedStep === 'corePathsPreflight'`）时回填的预检结果，
   *  供调用方展示 errors/warnings（无需从 setPaths 包裹层另辟旁路携带）。 */
  corePreflight?: StoragePreflight;
}> {
  const core = await applyCoreReset(deps, plan, opts);
  if (!core.result.ok) {
    return core;
  }
  // 收集失败块的完整结果：下载块是唯一携带 `error` 的块，调用方需其 `failedStep`+`error`
  // 复现下载族失败文案（R6）。
  const failures: GroupResetResult[] = [];
  if (plan.blocks.tree !== 'hidden' && !(await deps.resetTreeCache())) {
    failures.push({ ok: false, failedStep: 'treeCache' });
  }
  const download =
    plan.blocks.download === 'hidden'
      ? null
      : await resetDownloadPathToDefault(deps.downloadPath, plan.migrateAtOpen);
  const downloadFailure = download !== null && !download.ok ? download : undefined;
  if (downloadFailure) {
    failures.push(downloadFailure);
  }
  return {
    result: failures.length > 0 ? failures[0] : { ok: true },
    restartRequired: core.restartRequired,
    downloadFailure,
  };
}

/** 核心路径块（先行）：失败即早返；成功带出 `restartRequired`（无需重赋值）；
 *  预检未通过时把该 preflight 随结果带出（供调用方回填展示）。 */
async function applyCoreReset(
  deps: StorageResetExecuteDeps,
  plan: StorageResetExecutePlan,
  opts: { applyNow: boolean; retainSource: boolean },
): Promise<{
  result: GroupResetResult;
  restartRequired: boolean;
  corePreflight?: StoragePreflight;
}> {
  if (!plan.blocks.coreNeeded) {
    return { result: { ok: true }, restartRequired: false };
  }
  const applied = await deps.setPaths(
    { ...CORE_RESET_PATCH, retainSource: opts.retainSource },
    opts.applyNow,
  );
  if (!applied.ok) {
    return {
      result: { ok: false, failedStep: 'corePaths', error: applied.error },
      restartRequired: false,
    };
  }
  if (!applied.preflight.ok) {
    return {
      result: { ok: false, failedStep: 'corePathsPreflight' },
      restartRequired: false,
      corePreflight: applied.preflight,
    };
  }
  return { result: { ok: true }, restartRequired: applied.restartRequired };
}
